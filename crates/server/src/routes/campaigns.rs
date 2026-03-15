use axum::{
    extract::{Path, State},
    routing::{get, post, delete},
    Json, Router,
};
use serde::Deserialize;
use uuid::Uuid;

use htbd_core::models::{Campaign, CampaignMember, CampaignRole};
use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;

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

    let invite_code = generate_invite_code();
    let row = db::campaigns::create_campaign(&state.pool, &req.name, auth.user_id, &invite_code).await?;

    Ok(Json(Campaign {
        id: row.id,
        name: row.name,
        owner_id: row.owner_id,
        invite_code: row.invite_code,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }))
}

async fn list_campaigns(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<Vec<Campaign>>, AppError> {
    let rows = db::campaigns::list_for_user(&state.pool, auth.user_id).await?;
    let campaigns = rows.into_iter().map(|r| Campaign {
        id: r.id,
        name: r.name,
        owner_id: r.owner_id,
        invite_code: r.invite_code,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }).collect();
    Ok(Json(campaigns))
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

    Ok(Json(Campaign {
        id: row.id,
        name: row.name,
        owner_id: row.owner_id,
        invite_code: row.invite_code,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }))
}

async fn list_members(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<CampaignMember>>, AppError> {
    require_member(&state, id, auth.user_id).await?;

    let rows = db::campaigns::list_members(&state.pool, id).await?;
    let members = rows.into_iter().map(|r| CampaignMember {
        campaign_id: r.campaign_id,
        user_id: r.user_id,
        role: r.role.parse().unwrap_or(CampaignRole::Player),
        display_name: r.display_name,
        joined_at: r.joined_at,
    }).collect();
    Ok(Json(members))
}

async fn join_campaign(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(invite_code): Path<String>,
) -> Result<Json<Campaign>, AppError> {
    let row = db::campaigns::find_by_invite_code(&state.pool, &invite_code)
        .await?
        .ok_or(AppError::NotFound)?;

    db::campaigns::add_member(&state.pool, row.id, auth.user_id, "player").await?;

    Ok(Json(Campaign {
        id: row.id,
        name: row.name,
        owner_id: row.owner_id,
        invite_code: row.invite_code,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }))
}

async fn remove_member(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((campaign_id, user_id)): Path<(Uuid, Uuid)>,
) -> Result<(), AppError> {
    require_dm(&state, campaign_id, auth.user_id).await?;
    db::campaigns::remove_member(&state.pool, campaign_id, user_id).await?;
    Ok(())
}

// --- Helpers ---

async fn require_member(state: &AppState, campaign_id: Uuid, user_id: Uuid) -> Result<String, AppError> {
    db::campaigns::get_member_role(&state.pool, campaign_id, user_id)
        .await?
        .ok_or(AppError::Forbidden)
}

async fn require_dm(state: &AppState, campaign_id: Uuid, user_id: Uuid) -> Result<(), AppError> {
    let role = require_member(state, campaign_id, user_id).await?;
    if role != "dm" {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

fn generate_invite_code() -> String {
    use rand::Rng;
    let bytes: [u8; 8] = rand::thread_rng().r#gen();
    hex::encode(bytes)
}
