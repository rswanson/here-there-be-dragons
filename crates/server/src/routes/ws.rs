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
        ClientMessage::SendChatMessage {
            character_id,
            message_type,
            content,
            whisper_target_ids,
        } => {
            handle_send_chat_message(
                state,
                campaign_id,
                user_id,
                role,
                character_id,
                message_type,
                content,
                whisper_target_ids,
            )
            .await;
        }
        ClientMessage::StartEncounter { combatants } => {
            handle_start_encounter(state, campaign_id, user_id, role, combatants).await;
        }
        ClientMessage::AddCombatant {
            encounter_id,
            character_id,
            name,
            initiative_value,
        } => {
            handle_add_combatant(
                state,
                campaign_id,
                user_id,
                role,
                encounter_id,
                character_id,
                name,
                initiative_value,
            )
            .await;
        }
        ClientMessage::RemoveCombatant { combatant_id } => {
            handle_remove_combatant(state, campaign_id, user_id, role, combatant_id).await;
        }
        ClientMessage::UpdateCombatantInitiative {
            combatant_id,
            initiative_value,
        } => {
            handle_update_combatant_initiative(
                state,
                campaign_id,
                user_id,
                role,
                combatant_id,
                initiative_value,
            )
            .await;
        }
        ClientMessage::RollAllInitiative { encounter_id } => {
            handle_roll_all_initiative(state, campaign_id, user_id, role, encounter_id).await;
        }
        ClientMessage::RollCombatantInitiative { combatant_id } => {
            handle_roll_combatant_initiative(state, campaign_id, user_id, role, combatant_id).await;
        }
        ClientMessage::NextTurn { encounter_id } => {
            handle_next_turn(state, campaign_id, user_id, role, encounter_id).await;
        }
        ClientMessage::PreviousTurn { encounter_id } => {
            handle_previous_turn(state, campaign_id, user_id, role, encounter_id).await;
        }
        ClientMessage::EndEncounter { encounter_id } => {
            handle_end_encounter(state, campaign_id, user_id, role, encounter_id).await;
        }
        ClientMessage::CreateWalls { map_id, walls } => {
            handle_create_walls(state, campaign_id, user_id, role, map_id, walls).await;
        }
        ClientMessage::UpdateWall { wall_id, patch } => {
            handle_update_wall_ws(state, campaign_id, user_id, role, wall_id, patch).await;
        }
        ClientMessage::DeleteWalls { wall_ids } => {
            handle_delete_walls(state, campaign_id, user_id, role, wall_ids).await;
        }
        ClientMessage::ToggleDoor { wall_id } => {
            handle_toggle_door(state, campaign_id, user_id, role, wall_id).await;
        }
        ClientMessage::RevealFog {
            map_id,
            cells,
            revealed,
        } => {
            handle_reveal_fog(state, campaign_id, user_id, role, map_id, cells, revealed).await;
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

#[allow(clippy::too_many_arguments)]
async fn handle_send_chat_message(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    _role: CampaignRole,
    character_id: Option<Uuid>,
    message_type: String,
    content: String,
    whisper_target_ids: Vec<Uuid>,
) {
    // Validate content is not empty
    if content.trim().is_empty() {
        let error = ServerMessage::Error {
            code: "BAD_REQUEST".to_string(),
            message: "Message content cannot be empty".to_string(),
        };
        state
            .session_manager
            .send_to(campaign_id, user_id, &error)
            .await;
        return;
    }

    // If character_id is provided, verify it belongs to the sender
    if let Some(char_id) = character_id {
        match db::characters::get_character_auth_info(&state.pool, &char_id).await {
            Ok(Some((char_campaign_id, owner_id))) => {
                if char_campaign_id != campaign_id || owner_id != user_id {
                    let error = ServerMessage::Error {
                        code: "FORBIDDEN".to_string(),
                        message: "Character does not belong to you in this campaign".to_string(),
                    };
                    state
                        .session_manager
                        .send_to(campaign_id, user_id, &error)
                        .await;
                    return;
                }
            }
            Ok(None) => {
                let error = ServerMessage::Error {
                    code: "CHARACTER_NOT_FOUND".to_string(),
                    message: format!("Character {char_id} not found"),
                };
                state
                    .session_manager
                    .send_to(campaign_id, user_id, &error)
                    .await;
                return;
            }
            Err(e) => {
                tracing::error!("DB error checking character auth for chat: {e}");
                let error = ServerMessage::Error {
                    code: "INTERNAL_ERROR".to_string(),
                    message: "Failed to validate character ownership".to_string(),
                };
                state
                    .session_manager
                    .send_to(campaign_id, user_id, &error)
                    .await;
                return;
            }
        }
    }

    // Persist the message
    let row = match db::chat_messages::insert_message(
        &state.pool,
        &campaign_id,
        &user_id,
        character_id.as_ref(),
        &message_type,
        &content,
        &whisper_target_ids,
    )
    .await
    {
        Ok(row) => row,
        Err(e) => {
            tracing::error!("DB error inserting chat message: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to save message".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    };

    // Look up sender display name
    let sender_display_name = match db::users::find_by_id(&state.pool, user_id).await {
        Ok(Some(u)) => u.display_name,
        Ok(None) => String::new(),
        Err(e) => {
            tracing::error!("DB error looking up sender display name: {e}");
            String::new()
        }
    };

    // Look up character name if character_id is set
    let character_name = if let Some(char_id) = character_id {
        match db::characters::find_by_id(&state.pool, &char_id).await {
            Ok(Some(c)) => Some(c.name),
            Ok(None) => None,
            Err(e) => {
                tracing::error!("DB error looking up character name: {e}");
                None
            }
        }
    } else {
        None
    };

    // Parse message type for the struct
    let parsed_message_type = match row.message_type.parse::<htbd_core::chat::ChatMessageType>() {
        Ok(t) => t,
        Err(_) => {
            tracing::error!("Unknown message type stored: {}", row.message_type);
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to parse message type".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    };

    let chat_message = htbd_core::chat::ChatMessage {
        id: row.id,
        campaign_id: row.campaign_id,
        sender_user_id: row.sender_user_id,
        sender_display_name,
        character_id: row.character_id,
        character_name,
        message_type: parsed_message_type,
        content: row.content,
        whisper_target_ids: row.whisper_target_ids.clone(),
        created_at: row.created_at,
    };

    let msg = ServerMessage::ChatMessageReceived {
        message: chat_message,
    };

    // For whispers: send to sender + each target; for non-whispers: broadcast to all
    if message_type == "whisper" {
        state
            .session_manager
            .send_to(campaign_id, user_id, &msg)
            .await;
        for target_id in &row.whisper_target_ids {
            state
                .session_manager
                .send_to(campaign_id, *target_id, &msg)
                .await;
        }
    } else {
        state
            .session_manager
            .broadcast(campaign_id, &msg, None)
            .await;
    }
}

/// Returns `true` if the user is a DM; otherwise sends FORBIDDEN error and returns `false`.
async fn require_dm(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    action: &str,
) -> bool {
    if role != CampaignRole::Dm {
        let error = ServerMessage::Error {
            code: "FORBIDDEN".to_string(),
            message: format!("Only the DM can {action}"),
        };
        state
            .session_manager
            .send_to(campaign_id, user_id, &error)
            .await;
        return false;
    }
    true
}

async fn handle_start_encounter(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    combatants: Vec<htbd_core::initiative::NewCombatant>,
) {
    if !require_dm(state, campaign_id, user_id, role, "start an encounter").await {
        return;
    }

    // Deactivate any existing active encounter
    match db::initiative::get_active_encounter(&state.pool, &campaign_id).await {
        Ok(Some(existing)) => {
            if let Err(e) = db::initiative::deactivate_encounter(&state.pool, &existing.id).await {
                tracing::error!("Failed to deactivate existing encounter: {e}");
                let error = ServerMessage::Error {
                    code: "INTERNAL_ERROR".to_string(),
                    message: "Failed to end existing encounter".to_string(),
                };
                state
                    .session_manager
                    .send_to(campaign_id, user_id, &error)
                    .await;
                return;
            }
        }
        Ok(None) => {}
        Err(e) => {
            tracing::error!("DB error checking active encounter: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to check for existing encounter".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    }

    // Create new encounter
    let enc_row = match db::initiative::create_encounter(&state.pool, &campaign_id).await {
        Ok(row) => row,
        Err(e) => {
            tracing::error!("DB error creating encounter: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to create encounter".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    };

    // Add each combatant
    for (idx, c) in combatants.iter().enumerate() {
        if let Err(e) = db::initiative::add_combatant(
            &state.pool,
            &enc_row.id,
            c.character_id.as_ref(),
            &c.name,
            c.initiative_value,
            idx as i32,
        )
        .await
        {
            tracing::error!("DB error adding combatant: {e}");
        }
    }

    // Load all combatants
    let combatant_rows = match db::initiative::list_combatants(&state.pool, &enc_row.id).await {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("DB error loading combatants: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to load encounter combatants".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    };

    let encounter = db::initiative::rows_to_encounter(enc_row, combatant_rows);
    let msg = ServerMessage::EncounterStarted { encounter };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;
}

#[allow(clippy::too_many_arguments)]
async fn handle_add_combatant(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    encounter_id: Uuid,
    character_id: Option<Uuid>,
    name: String,
    initiative_value: i32,
) {
    if !require_dm(state, campaign_id, user_id, role, "add a combatant").await {
        return;
    }

    // Verify encounter exists and belongs to this campaign
    let enc = match db::initiative::get_active_encounter(&state.pool, &campaign_id).await {
        Ok(Some(e)) if e.id == encounter_id => e,
        Ok(_) => {
            let error = ServerMessage::Error {
                code: "ENCOUNTER_NOT_FOUND".to_string(),
                message: format!("Active encounter {encounter_id} not found for this campaign"),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
        Err(e) => {
            tracing::error!("DB error looking up encounter: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to verify encounter".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    };

    // Get current combatant count for sort_order
    let current_count = match db::initiative::list_combatants(&state.pool, &enc.id).await {
        Ok(rows) => rows.len() as i32,
        Err(e) => {
            tracing::error!("DB error counting combatants: {e}");
            0
        }
    };

    let row = match db::initiative::add_combatant(
        &state.pool,
        &encounter_id,
        character_id.as_ref(),
        &name,
        initiative_value,
        current_count,
    )
    .await
    {
        Ok(row) => row,
        Err(e) => {
            tracing::error!("DB error adding combatant: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to add combatant".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    };

    let combatant = db::initiative::row_to_combatant(row);
    let msg = ServerMessage::CombatantAdded { combatant };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;
}

async fn handle_remove_combatant(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    combatant_id: Uuid,
) {
    if !require_dm(state, campaign_id, user_id, role, "remove a combatant").await {
        return;
    }

    // Verify combatant's encounter belongs to this campaign
    let enc_id = match db::initiative::get_combatant_encounter_id(&state.pool, &combatant_id).await
    {
        Ok(Some(id)) => id,
        Ok(None) => {
            let error = ServerMessage::Error {
                code: "COMBATANT_NOT_FOUND".to_string(),
                message: format!("Combatant {combatant_id} not found"),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
        Err(e) => {
            tracing::error!("DB error finding combatant: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to verify combatant".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    };

    // Verify that the encounter belongs to this campaign
    match db::initiative::get_active_encounter(&state.pool, &campaign_id).await {
        Ok(Some(enc)) if enc.id == enc_id => {}
        Ok(_) => {
            let error = ServerMessage::Error {
                code: "FORBIDDEN".to_string(),
                message: "Combatant does not belong to an active encounter in this campaign"
                    .to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
        Err(e) => {
            tracing::error!("DB error verifying encounter: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to verify encounter ownership".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    }

    match db::initiative::remove_combatant(&state.pool, &combatant_id).await {
        Ok(true) => {
            let msg = ServerMessage::CombatantRemoved { combatant_id };
            state
                .session_manager
                .broadcast(campaign_id, &msg, None)
                .await;
        }
        Ok(false) => {
            let error = ServerMessage::Error {
                code: "COMBATANT_NOT_FOUND".to_string(),
                message: format!("Combatant {combatant_id} not found during delete"),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
        }
        Err(e) => {
            tracing::error!("DB error removing combatant: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to remove combatant".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
        }
    }
}

async fn handle_update_combatant_initiative(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    combatant_id: Uuid,
    initiative_value: i32,
) {
    if !require_dm(
        state,
        campaign_id,
        user_id,
        role,
        "update combatant initiative",
    )
    .await
    {
        return;
    }

    // Fetch current combatant to preserve sort_order
    let existing = match db::initiative::find_combatant_by_id(&state.pool, &combatant_id).await {
        Ok(Some(row)) => row,
        Ok(None) => {
            let error = ServerMessage::Error {
                code: "COMBATANT_NOT_FOUND".to_string(),
                message: format!("Combatant {combatant_id} not found"),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
        Err(e) => {
            tracing::error!("DB error finding combatant: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to find combatant".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    };

    match db::initiative::update_combatant_initiative(
        &state.pool,
        &combatant_id,
        initiative_value,
        existing.sort_order,
    )
    .await
    {
        Ok(Some(updated)) => {
            let msg = ServerMessage::CombatantInitiativeUpdated {
                combatant_id,
                initiative_value: updated.initiative_value,
                sort_order: updated.sort_order,
            };
            state
                .session_manager
                .broadcast(campaign_id, &msg, None)
                .await;
        }
        Ok(None) => {
            let error = ServerMessage::Error {
                code: "COMBATANT_NOT_FOUND".to_string(),
                message: format!("Combatant {combatant_id} not found during update"),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
        }
        Err(e) => {
            tracing::error!("DB error updating combatant initiative: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to update combatant initiative".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
        }
    }
}

/// Get the initiative modifier for a character from its fields and game system.
/// Returns 0 if the character, system, or tiebreaker field cannot be found.
async fn get_initiative_modifier(state: &AppState, character_id: &Uuid) -> i32 {
    let character = match db::characters::find_by_id(&state.pool, character_id).await {
        Ok(Some(c)) => c,
        _ => return 0,
    };

    let system = match state.game_systems.get(&character.game_system_id) {
        Some(s) => s,
        None => return 0,
    };

    let rules = system.initiative_rules();
    let tiebreaker_field = match rules.tiebreaker_field {
        Some(f) => f,
        None => return 0,
    };

    let field_rows = match db::character_fields::get_all_fields(&state.pool, character_id).await {
        Ok(rows) => rows,
        Err(_) => return 0,
    };
    let fields = db::character_fields::rows_to_map(field_rows);

    fields
        .get(&tiebreaker_field)
        .and_then(|v| v.as_i64())
        .map(|n| n as i32)
        .unwrap_or(0)
}

async fn handle_roll_all_initiative(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    encounter_id: Uuid,
) {
    if !require_dm(state, campaign_id, user_id, role, "roll initiative").await {
        return;
    }

    // Load combatants
    let combatant_rows = match db::initiative::list_combatants(&state.pool, &encounter_id).await {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("DB error loading combatants for roll-all: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to load combatants".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    };

    // Roll initiative for each combatant (character-linked ones use game system)
    let mut combatants_with_values: Vec<(db::initiative::CombatantRow, i32)> = Vec::new();
    for row in combatant_rows {
        let rolled_value = if let Some(ref char_id) = row.character_id {
            let character = db::characters::find_by_id(&state.pool, char_id).await;
            if let Ok(Some(ref c)) = character {
                if let Some(system) = state.game_systems.get(&c.game_system_id) {
                    let rules = system.initiative_rules();
                    let modifier = get_initiative_modifier(state, char_id).await;
                    htbd_core::initiative::roll_initiative(&rules.roll_expression, modifier)
                        .unwrap_or(row.initiative_value)
                } else {
                    row.initiative_value
                }
            } else {
                row.initiative_value
            }
        } else {
            row.initiative_value
        };
        combatants_with_values.push((row, rolled_value));
    }

    // Sort by initiative_value descending
    combatants_with_values.sort_by(|a, b| b.1.cmp(&a.1));

    // Persist updated values and sort_orders
    let mut final_combatants = Vec::new();
    for (sort_order, (row, new_value)) in combatants_with_values.into_iter().enumerate() {
        match db::initiative::update_combatant_initiative(
            &state.pool,
            &row.id,
            new_value,
            sort_order as i32,
        )
        .await
        {
            Ok(Some(updated)) => {
                final_combatants.push(db::initiative::row_to_combatant(updated));
            }
            Ok(None) => {
                tracing::warn!("Combatant {} disappeared during roll-all", row.id);
            }
            Err(e) => {
                tracing::error!("DB error persisting initiative roll for {}: {e}", row.id);
                // Use stale row as fallback
                final_combatants.push(db::initiative::row_to_combatant(row));
            }
        }
    }

    let msg = ServerMessage::AllInitiativeRolled {
        combatants: final_combatants,
    };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;
}

async fn handle_roll_combatant_initiative(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    combatant_id: Uuid,
) {
    if !require_dm(
        state,
        campaign_id,
        user_id,
        role,
        "roll combatant initiative",
    )
    .await
    {
        return;
    }

    let row = match db::initiative::find_combatant_by_id(&state.pool, &combatant_id).await {
        Ok(Some(row)) => row,
        Ok(None) => {
            let error = ServerMessage::Error {
                code: "COMBATANT_NOT_FOUND".to_string(),
                message: format!("Combatant {combatant_id} not found"),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
        Err(e) => {
            tracing::error!("DB error finding combatant: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to find combatant".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    };

    let new_value = if let Some(ref char_id) = row.character_id {
        let character = db::characters::find_by_id(&state.pool, char_id).await;
        if let Ok(Some(ref c)) = character {
            if let Some(system) = state.game_systems.get(&c.game_system_id) {
                let rules = system.initiative_rules();
                let modifier = get_initiative_modifier(state, char_id).await;
                htbd_core::initiative::roll_initiative(&rules.roll_expression, modifier)
                    .unwrap_or(row.initiative_value)
            } else {
                row.initiative_value
            }
        } else {
            row.initiative_value
        }
    } else {
        row.initiative_value
    };

    match db::initiative::update_combatant_initiative(
        &state.pool,
        &combatant_id,
        new_value,
        row.sort_order,
    )
    .await
    {
        Ok(Some(updated)) => {
            let msg = ServerMessage::CombatantInitiativeUpdated {
                combatant_id,
                initiative_value: updated.initiative_value,
                sort_order: updated.sort_order,
            };
            state
                .session_manager
                .broadcast(campaign_id, &msg, None)
                .await;
        }
        Ok(None) => {
            let error = ServerMessage::Error {
                code: "COMBATANT_NOT_FOUND".to_string(),
                message: format!("Combatant {combatant_id} not found during update"),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
        }
        Err(e) => {
            tracing::error!("DB error updating combatant initiative: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to update combatant initiative".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
        }
    }
}

async fn handle_next_turn(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    encounter_id: Uuid,
) {
    if !require_dm(state, campaign_id, user_id, role, "advance the turn").await {
        return;
    }

    // Load encounter
    let enc = match db::initiative::get_active_encounter(&state.pool, &campaign_id).await {
        Ok(Some(e)) if e.id == encounter_id => e,
        Ok(_) => {
            let error = ServerMessage::Error {
                code: "ENCOUNTER_NOT_FOUND".to_string(),
                message: format!("Active encounter {encounter_id} not found"),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
        Err(e) => {
            tracing::error!("DB error loading encounter: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to load encounter".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    };

    let combatants = match db::initiative::list_combatants(&state.pool, &encounter_id).await {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("DB error loading combatants: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to load combatants".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    };

    let active_indices: Vec<usize> = combatants
        .iter()
        .enumerate()
        .filter(|(_, c)| c.is_active)
        .map(|(i, _)| i)
        .collect();

    if active_indices.is_empty() {
        let error = ServerMessage::Error {
            code: "NO_ACTIVE_COMBATANTS".to_string(),
            message: "No active combatants in encounter".to_string(),
        };
        state
            .session_manager
            .send_to(campaign_id, user_id, &error)
            .await;
        return;
    }

    let current = enc.current_turn_index as usize;
    // Find next active combatant after current
    let next_active = active_indices.iter().find(|&&i| i > current).copied();

    let (new_turn_index, new_round) = if let Some(next) = next_active {
        (next as i32, enc.round_number)
    } else {
        // Wrap around: new round, start at first active
        (active_indices[0] as i32, enc.round_number + 1)
    };

    if let Err(e) =
        db::initiative::update_encounter_turn(&state.pool, &encounter_id, new_turn_index, new_round)
            .await
    {
        tracing::error!("DB error updating encounter turn: {e}");
        let error = ServerMessage::Error {
            code: "INTERNAL_ERROR".to_string(),
            message: "Failed to advance turn".to_string(),
        };
        state
            .session_manager
            .send_to(campaign_id, user_id, &error)
            .await;
        return;
    }

    let msg = ServerMessage::TurnAdvanced {
        current_turn_index: new_turn_index,
        round_number: new_round,
    };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;
}

async fn handle_previous_turn(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    encounter_id: Uuid,
) {
    if !require_dm(state, campaign_id, user_id, role, "go to previous turn").await {
        return;
    }

    // Load encounter
    let enc = match db::initiative::get_active_encounter(&state.pool, &campaign_id).await {
        Ok(Some(e)) if e.id == encounter_id => e,
        Ok(_) => {
            let error = ServerMessage::Error {
                code: "ENCOUNTER_NOT_FOUND".to_string(),
                message: format!("Active encounter {encounter_id} not found"),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
        Err(e) => {
            tracing::error!("DB error loading encounter: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to load encounter".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    };

    let combatants = match db::initiative::list_combatants(&state.pool, &encounter_id).await {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("DB error loading combatants: {e}");
            let error = ServerMessage::Error {
                code: "INTERNAL_ERROR".to_string(),
                message: "Failed to load combatants".to_string(),
            };
            state
                .session_manager
                .send_to(campaign_id, user_id, &error)
                .await;
            return;
        }
    };

    let active_indices: Vec<usize> = combatants
        .iter()
        .enumerate()
        .filter(|(_, c)| c.is_active)
        .map(|(i, _)| i)
        .collect();

    if active_indices.is_empty() {
        let error = ServerMessage::Error {
            code: "NO_ACTIVE_COMBATANTS".to_string(),
            message: "No active combatants in encounter".to_string(),
        };
        state
            .session_manager
            .send_to(campaign_id, user_id, &error)
            .await;
        return;
    }

    let current = enc.current_turn_index as usize;
    // Find previous active combatant before current
    let prev_active = active_indices.iter().rev().find(|&&i| i < current).copied();

    let (new_turn_index, new_round) = if let Some(prev) = prev_active {
        (prev as i32, enc.round_number)
    } else if enc.round_number > 1 {
        // Go back a round: land on last active combatant of previous round
        (*active_indices.last().unwrap() as i32, enc.round_number - 1)
    } else {
        // Already at the very start: stay put
        (enc.current_turn_index, enc.round_number)
    };

    if let Err(e) =
        db::initiative::update_encounter_turn(&state.pool, &encounter_id, new_turn_index, new_round)
            .await
    {
        tracing::error!("DB error updating encounter turn: {e}");
        let error = ServerMessage::Error {
            code: "INTERNAL_ERROR".to_string(),
            message: "Failed to go to previous turn".to_string(),
        };
        state
            .session_manager
            .send_to(campaign_id, user_id, &error)
            .await;
        return;
    }

    let msg = ServerMessage::TurnAdvanced {
        current_turn_index: new_turn_index,
        round_number: new_round,
    };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;
}

async fn handle_end_encounter(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    encounter_id: Uuid,
) {
    if !require_dm(state, campaign_id, user_id, role, "end an encounter").await {
        return;
    }

    if let Err(e) = db::initiative::deactivate_encounter(&state.pool, &encounter_id).await {
        tracing::error!("DB error ending encounter: {e}");
        let error = ServerMessage::Error {
            code: "INTERNAL_ERROR".to_string(),
            message: "Failed to end encounter".to_string(),
        };
        state
            .session_manager
            .send_to(campaign_id, user_id, &error)
            .await;
        return;
    }

    let msg = ServerMessage::EncounterEnded { encounter_id };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;
}

async fn handle_toggle_door(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    wall_id: Uuid,
) {
    let wall_row = match db::walls::find_by_id(&state.pool, &wall_id).await {
        Ok(Some(w)) => w,
        _ => return,
    };

    // Not a door or secret_door: ignore
    if wall_row.wall_type == "wall" {
        return;
    }

    // Secret doors: only DM can interact
    if wall_row.wall_type == "secret_door" && role != CampaignRole::Dm {
        return;
    }

    // Check player_door_control map setting
    if role != CampaignRole::Dm
        && let Ok(Some(map_row)) = db::maps::find_by_id(&state.pool, &wall_row.map_id).await
        && !map_row.player_door_control
    {
        return;
    }

    // Locked door: players can't open — send DoorLocked to requester only
    if wall_row.door_state == "locked" && role != CampaignRole::Dm {
        let msg = ServerMessage::DoorLocked { wall_id };
        state
            .session_manager
            .send_to(campaign_id, user_id, &msg)
            .await;
        return;
    }

    // DM: cycle open → locked → closed → open
    // Player: toggle between open and closed
    let new_state = if role == CampaignRole::Dm {
        match wall_row.door_state.as_str() {
            "closed" => "open",
            "open" => "locked",
            "locked" => "closed",
            _ => "closed",
        }
    } else {
        match wall_row.door_state.as_str() {
            "closed" => "open",
            "open" => "closed",
            _ => return,
        }
    };

    if let Ok(Some(_)) = db::walls::update_door_state(&state.pool, &wall_id, new_state).await {
        let door_state: htbd_core::wall::DoorState =
            serde_json::from_value(serde_json::Value::String(new_state.to_string()))
                .unwrap_or(htbd_core::wall::DoorState::Closed);
        let msg = ServerMessage::DoorToggled {
            wall_id,
            door_state,
            toggled_by: user_id,
        };
        state
            .session_manager
            .broadcast(campaign_id, &msg, None)
            .await;
    }
}

async fn handle_create_walls(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    map_id: Uuid,
    reqs: Vec<htbd_core::wall::CreateWallRequest>,
) {
    if role != CampaignRole::Dm {
        return;
    }
    let mut walls = Vec::with_capacity(reqs.len());
    for req in &reqs {
        let wt = serde_json::to_value(req.wall_type)
            .unwrap()
            .as_str()
            .unwrap()
            .to_string();
        let ds = serde_json::to_value(req.door_state)
            .unwrap()
            .as_str()
            .unwrap()
            .to_string();
        if let Ok(row) = db::walls::create_wall(
            &state.pool,
            &map_id,
            req.x1,
            req.y1,
            req.x2,
            req.y2,
            &wt,
            &ds,
        )
        .await
        {
            walls.push(htbd_core::wall::Wall::from(row));
        }
    }
    if !walls.is_empty() {
        let msg = ServerMessage::WallsCreated {
            map_id,
            walls,
            created_by: user_id,
        };
        state
            .session_manager
            .broadcast(campaign_id, &msg, None)
            .await;
    }
}

async fn handle_update_wall_ws(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    wall_id: Uuid,
    patch: htbd_core::wall::UpdateWallRequest,
) {
    if role != CampaignRole::Dm {
        return;
    }
    let wt = patch.wall_type.map(|t| {
        serde_json::to_value(t)
            .unwrap()
            .as_str()
            .unwrap()
            .to_string()
    });
    let ds = patch.door_state.map(|s| {
        serde_json::to_value(s)
            .unwrap()
            .as_str()
            .unwrap()
            .to_string()
    });
    if db::walls::update_wall(
        &state.pool,
        &wall_id,
        patch.x1,
        patch.y1,
        patch.x2,
        patch.y2,
        wt.as_deref(),
        ds.as_deref(),
    )
    .await
    .is_ok()
    {
        let msg = ServerMessage::WallUpdated {
            wall_id,
            patch,
            updated_by: user_id,
        };
        state
            .session_manager
            .broadcast(campaign_id, &msg, None)
            .await;
    }
}

async fn handle_delete_walls(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    wall_ids: Vec<Uuid>,
) {
    if role != CampaignRole::Dm {
        return;
    }
    if db::walls::delete_walls(&state.pool, &wall_ids)
        .await
        .is_ok()
    {
        let msg = ServerMessage::WallsDeleted {
            wall_ids,
            deleted_by: user_id,
        };
        state
            .session_manager
            .broadcast(campaign_id, &msg, None)
            .await;
    }
}

async fn handle_reveal_fog(
    state: &AppState,
    campaign_id: Uuid,
    _user_id: Uuid,
    role: CampaignRole,
    map_id: Uuid,
    cells: Vec<htbd_core::fog::FogCell>,
    revealed: bool,
) {
    if role != CampaignRole::Dm {
        return;
    }
    let tuples: Vec<(i32, i32)> = cells.iter().map(|c| (c.x, c.y)).collect();
    let result = if revealed {
        db::fog_cells::reveal_cells(&state.pool, &map_id, &tuples).await
    } else {
        db::fog_cells::hide_cells(&state.pool, &map_id, &tuples).await
    };
    if result.is_ok() {
        let msg = ServerMessage::FogRevealed {
            map_id,
            cells,
            revealed,
        };
        state
            .session_manager
            .broadcast(campaign_id, &msg, None)
            .await;
    }
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
