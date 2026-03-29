use axum::{
    Router,
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
    routing::get,
};
use futures_util::StreamExt;

use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::messages::{ClientMessage, ServerMessage};

pub fn routes() -> Router<AppState> {
    Router::new().route("/", get(ws_upgrade))
}

async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(_state): State<AppState>,
    auth: AuthUser,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, auth.user_id))
}

async fn handle_socket(mut socket: WebSocket, _user_id: uuid::Uuid) {
    while let Some(Ok(msg)) = socket.next().await {
        match msg {
            Message::Text(text) => {
                let parsed: Result<ClientMessage, _> = serde_json::from_str(&text);
                match parsed {
                    Ok(ClientMessage::Ping) => {
                        let response = serde_json::to_string(&ServerMessage::Pong).unwrap();
                        if socket.send(Message::Text(response.into())).await.is_err() {
                            break;
                        }
                    }
                    Ok(_) => {
                        // Other message types will be handled in future tasks
                    }
                    Err(e) => {
                        let error = ServerMessage::Error {
                            code: "INVALID_MESSAGE".to_string(),
                            message: e.to_string(),
                        };
                        let response = serde_json::to_string(&error).unwrap();
                        if socket.send(Message::Text(response.into())).await.is_err() {
                            break;
                        }
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
}
