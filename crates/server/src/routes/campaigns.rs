use axum::{
    Json, Router,
    extract::{Path, State},
    routing::{delete, get, post},
};
use serde::Deserialize;
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::{AuthUser, random_hex_token};
use crate::state::AppState;
use htbd_core::models::{Campaign, CampaignMember, CampaignRole};

use super::guards::{require_dm, require_member};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_campaigns).post(create_campaign))
        .route("/{id}", get(get_campaign))
        .route("/{id}/members", get(list_members))
        .route("/{id}/members/{user_id}", delete(remove_member))
        .route("/join/{invite_code}", post(join_campaign))
}

#[derive(Deserialize)]
struct CreateCampaignRequest {
    name: String,
}

async fn create_campaign(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateCampaignRequest>,
) -> Result<Json<Campaign>, AppError> {
    if req.name.is_empty() {
        return Err(AppError::BadRequest("Campaign name required".to_string()));
    }

    let invite_code = random_hex_token(8);
    let row =
        db::campaigns::create_campaign(&state.pool, &req.name, auth.user_id, &invite_code).await?;

    Ok(Json(Campaign::from(row)))
}

async fn list_campaigns(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<Vec<Campaign>>, AppError> {
    let rows = db::campaigns::list_for_user(&state.pool, auth.user_id).await?;
    Ok(Json(rows.into_iter().map(Campaign::from).collect()))
}

async fn get_campaign(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Campaign>, AppError> {
    require_member(&state, id, auth.user_id).await?;

    let row = db::campaigns::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(Campaign::from(row)))
}

async fn list_members(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<CampaignMember>>, AppError> {
    require_member(&state, id, auth.user_id).await?;

    let rows = db::campaigns::list_members(&state.pool, id).await?;
    Ok(Json(rows.into_iter().map(CampaignMember::from).collect()))
}

async fn join_campaign(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(invite_code): Path<String>,
) -> Result<Json<Campaign>, AppError> {
    let row = db::campaigns::find_by_invite_code(&state.pool, &invite_code)
        .await?
        .ok_or(AppError::NotFound)?;

    db::campaigns::add_member(
        &state.pool,
        row.id,
        auth.user_id,
        &CampaignRole::Player.to_string(),
    )
    .await?;

    Ok(Json(Campaign::from(row)))
}

async fn remove_member(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((campaign_id, user_id)): Path<(Uuid, Uuid)>,
) -> Result<(), AppError> {
    require_dm(&state, campaign_id, auth.user_id).await?;

    // Prevent removing the DM — the SQL silently skips it, so check explicitly
    let target_role = require_member(&state, campaign_id, user_id).await?;
    if target_role == CampaignRole::Dm {
        return Err(AppError::BadRequest(
            "Cannot remove the campaign owner".to_string(),
        ));
    }

    db::campaigns::remove_member(&state.pool, campaign_id, user_id).await?;
    Ok(())
}
