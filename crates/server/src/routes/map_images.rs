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
use htbd_core::messages::ServerMessage;

use super::guards::{get_campaign_id_for_layer, require_dm_for_layer, require_member};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/layers/{layer_id}/images",
            get(list_images).post(place_image),
        )
        .route(
            "/images/{id}",
            axum::routing::patch(update_image).delete(delete_image),
        )
}

async fn list_images(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(layer_id): Path<Uuid>,
) -> Result<Json<Vec<MapImage>>, AppError> {
    let campaign_id = get_campaign_id_for_layer(&state, &layer_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_member(&state, campaign_id, auth.user_id).await?;

    let rows = db::map_images::list_for_layer(&state.pool, &layer_id).await?;
    let images: Vec<MapImage> = rows.into_iter().map(Into::into).collect();
    Ok(Json(images))
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

    let image: MapImage = row.into();

    if let Some(campaign_id) = get_campaign_id_for_layer(&state, &layer_id).await? {
        let msg = ServerMessage::MapImagePlaced {
            layer_id,
            image: image.clone(),
        };
        state
            .session_manager
            .broadcast(campaign_id, &msg, None)
            .await;
    }

    Ok(Json(image))
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

    let image: MapImage = updated.into();

    if let Some(campaign_id) = get_campaign_id_for_layer(&state, &layer_id).await? {
        let msg = ServerMessage::MapImageUpdated {
            image_id: id,
            patch: req,
        };
        state
            .session_manager
            .broadcast(campaign_id, &msg, None)
            .await;
    }

    Ok(Json(image))
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

    // Resolve campaign_id before deleting
    let campaign_id = get_campaign_id_for_layer(&state, &layer_id).await?;

    db::map_images::delete_image(&state.pool, &id).await?;

    if let Some(campaign_id) = campaign_id {
        let msg = ServerMessage::MapImageDeleted { image_id: id };
        state
            .session_manager
            .broadcast(campaign_id, &msg, None)
            .await;
    }

    Ok(StatusCode::NO_CONTENT)
}
