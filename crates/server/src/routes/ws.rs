use axum::{
    extract::{
        Path, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::session::ConnectionHandle;
use crate::state::AppState;
use htbd_core::messages::{ClientMessage, ConnectedUser, ServerMessage};
use htbd_core::models::CampaignRole;

/// WebSocket upgrade handler for campaign-scoped connections.
///
/// Route: `GET /api/ws/{campaign_id}`
///
/// Validates JWT, checks campaign membership, then upgrades to WebSocket.
pub async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    auth: AuthUser,
    Path(campaign_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let user_id = auth.user_id;

    // Verify campaign membership and get role
    let role_str = db::campaigns::get_member_role(&state.pool, campaign_id, user_id)
        .await?
        .ok_or(AppError::Forbidden)?;

    let role: CampaignRole = role_str.parse().unwrap_or(CampaignRole::Player);

    // Look up display name
    let user = db::users::find_by_id(&state.pool, user_id)
        .await?
        .ok_or(AppError::NotFound)?;

    let display_name = user.display_name;

    Ok(ws.on_upgrade(move |socket| {
        handle_socket(socket, state, campaign_id, user_id, display_name, role)
    }))
}

async fn handle_socket(
    socket: WebSocket,
    state: AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    display_name: String,
    role: CampaignRole,
) {
    let (ws_sink, mut ws_stream) = socket.split();

    // Create mpsc channel to bridge SessionManager -> WebSocket sink
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<ServerMessage>();
    let connection_id = Uuid::new_v4();

    let conn = ConnectionHandle {
        connection_id,
        user_id,
        display_name: display_name.clone(),
        role,
        tx,
    };

    // Join the session
    let connected_users = state.session_manager.join(campaign_id, conn).await;

    // Send SessionJoined to this client
    let session_joined = ServerMessage::SessionJoined {
        user_id,
        campaign_id,
        connected_users: connected_users
            .into_iter()
            .map(|u| ConnectedUser {
                user_id: u.user_id,
                display_name: u.display_name,
                role: u.role.to_string(),
            })
            .collect(),
    };

    // Spawn send task: forwards messages from mpsc rx to WebSocket sink
    let send_task = tokio::spawn(async move {
        let mut ws_sink = ws_sink;

        // Send the initial SessionJoined message
        let json = serde_json::to_string(&session_joined).unwrap();
        if ws_sink.send(Message::Text(json.into())).await.is_err() {
            return;
        }

        // Forward all subsequent messages from the channel
        while let Some(msg) = rx.recv().await {
            let json = serde_json::to_string(&msg).unwrap();
            if ws_sink.send(Message::Text(json.into())).await.is_err() {
                break;
            }
        }
    });

    // Read loop: process incoming WebSocket messages
    while let Some(Ok(msg)) = ws_stream.next().await {
        match msg {
            Message::Text(text) => {
                let parsed: Result<ClientMessage, _> = serde_json::from_str(&text);
                match parsed {
                    Ok(client_msg) => {
                        handle_client_message(&state, campaign_id, user_id, role, client_msg).await;
                    }
                    Err(e) => {
                        let error = ServerMessage::Error {
                            code: "INVALID_MESSAGE".to_string(),
                            message: e.to_string(),
                        };
                        state
                            .session_manager
                            .send_to(campaign_id, user_id, &error)
                            .await;
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    // Disconnect cleanup
    state
        .session_manager
        .leave(campaign_id, user_id, connection_id)
        .await;

    send_task.abort();
}

async fn handle_client_message(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    msg: ClientMessage,
) {
    match msg {
        ClientMessage::Ping => {
            state
                .session_manager
                .send_to(campaign_id, user_id, &ServerMessage::Pong)
                .await;
        }
        ClientMessage::MoveToken { token_id, x, y } => {
            handle_move_token(state, campaign_id, user_id, role, token_id, x, y).await;
        }
        // All other message types are handled through REST endpoints
        _ => {}
    }
}

async fn handle_move_token(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    token_id: Uuid,
    x: f32,
    y: f32,
) {
    // Validate ownership: DM can move any token, players only their own
    let auth_info = match db::tokens::get_token_auth_info(&state.pool, &token_id).await {
        Ok(Some(info)) => info,
        Ok(None) => {
            let error = ServerMessage::Error {
                code: "TOKEN_NOT_FOUND".to_string(),
                message: format!("Token {token_id} not found"),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
        Err(e) => {
            tracing::error!("DB error looking up token auth info: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to validate token ownership".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    };

    let (_layer_id, owner_id) = auth_info;

    // Players can only move tokens they own
    if role != CampaignRole::Dm && owner_id != Some(user_id) {
        let error = ServerMessage::Error {
            code: "FORBIDDEN".to_string(),
            message: "You can only move tokens you own".to_string(),
        };
        state
            .session_manager
            .send_to(campaign_id, user_id, &error)
            .await;
        return;
    }

    // Persist position change
    match db::tokens::update_token_position(&state.pool, &token_id, x, y).await {
        Ok(Some(_)) => {
            // Broadcast TokenMoved to all session members
            let moved = ServerMessage::TokenMoved {
                token_id,
                x,
                y,
                moved_by: user_id,
            };
            state
                .session_manager
                .broadcast(campaign_id, &moved, None)
                .await;
        }
        Ok(None) => {
            let error = ServerMessage::Error {
                code: "TOKEN_NOT_FOUND".to_string(),
                message: format!("Token {token_id} not found during update"),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
        }
        Err(e) => {
            tracing::error!("DB error updating token position: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to update token position".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
        }
    }
}
