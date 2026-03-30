use axum::{
    extract::{
        Path, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
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

    // Disconnect cleanup: leave() broadcasts UserLeft to remaining connections,
    // then abort() kills this connection's send task. The UserLeft message queued
    // to this connection's own tx channel is intentionally dropped — a client
    // doesn't need to hear that it left.
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
        ClientMessage::UpdateCharacterFields {
            character_id,
            fields,
        } => {
            handle_update_character_fields(state, campaign_id, user_id, role, character_id, fields)
                .await;
        }
        ClientMessage::AddCharacterBonus {
            character_id,
            field_id,
            source,
            bonus_type,
            value,
        } => {
            handle_add_character_bonus(
                state,
                campaign_id,
                user_id,
                role,
                character_id,
                field_id,
                source,
                bonus_type,
                value,
            )
            .await;
        }
        ClientMessage::RemoveCharacterBonus {
            character_id,
            bonus_id,
        } => {
            handle_remove_character_bonus(
                state,
                campaign_id,
                user_id,
                role,
                character_id,
                bonus_id,
            )
            .await;
        }
        ClientMessage::UpdateCharacterBonus {
            character_id,
            bonus_id,
            source,
            bonus_type,
            value,
        } => {
            handle_update_character_bonus(
                state,
                campaign_id,
                user_id,
                role,
                character_id,
                bonus_id,
                source,
                bonus_type,
                value,
            )
            .await;
        }
        ClientMessage::LinkTokenToCharacter {
            token_id,
            character_id,
        } => {
            handle_link_token_to_character(
                state,
                campaign_id,
                user_id,
                role,
                token_id,
                character_id,
            )
            .await;
        }
        // CRUD messages (CreateToken, DeleteDrawing, etc.) are handled via REST.
        // JoinSession, LeaveSession, RequestFullState are WS-native but not yet
        // implemented — session join/leave is managed at connection level for now.
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

/// Recompute all derived fields for a character and return the computed total for a given field.
/// Returns the computed value for `target_field_id` (0 if not present).
async fn recompute_bonus_field(
    state: &AppState,
    character_id: &Uuid,
    target_field_id: &str,
) -> Result<i64, ()> {
    let character = match db::characters::find_by_id(&state.pool, character_id).await {
        Ok(Some(c)) => c,
        Ok(None) => {
            tracing::warn!("recompute_bonus_field: character {character_id} not found");
            return Err(());
        }
        Err(e) => {
            tracing::error!("recompute_bonus_field: DB error loading character: {e}");
            return Err(());
        }
    };

    let system = match state.game_systems.get(&character.game_system_id) {
        Some(s) => s,
        None => {
            tracing::warn!(
                "recompute_bonus_field: unknown game system {}",
                character.game_system_id
            );
            return Err(());
        }
    };

    let field_rows = match db::character_fields::get_all_fields(&state.pool, character_id).await {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("recompute_bonus_field: DB error loading fields: {e}");
            return Err(());
        }
    };
    let bonus_rows =
        match db::character_bonuses::list_for_character(&state.pool, character_id).await {
            Ok(rows) => rows,
            Err(e) => {
                tracing::error!("recompute_bonus_field: DB error loading bonuses: {e}");
                return Err(());
            }
        };

    let fields = db::character_fields::rows_to_map(field_rows);
    let bonuses = db::character_bonuses::rows_to_bonus_map(bonus_rows);

    let derived = system.compute_derived(&fields, &bonuses);

    // Persist derived fields
    if let Err(e) = db::character_fields::upsert_fields(&state.pool, character_id, &derived).await {
        tracing::error!("recompute_bonus_field: failed to persist derived fields: {e}");
        return Err(());
    }

    // Return the total for the target field: derived value if present, else sum of bonuses
    if let Some(v) = derived.get(target_field_id)
        && let Some(n) = v.as_i64()
    {
        return Ok(n);
    }

    // Fall back to applying stacking directly
    let empty = vec![];
    let field_bonuses = bonuses.get(target_field_id).unwrap_or(&empty);
    Ok(system.apply_stacking(target_field_id, field_bonuses))
}

/// Check that a character belongs to the given campaign, and the user is its owner or a DM.
/// Returns `Some((char_campaign_id, owner_id))` on success, or sends an error and returns `None`.
async fn check_character_auth(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    character_id: &Uuid,
) -> Option<(Uuid, Uuid)> {
    let auth = match db::characters::get_character_auth_info(&state.pool, character_id).await {
        Ok(Some(a)) => a,
        Ok(None) => {
            let error = ServerMessage::Error {
                code: "CHARACTER_NOT_FOUND".to_string(),
                message: format!("Character {character_id} not found"),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return None;
        }
        Err(e) => {
            tracing::error!("DB error checking character auth: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to validate character ownership".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return None;
        }
    };

    let (char_campaign_id, owner_id) = auth;

    if char_campaign_id != campaign_id {
        let error = ServerMessage::Error {
            code: "CHARACTER_NOT_FOUND".to_string(),
            message: format!("Character {character_id} not found in this campaign"),
        };
        state
            .session_manager
            .send_to(campaign_id, user_id, &error)
            .await;
        return None;
    }

    if role != CampaignRole::Dm && owner_id != user_id {
        let error = ServerMessage::Error {
            code: "FORBIDDEN".to_string(),
            message: "You can only modify characters you own".to_string(),
        };
        state
            .session_manager
            .send_to(campaign_id, user_id, &error)
            .await;
        return None;
    }

    Some((char_campaign_id, owner_id))
}

async fn handle_update_character_fields(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    character_id: Uuid,
    fields: HashMap<String, serde_json::Value>,
) {
    if check_character_auth(state, campaign_id, user_id, role, &character_id)
        .await
        .is_none()
    {
        return;
    }

    // Persist raw fields
    if let Err(e) = db::character_fields::upsert_fields(&state.pool, &character_id, &fields).await {
        tracing::error!("DB error upserting character fields: {e}");
        let error = ServerMessage::Error {
            code: "INTERNAL_ERROR".to_string(),
            message: "Failed to update character fields".to_string(),
        };
        state
            .session_manager
            .send_to(campaign_id, user_id, &error)
            .await;
        return;
    }

    // Load character to get game system
    let character = match db::characters::find_by_id(&state.pool, &character_id).await {
        Ok(Some(c)) => c,
        _ => {
            tracing::error!("handle_update_character_fields: character {character_id} vanished");
            return;
        }
    };

    if let Some(system) = state.game_systems.get(&character.game_system_id) {
        let field_rows =
            match db::character_fields::get_all_fields(&state.pool, &character_id).await {
                Ok(rows) => rows,
                Err(e) => {
                    tracing::error!("Failed to reload fields for derived compute: {e}");
                    return;
                }
            };
        let bonus_rows =
            match db::character_bonuses::list_for_character(&state.pool, &character_id).await {
                Ok(rows) => rows,
                Err(e) => {
                    tracing::error!("Failed to load bonuses for derived compute: {e}");
                    return;
                }
            };

        let all_fields = db::character_fields::rows_to_map(field_rows);
        let bonus_map = db::character_bonuses::rows_to_bonus_map(bonus_rows);
        let derived = system.compute_derived(&all_fields, &bonus_map);

        if let Err(e) =
            db::character_fields::upsert_fields(&state.pool, &character_id, &derived).await
        {
            tracing::error!("Failed to persist derived fields: {e}");
        }

        // Merge raw + derived for broadcast
        let mut broadcast_fields = all_fields;
        broadcast_fields.extend(derived);

        let msg = ServerMessage::CharacterFieldsUpdated {
            character_id,
            fields: broadcast_fields,
            updated_by: user_id,
        };
        state
            .session_manager
            .broadcast(campaign_id, &msg, None)
            .await;
    } else {
        // No game system — just broadcast the raw fields
        let msg = ServerMessage::CharacterFieldsUpdated {
            character_id,
            fields,
            updated_by: user_id,
        };
        state
            .session_manager
            .broadcast(campaign_id, &msg, None)
            .await;
    }
}

#[allow(clippy::too_many_arguments)]
async fn handle_add_character_bonus(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    character_id: Uuid,
    field_id: String,
    source: String,
    bonus_type: String,
    value: i64,
) {
    if check_character_auth(state, campaign_id, user_id, role, &character_id)
        .await
        .is_none()
    {
        return;
    }

    let bonus_row = match db::character_bonuses::add_bonus(
        &state.pool,
        &character_id,
        &field_id,
        &source,
        &bonus_type,
        value as i32,
    )
    .await
    {
        Ok(row) => row,
        Err(e) => {
            tracing::error!("DB error adding character bonus: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to add character bonus".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    };

    let computed_total = recompute_bonus_field(state, &character_id, &field_id)
        .await
        .unwrap_or(0);

    let bonus_entry = htbd_core::game_system::BonusEntry {
        id: bonus_row.id,
        source: bonus_row.source,
        bonus_type: bonus_row.bonus_type,
        value: bonus_row.value as i64,
    };

    let msg = ServerMessage::CharacterBonusAdded {
        character_id,
        field_id,
        bonus: bonus_entry,
        computed_total,
    };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;
}

async fn handle_remove_character_bonus(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    character_id: Uuid,
    bonus_id: Uuid,
) {
    // Find the bonus to get field_id
    let bonus_row = match db::character_bonuses::find_bonus_by_id(&state.pool, &bonus_id).await {
        Ok(Some(row)) => row,
        Ok(None) => {
            let error = ServerMessage::Error {
                code: "BONUS_NOT_FOUND".to_string(),
                message: format!("Bonus {bonus_id} not found"),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
        Err(e) => {
            tracing::error!("DB error finding bonus: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to find bonus".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    };

    let field_id = bonus_row.field_id.clone();

    if check_character_auth(state, campaign_id, user_id, role, &character_id)
        .await
        .is_none()
    {
        return;
    }

    match db::character_bonuses::delete_bonus(&state.pool, &bonus_id).await {
        Ok(true) => {}
        Ok(false) => {
            let error = ServerMessage::Error {
                code: "BONUS_NOT_FOUND".to_string(),
                message: format!("Bonus {bonus_id} not found during delete"),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
        Err(e) => {
            tracing::error!("DB error deleting bonus: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to delete bonus".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    }

    let computed_total = recompute_bonus_field(state, &character_id, &field_id)
        .await
        .unwrap_or(0);

    let msg = ServerMessage::CharacterBonusRemoved {
        character_id,
        bonus_id,
        field_id,
        computed_total,
    };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;
}

#[allow(clippy::too_many_arguments)]
async fn handle_update_character_bonus(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    character_id: Uuid,
    bonus_id: Uuid,
    source: Option<String>,
    bonus_type: Option<String>,
    value: Option<i64>,
) {
    // Find bonus to get field_id
    let existing = match db::character_bonuses::find_bonus_by_id(&state.pool, &bonus_id).await {
        Ok(Some(row)) => row,
        Ok(None) => {
            let error = ServerMessage::Error {
                code: "BONUS_NOT_FOUND".to_string(),
                message: format!("Bonus {bonus_id} not found"),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
        Err(e) => {
            tracing::error!("DB error finding bonus for update: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to find bonus".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    };

    let field_id = existing.field_id.clone();

    if check_character_auth(state, campaign_id, user_id, role, &character_id)
        .await
        .is_none()
    {
        return;
    }

    let updated_row = match db::character_bonuses::update_bonus(
        &state.pool,
        &bonus_id,
        source.as_deref(),
        bonus_type.as_deref(),
        value.map(|v| v as i32),
    )
    .await
    {
        Ok(Some(row)) => row,
        Ok(None) => {
            let error = ServerMessage::Error {
                code: "BONUS_NOT_FOUND".to_string(),
                message: format!("Bonus {bonus_id} not found during update"),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
        Err(e) => {
            tracing::error!("DB error updating bonus: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to update bonus".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    };

    let computed_total = recompute_bonus_field(state, &character_id, &field_id)
        .await
        .unwrap_or(0);

    let bonus_entry = htbd_core::game_system::BonusEntry {
        id: updated_row.id,
        source: updated_row.source,
        bonus_type: updated_row.bonus_type,
        value: updated_row.value as i64,
    };

    let msg = ServerMessage::CharacterBonusUpdated {
        character_id,
        bonus: bonus_entry,
        field_id,
        computed_total,
    };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;
}

async fn handle_link_token_to_character(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    token_id: Uuid,
    character_id: Option<Uuid>,
) {
    // Only DM can link tokens to characters
    if role != CampaignRole::Dm {
        let error = ServerMessage::Error {
            code: "FORBIDDEN".to_string(),
            message: "Only the DM can link tokens to characters".to_string(),
        };
        state
            .session_manager
            .send_to(campaign_id, user_id, &error)
            .await;
        return;
    }

    let result: Result<sqlx::postgres::PgQueryResult, sqlx::Error> =
        sqlx::query("UPDATE tokens SET character_id = $2, updated_at = now() WHERE id = $1")
            .bind(token_id)
            .bind(character_id)
            .execute(&state.pool)
            .await;

    match result {
        Ok(r) if r.rows_affected() == 0 => {
            let error = ServerMessage::Error {
                code: "TOKEN_NOT_FOUND".to_string(),
                message: format!("Token {token_id} not found"),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
        }
        Ok(_) => {
            let msg = ServerMessage::TokenCharacterLinked {
                token_id,
                character_id,
            };
            state
                .session_manager
                .broadcast(campaign_id, &msg, None)
                .await;
        }
        Err(e) => {
            tracing::error!("DB error linking token to character: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to link token to character".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
        }
    }
}
