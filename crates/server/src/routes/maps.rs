use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::get,
};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::map::*;

use super::guards::{require_dm, require_member};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/campaigns/{campaign_id}/maps",
            get(list_maps).post(create_map),
        )
        .route(
            "/maps/{id}",
            get(get_map).patch(update_map).delete(delete_map),
        )
}

async fn create_map(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(campaign_id): Path<Uuid>,
    Json(req): Json<CreateMapRequest>,
) -> Result<Json<MapWithLayers>, AppError> {
    require_dm(&state, campaign_id, auth.user_id).await?;

    if req.name.is_empty() {
        return Err(AppError::BadRequest("Map name required".to_string()));
    }

    let map_row = db::maps::create_map(&state.pool, &campaign_id, &req.name).await?;

    // Update non-default fields if provided
    let map_row = if req.grid_size_px != 70
        || req.grid_scale != 5.0
        || req.width_squares != 30
        || req.height_squares != 20
        || !req.grid_enabled
    {
        db::maps::update_map(
            &state.pool,
            &map_row.id,
            None,
            Some(req.grid_enabled),
            Some(req.grid_size_px),
            None,
            None,
            None,
            Some(req.grid_scale),
            None,
            None,
            None,
            Some(req.width_squares),
            Some(req.height_squares),
        )
        .await?
        .unwrap_or(map_row)
    } else {
        map_row
    };

    // Create default layers
    let layer_rows = db::map_layers::create_default_layers(&state.pool, &map_row.id).await?;

    let map: Map = map_row.into();
    let layers: Vec<MapLayer> = layer_rows.into_iter().map(Into::into).collect();

    Ok(Json(MapWithLayers { map, layers }))
}

async fn list_maps(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(campaign_id): Path<Uuid>,
) -> Result<Json<Vec<Map>>, AppError> {
    require_member(&state, campaign_id, auth.user_id).await?;

    let rows = db::maps::list_for_campaign(&state.pool, &campaign_id).await?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

async fn get_map(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<MapWithLayers>, AppError> {
    let map_row = db::maps::find_by_id(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;

    let role = require_member(&state, map_row.campaign_id, auth.user_id).await?;

    // Filter dm_only layers for non-DM users
    let layer_rows = if role == htbd_core::models::CampaignRole::Dm {
        db::map_layers::list_for_map(&state.pool, &id).await?
    } else {
        db::map_layers::list_for_map_player(&state.pool, &id).await?
    };

    let map: Map = map_row.into();
    let layers: Vec<MapLayer> = layer_rows.into_iter().map(Into::into).collect();

    Ok(Json(MapWithLayers { map, layers }))
}

async fn update_map(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateMapRequest>,
) -> Result<Json<Map>, AppError> {
    let map_row = db::maps::find_by_id(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;

    require_dm(&state, map_row.campaign_id, auth.user_id).await?;

    let snap_mode_str = req.snap_mode.map(|s| {
        serde_json::to_value(s)
            .unwrap()
            .as_str()
            .unwrap()
            .to_string()
    });
    let diagonal_mode_str = req.diagonal_mode.map(|d| {
        serde_json::to_value(d)
            .unwrap()
            .as_str()
            .unwrap()
            .to_string()
    });

    let updated = db::maps::update_map(
        &state.pool,
        &id,
        req.name.as_deref(),
        req.grid_enabled,
        req.grid_size_px,
        req.grid_color.as_deref(),
        req.grid_opacity,
        req.grid_line_width,
        req.grid_scale,
        req.grid_scale_unit.as_deref(),
        snap_mode_str.as_deref(),
        diagonal_mode_str.as_deref(),
        req.width_squares,
        req.height_squares,
    )
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(updated.into()))
}

async fn delete_map(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let map_row = db::maps::find_by_id(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;

    require_dm(&state, map_row.campaign_id, auth.user_id).await?;

    db::maps::delete_map(&state.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}
