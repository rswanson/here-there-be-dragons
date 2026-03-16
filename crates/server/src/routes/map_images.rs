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
use htbd_core::map::*;

use super::guards::require_dm;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/layers/{layer_id}/images", post(place_image))
        .route(
            "/images/{id}",
            axum::routing::patch(update_image).delete(delete_image),
        )
}

/// Resolve layer_id → map_id → campaign_id and require DM
async fn require_dm_for_layer(
    state: &AppState,
    layer_id: &Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    let map_id = db::map_layers::get_map_id_for_layer(&state.pool, layer_id)
        .await?
        .ok_or(AppError::NotFound)?;
    let map_row = db::maps::find_by_id(&state.pool, &map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(state, map_row.campaign_id, user_id).await
}

async fn place_image(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(layer_id): Path<Uuid>,
    Json(req): Json<PlaceMapImageRequest>,
) -> Result<Json<MapImage>, AppError> {
    require_dm_for_layer(&state, &layer_id, auth.user_id).await?;

    let row = db::map_images::place_image(
        &state.pool,
        &layer_id,
        &req.asset_id,
        req.x,
        req.y,
        req.width,
        req.height,
        req.rotation,
        req.opacity,
    )
    .await?;

    Ok(Json(row.into()))
}

async fn update_image(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateMapImageRequest>,
) -> Result<Json<MapImage>, AppError> {
    let layer_id = db::map_images::get_layer_id_for_image(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm_for_layer(&state, &layer_id, auth.user_id).await?;

    let updated = db::map_images::update_image(
        &state.pool,
        &id,
        req.x,
        req.y,
        req.width,
        req.height,
        req.rotation,
        req.opacity,
    )
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(updated.into()))
}

async fn delete_image(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let layer_id = db::map_images::get_layer_id_for_image(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm_for_layer(&state, &layer_id, auth.user_id).await?;

    db::map_images::delete_image(&state.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}
