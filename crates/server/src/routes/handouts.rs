use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::handout::*;
use htbd_core::messages::ServerMessage;
use htbd_core::models::CampaignRole;

use super::guards::{require_dm, require_member};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/campaigns/{campaign_id}/handouts",
            post(create_handout).get(list_handouts),
        )
        .route(
            "/handouts/{id}",
            get(get_handout).put(update_handout).delete(delete_handout),
        )
}

async fn create_handout(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(campaign_id): Path<Uuid>,
    Json(req): Json<CreateHandoutRequest>,
) -> Result<(StatusCode, Json<Handout>), AppError> {
    require_dm(&state, campaign_id, auth.user_id).await?;

    if req.title.is_empty() {
        return Err(AppError::BadRequest("Handout title required".to_string()));
    }

    let row = db::handouts::create_handout(
        &state.pool,
        &campaign_id,
        &req.title,
        &req.content,
        &req.visibility.to_string(),
        &req.player_ids,
        &auth.user_id,
    )
    .await?;

    let msg = ServerMessage::HandoutCreated {
        handout: db::handouts::row_to_summary(&row),
    };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;

    let handout = db::handouts::row_to_handout(row);
    Ok((StatusCode::CREATED, Json(handout)))
}

async fn list_handouts(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(campaign_id): Path<Uuid>,
) -> Result<Json<Vec<Handout>>, AppError> {
    let role = require_member(&state, campaign_id, auth.user_id).await?;

    let rows = db::handouts::list_for_campaign(&state.pool, &campaign_id).await?;

    let handouts = rows
        .into_iter()
        .filter(|row| {
            if role == CampaignRole::Dm {
                return true;
            }
            match row.visibility.as_str() {
                "everyone" => true,
                "specific_players" => row.player_ids.contains(&auth.user_id),
                _ => false,
            }
        })
        .map(db::handouts::row_to_handout)
        .collect();

    Ok(Json(handouts))
}

async fn get_handout(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Handout>, AppError> {
    let row = db::handouts::find_by_id(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;

    let role = require_member(&state, row.campaign_id, auth.user_id).await?;

    if role != CampaignRole::Dm {
        match row.visibility.as_str() {
            "everyone" => {}
            "specific_players" => {
                if !row.player_ids.contains(&auth.user_id) {
                    return Err(AppError::Forbidden);
                }
            }
            _ => return Err(AppError::Forbidden),
        }
    }

    Ok(Json(db::handouts::row_to_handout(row)))
}

async fn update_handout(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateHandoutRequest>,
) -> Result<Json<Handout>, AppError> {
    let row = db::handouts::find_by_id(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;
    let campaign_id = row.campaign_id;

    require_dm(&state, campaign_id, auth.user_id).await?;

    let visibility_string = req.visibility.as_ref().map(|v| v.to_string());
    let player_ids_ref: Option<&[Uuid]> = req.player_ids.as_deref();

    let updated_row = db::handouts::update_handout(
        &state.pool,
        &id,
        req.title.as_deref(),
        req.content.as_deref(),
        visibility_string.as_deref(),
        player_ids_ref,
    )
    .await?
    .ok_or(AppError::NotFound)?;

    let summary = db::handouts::row_to_summary(&updated_row);
    let msg = ServerMessage::HandoutUpdated { handout: summary };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;

    Ok(Json(db::handouts::row_to_handout(updated_row)))
}

async fn delete_handout(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let row = db::handouts::find_by_id(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;
    let campaign_id = row.campaign_id;

    require_dm(&state, campaign_id, auth.user_id).await?;

    db::handouts::delete_handout(&state.pool, &id).await?;

    let msg = ServerMessage::HandoutDeleted { handout_id: id };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;

    Ok(StatusCode::NO_CONTENT)
}
