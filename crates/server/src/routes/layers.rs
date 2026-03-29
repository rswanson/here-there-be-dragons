use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{post, put},
};
use serde::Deserialize;
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::map::*;
use htbd_core::messages::ServerMessage;

use super::guards::require_dm;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/maps/{map_id}/layers", post(create_layer))
        .route("/maps/{map_id}/layers/order", put(reorder_layers))
        .route(
            "/layers/{id}",
            axum::routing::patch(update_layer).delete(delete_layer),
        )
}

async fn create_layer(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(map_id): Path<Uuid>,
    Json(req): Json<CreateLayerRequest>,
) -> Result<Json<MapLayer>, AppError> {
    let map_row = db::maps::find_by_id(&state.pool, &map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(&state, map_row.campaign_id, auth.user_id).await?;

    let layer_type_str = serde_json::to_value(req.layer_type).unwrap();
    let layer_type_str = layer_type_str.as_str().unwrap();

    let row =
        db::map_layers::create_layer(&state.pool, &map_id, &req.name, layer_type_str, req.dm_only)
            .await?;

    let layer: MapLayer = row.into();

    let msg = ServerMessage::LayerCreated {
        layer: layer.clone(),
    };
    state
        .session_manager
        .broadcast(map_row.campaign_id, &msg, None)
        .await;

    Ok(Json(layer))
}

#[derive(Deserialize)]
struct ReorderRequest {
    layer_ids: Vec<Uuid>,
}

async fn reorder_layers(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(map_id): Path<Uuid>,
    Json(req): Json<ReorderRequest>,
) -> Result<StatusCode, AppError> {
    let map_row = db::maps::find_by_id(&state.pool, &map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(&state, map_row.campaign_id, auth.user_id).await?;

    db::map_layers::reorder_layers(&state.pool, &map_id, &req.layer_ids).await?;

    let msg = ServerMessage::LayersReordered {
        map_id,
        layer_ids: req.layer_ids,
    };
    state
        .session_manager
        .broadcast(map_row.campaign_id, &msg, None)
        .await;

    Ok(StatusCode::OK)
}

async fn update_layer(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateLayerRequest>,
) -> Result<Json<MapLayer>, AppError> {
    let map_id = db::map_layers::get_map_id_for_layer(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;
    let map_row = db::maps::find_by_id(&state.pool, &map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(&state, map_row.campaign_id, auth.user_id).await?;

    let updated = db::map_layers::update_layer(
        &state.pool,
        &id,
        req.name.as_deref(),
        req.visible,
        req.locked,
        req.opacity,
        req.dm_only,
    )
    .await?
    .ok_or(AppError::NotFound)?;

    let layer: MapLayer = updated.into();

    let msg = ServerMessage::LayerUpdated {
        layer: layer.clone(),
    };
    state
        .session_manager
        .broadcast(map_row.campaign_id, &msg, None)
        .await;

    Ok(Json(layer))
}

async fn delete_layer(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let map_id = db::map_layers::get_map_id_for_layer(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;
    let map_row = db::maps::find_by_id(&state.pool, &map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(&state, map_row.campaign_id, auth.user_id).await?;

    db::map_layers::delete_layer(&state.pool, &id).await?;

    let msg = ServerMessage::LayerDeleted { layer_id: id };
    state
        .session_manager
        .broadcast(map_row.campaign_id, &msg, None)
        .await;

    Ok(StatusCode::NO_CONTENT)
}
