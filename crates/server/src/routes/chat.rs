use axum::{
    Json, Router,
    extract::{Path, Query, State},
    routing::get,
};
use serde::Deserialize;
use std::collections::HashMap;
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::chat::{ChatMessage, ChatMessageType};

use super::guards::require_member;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/campaigns/{campaign_id}/chat", get(get_recent))
        .route(
            "/campaigns/{campaign_id}/chat/before/{message_id}",
            get(get_before),
        )
}

#[derive(Deserialize)]
struct ChatQuery {
    limit: Option<i64>,
}

async fn get_recent(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(campaign_id): Path<Uuid>,
    Query(params): Query<ChatQuery>,
) -> Result<Json<Vec<ChatMessage>>, AppError> {
    require_member(&state, campaign_id, auth.user_id).await?;

    let limit = params.limit.unwrap_or(50).min(100);

    let rows =
        db::chat_messages::get_recent_messages(&state.pool, &campaign_id, &auth.user_id, limit)
            .await?;

    let messages = rows_to_chat_messages(&state.pool, rows).await?;
    Ok(Json(messages))
}

async fn get_before(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((campaign_id, message_id)): Path<(Uuid, Uuid)>,
    Query(params): Query<ChatQuery>,
) -> Result<Json<Vec<ChatMessage>>, AppError> {
    require_member(&state, campaign_id, auth.user_id).await?;

    let limit = params.limit.unwrap_or(50).min(100);

    let rows = db::chat_messages::get_messages_before(
        &state.pool,
        &campaign_id,
        &auth.user_id,
        &message_id,
        limit,
    )
    .await?;

    let messages = rows_to_chat_messages(&state.pool, rows).await?;
    Ok(Json(messages))
}

pub async fn rows_to_chat_messages(
    pool: &sqlx::PgPool,
    rows: Vec<db::chat_messages::ChatMessageRow>,
) -> Result<Vec<ChatMessage>, AppError> {
    // Collect unique user IDs and character IDs
    let user_ids: Vec<Uuid> = {
        let mut seen = std::collections::HashSet::new();
        rows.iter()
            .filter(|r| seen.insert(r.sender_user_id))
            .map(|r| r.sender_user_id)
            .collect()
    };

    let character_ids: Vec<Uuid> = {
        let mut seen = std::collections::HashSet::new();
        rows.iter()
            .filter_map(|r| r.character_id)
            .filter(|id| seen.insert(*id))
            .collect()
    };

    // Batch load users
    let mut user_names: HashMap<Uuid, String> = HashMap::new();
    for user_id in user_ids {
        if let Some(user) = db::users::find_by_id(pool, user_id).await? {
            user_names.insert(user_id, user.display_name);
        }
    }

    // Batch load characters
    let mut character_names: HashMap<Uuid, String> = HashMap::new();
    for character_id in character_ids {
        if let Some(character) = db::characters::find_by_id(pool, &character_id).await? {
            character_names.insert(character_id, character.name);
        }
    }

    // Map rows to ChatMessage structs
    let mut messages = Vec::with_capacity(rows.len());
    for row in rows {
        let sender_display_name = user_names
            .get(&row.sender_user_id)
            .cloned()
            .unwrap_or_default();
        let character_name = row
            .character_id
            .and_then(|id| character_names.get(&id).cloned());
        let message_type: ChatMessageType = row.message_type.parse().map_err(|_| {
            AppError::BadRequest(format!("Unknown message type: {}", row.message_type))
        })?;

        messages.push(ChatMessage {
            id: row.id,
            campaign_id: row.campaign_id,
            sender_user_id: row.sender_user_id,
            sender_display_name,
            character_id: row.character_id,
            character_name,
            message_type,
            content: row.content,
            whisper_target_ids: row.whisper_target_ids,
            created_at: row.created_at,
        });
    }

    Ok(messages)
}
