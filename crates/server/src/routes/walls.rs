use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, patch},
};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::messages::ServerMessage;
use htbd_core::wall::*;

use super::guards::{get_campaign_id_for_map, require_dm, require_member};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/maps/{map_id}/walls", get(list_walls).post(create_walls))
        .route("/walls/{id}", patch(update_wall).delete(delete_wall))
}

async fn list_walls(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(map_id): Path<Uuid>,
) -> Result<Json<Vec<Wall>>, AppError> {
    let campaign_id = get_campaign_id_for_map(&state, &map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_member(&state, campaign_id, auth.user_id).await?;

    let rows = db::walls::list_for_map(&state.pool, &map_id).await?;
    let walls: Vec<Wall> = rows.into_iter().map(Into::into).collect();
    Ok(Json(walls))
}

async fn create_walls(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(map_id): Path<Uuid>,
    Json(reqs): Json<Vec<CreateWallRequest>>,
) -> Result<Json<Vec<Wall>>, AppError> {
    let campaign_id = get_campaign_id_for_map(&state, &map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(&state, campaign_id, auth.user_id).await?;

    let mut walls = Vec::with_capacity(reqs.len());
    for req in &reqs {
        let wt: String = serde_json::to_value(req.wall_type)
            .unwrap()
            .as_str()
            .unwrap()
            .to_string();
        let ds: String = serde_json::to_value(req.door_state)
            .unwrap()
            .as_str()
            .unwrap()
            .to_string();
        let row = db::walls::create_wall(
            &state.pool,
            &map_id,
            req.x1,
            req.y1,
            req.x2,
            req.y2,
            &wt,
            &ds,
        )
        .await?;
        walls.push(Wall::from(row));
    }

    if !walls.is_empty() {
        let msg = ServerMessage::WallsCreated {
            map_id,
            walls: walls.clone(),
            created_by: auth.user_id,
        };
        state
            .session_manager
            .broadcast(campaign_id, &msg, None)
            .await;
    }

    Ok(Json(walls))
}

async fn update_wall(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateWallRequest>,
) -> Result<Json<Wall>, AppError> {
    let wall_row = db::walls::find_by_id(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;
    let campaign_id = get_campaign_id_for_map(&state, &wall_row.map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(&state, campaign_id, auth.user_id).await?;

    let wt = req.wall_type.map(|t| {
        serde_json::to_value(t)
            .unwrap()
            .as_str()
            .unwrap()
            .to_string()
    });
    let ds = req.door_state.map(|s| {
        serde_json::to_value(s)
            .unwrap()
            .as_str()
            .unwrap()
            .to_string()
    });

    let updated = db::walls::update_wall(
        &state.pool,
        &id,
        req.x1,
        req.y1,
        req.x2,
        req.y2,
        wt.as_deref(),
        ds.as_deref(),
    )
    .await?
    .ok_or(AppError::NotFound)?;

    let wall: Wall = updated.into();

    let msg = ServerMessage::WallUpdated {
        wall_id: id,
        patch: req,
        updated_by: auth.user_id,
    };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;

    Ok(Json(wall))
}

async fn delete_wall(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let wall_row = db::walls::find_by_id(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;
    let campaign_id = get_campaign_id_for_map(&state, &wall_row.map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(&state, campaign_id, auth.user_id).await?;

    db::walls::delete_wall(&state.pool, &id).await?;

    let msg = ServerMessage::WallsDeleted {
        wall_ids: vec![id],
        deleted_by: auth.user_id,
    };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;

    Ok(StatusCode::NO_CONTENT)
}
