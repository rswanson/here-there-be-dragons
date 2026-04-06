use axum::{
    Json, Router,
    extract::{Path, State},
    routing::get,
};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::fog::{FogCell, RevealFogRequest};
use htbd_core::messages::ServerMessage;

use super::guards::{get_campaign_id_for_map, require_dm, require_member};

pub fn routes() -> Router<AppState> {
    Router::new().route("/maps/{map_id}/fog", get(get_fog).put(update_fog))
}

async fn get_fog(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(map_id): Path<Uuid>,
) -> Result<Json<Vec<FogCell>>, AppError> {
    let campaign_id = get_campaign_id_for_map(&state, &map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_member(&state, campaign_id, auth.user_id).await?;

    let tuples = db::fog_cells::list_for_map(&state.pool, &map_id).await?;
    let cells: Vec<FogCell> = tuples.into_iter().map(|(x, y)| FogCell { x, y }).collect();
    Ok(Json(cells))
}

async fn update_fog(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(map_id): Path<Uuid>,
    Json(req): Json<RevealFogRequest>,
) -> Result<Json<Vec<FogCell>>, AppError> {
    let campaign_id = get_campaign_id_for_map(&state, &map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(&state, campaign_id, auth.user_id).await?;

    let tuples: Vec<(i32, i32)> = req.cells.iter().map(|c| (c.x, c.y)).collect();
    if req.revealed {
        db::fog_cells::reveal_cells(&state.pool, &map_id, &tuples).await?;
    } else {
        db::fog_cells::hide_cells(&state.pool, &map_id, &tuples).await?;
    }

    let msg = ServerMessage::FogRevealed {
        map_id,
        cells: req.cells.clone(),
        revealed: req.revealed,
    };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;

    // Return current fog state
    let all_tuples = db::fog_cells::list_for_map(&state.pool, &map_id).await?;
    let cells: Vec<FogCell> = all_tuples
        .into_iter()
        .map(|(x, y)| FogCell { x, y })
        .collect();
    Ok(Json(cells))
}
