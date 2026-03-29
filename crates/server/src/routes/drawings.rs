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
use htbd_core::drawing::*;
use htbd_core::messages::ServerMessage;

use super::guards::{get_campaign_id_for_layer, require_dm_for_layer};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/layers/{layer_id}/drawings", post(create_drawing))
        .route(
            "/drawings/{id}",
            axum::routing::patch(update_drawing).delete(delete_drawing),
        )
}

async fn create_drawing(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(layer_id): Path<Uuid>,
    Json(req): Json<CreateDrawingRequest>,
) -> Result<Json<Drawing>, AppError> {
    require_dm_for_layer(&state, &layer_id, auth.user_id).await?;

    let drawing_type_str = serde_json::to_value(req.drawing_type).unwrap();
    let drawing_type_str = drawing_type_str.as_str().unwrap();

    let row = db::drawings::create_drawing(
        &state.pool,
        &layer_id,
        drawing_type_str,
        &req.points,
        &req.stroke_color,
        req.stroke_width,
        req.stroke_opacity,
        req.fill_color.as_deref(),
        req.fill_opacity,
    )
    .await?;

    let drawing: Drawing = row.into();

    if let Some(campaign_id) = get_campaign_id_for_layer(&state, &layer_id).await? {
        let msg = ServerMessage::DrawingCreated {
            layer_id,
            drawing: drawing.clone(),
        };
        state
            .session_manager
            .broadcast(campaign_id, &msg, None)
            .await;
    }

    Ok(Json(drawing))
}

async fn update_drawing(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateDrawingRequest>,
) -> Result<Json<Drawing>, AppError> {
    let layer_id = db::drawings::get_layer_id_for_drawing(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm_for_layer(&state, &layer_id, auth.user_id).await?;

    let updated = db::drawings::update_drawing(
        &state.pool,
        &id,
        req.points.as_ref(),
        req.stroke_color.as_deref(),
        req.stroke_width,
        req.stroke_opacity,
        req.fill_color.as_ref().map(|fc| fc.as_deref()),
        req.fill_opacity,
    )
    .await?
    .ok_or(AppError::NotFound)?;

    let drawing: Drawing = updated.into();

    if let Some(campaign_id) = get_campaign_id_for_layer(&state, &layer_id).await? {
        let msg = ServerMessage::DrawingUpdated {
            drawing_id: id,
            patch: req,
        };
        state
            .session_manager
            .broadcast(campaign_id, &msg, None)
            .await;
    }

    Ok(Json(drawing))
}

async fn delete_drawing(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let layer_id = db::drawings::get_layer_id_for_drawing(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm_for_layer(&state, &layer_id, auth.user_id).await?;

    // Resolve campaign_id before deleting
    let campaign_id = get_campaign_id_for_layer(&state, &layer_id).await?;

    db::drawings::delete_drawing(&state.pool, &id).await?;

    if let Some(campaign_id) = campaign_id {
        let msg = ServerMessage::DrawingDeleted { drawing_id: id };
        state
            .session_manager
            .broadcast(campaign_id, &msg, None)
            .await;
    }

    Ok(StatusCode::NO_CONTENT)
}
