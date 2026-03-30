use axum::{
    Json, Router,
    extract::{Path, State},
    routing::get,
};

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::game_system::{GameSystemInfo, SheetSchema};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/game-systems", get(list_game_systems))
        .route("/game-systems/{id}/schema", get(get_schema))
}

async fn list_game_systems(
    State(state): State<AppState>,
    _auth: AuthUser,
) -> Json<Vec<GameSystemInfo>> {
    Json(state.game_systems.list())
}

async fn get_schema(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<SheetSchema>, AppError> {
    let system = state.game_systems.get(&id).ok_or(AppError::NotFound)?;
    Ok(Json(system.sheet_schema()))
}
