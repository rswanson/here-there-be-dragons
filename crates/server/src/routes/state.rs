use axum::{
    Json,
    extract::{Path, State},
};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::map::*;

use super::guards::require_member;

pub async fn get_map_state(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<MapFullState>, AppError> {
    let map_row = db::maps::find_by_id(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;

    let role = require_member(&state, map_row.campaign_id, auth.user_id).await?;

    let is_dm = role == htbd_core::models::CampaignRole::Dm;

    let (layer_rows, token_rows, drawing_rows) = if is_dm {
        let layers = db::map_layers::list_for_map(&state.pool, &id).await?;
        let tokens = db::tokens::list_for_map(&state.pool, &id).await?;
        let drawings = db::drawings::list_for_map(&state.pool, &id).await?;
        (layers, tokens, drawings)
    } else {
        let layers = db::map_layers::list_for_map_player(&state.pool, &id).await?;
        let tokens = db::tokens::list_for_map_player(&state.pool, &id).await?;
        let drawings = db::drawings::list_for_map_player(&state.pool, &id).await?;
        (layers, tokens, drawings)
    };

    let wall_rows = db::walls::list_for_map(&state.pool, &id).await?;
    let fog_cell_tuples = db::fog_cells::list_for_map(&state.pool, &id).await?;

    let map = map_row.into();
    let layers = layer_rows.into_iter().map(Into::into).collect();
    let tokens = token_rows.into_iter().map(Into::into).collect();
    let drawings = drawing_rows.into_iter().map(Into::into).collect();
    let walls = wall_rows.into_iter().map(Into::into).collect();
    let fog_cells = fog_cell_tuples
        .into_iter()
        .map(|(x, y)| htbd_core::fog::FogCell { x, y })
        .collect();

    Ok(Json(MapFullState {
        map,
        layers,
        tokens,
        drawings,
        walls,
        fog_cells,
    }))
}
