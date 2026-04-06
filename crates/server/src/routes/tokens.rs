use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::post,
};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::messages::ServerMessage;
use htbd_core::models::CampaignRole;
use htbd_core::token::*;

use super::guards::{get_campaign_id_for_layer, require_dm, require_member};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/layers/{layer_id}/tokens", post(create_token))
        .route(
            "/tokens/{id}",
            axum::routing::patch(update_token).delete(delete_token),
        )
}

async fn create_token(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(layer_id): Path<Uuid>,
    Json(req): Json<CreateTokenRequest>,
) -> Result<Json<Token>, AppError> {
    let campaign_id = get_campaign_id_for_layer(&state, &layer_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(&state, campaign_id, auth.user_id).await?;

    if req.name.is_empty() {
        return Err(AppError::BadRequest("Token name required".to_string()));
    }

    let bars_json = serde_json::to_value(&req.bars).unwrap_or_default();

    let row = db::tokens::create_token(
        &state.pool,
        &layer_id,
        &req.name,
        req.asset_id.as_ref(),
        req.owner_id.as_ref(),
        req.x,
        req.y,
        req.size,
        req.rotation,
        &bars_json,
        &req.status_markers,
        req.has_vision,
        req.vision_range,
        req.darkvision_range,
        req.light_bright,
        req.light_dim,
    )
    .await?;

    let token: Token = row.into();

    let msg = ServerMessage::TokenCreated {
        layer_id,
        token: token.clone(),
        created_by: auth.user_id,
    };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;

    Ok(Json(token))
}

async fn update_token(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateTokenRequest>,
) -> Result<Json<Token>, AppError> {
    let (layer_id, owner_id) = db::tokens::get_token_auth_info(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;

    let campaign_id = get_campaign_id_for_layer(&state, &layer_id)
        .await?
        .ok_or(AppError::NotFound)?;
    let role = require_member(&state, campaign_id, auth.user_id).await?;

    // Players can only update tokens they own
    if role != CampaignRole::Dm {
        match owner_id {
            Some(oid) if oid == auth.user_id => {}
            _ => return Err(AppError::Forbidden),
        }
    }

    let bars_json = req
        .bars
        .as_ref()
        .map(|b| serde_json::to_value(b).unwrap_or_default());

    let updated = db::tokens::update_token(
        &state.pool,
        &id,
        req.name.as_deref(),
        req.asset_id.as_ref().map(|a| a.as_ref()),
        req.owner_id.as_ref().map(|o| o.as_ref()),
        req.x,
        req.y,
        req.size,
        req.rotation,
        bars_json.as_ref(),
        req.status_markers.as_deref(),
        req.has_vision,
        req.vision_range,
        req.darkvision_range,
        req.light_bright,
        req.light_dim,
    )
    .await?
    .ok_or(AppError::NotFound)?;

    let token: Token = updated.into();

    let msg = ServerMessage::TokenUpdated {
        token_id: id,
        patch: req,
        updated_by: auth.user_id,
    };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;

    Ok(Json(token))
}

async fn delete_token(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let (layer_id, _) = db::tokens::get_token_auth_info(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;

    let campaign_id = get_campaign_id_for_layer(&state, &layer_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(&state, campaign_id, auth.user_id).await?;

    db::tokens::delete_token(&state.pool, &id).await?;

    let msg = ServerMessage::TokenDeleted {
        token_id: id,
        deleted_by: auth.user_id,
    };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;

    Ok(StatusCode::NO_CONTENT)
}
