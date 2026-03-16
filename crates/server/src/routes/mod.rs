pub mod assets;
pub mod auth;
pub mod campaigns;
pub mod guards;
pub mod maps;
pub mod ws;

use crate::state::AppState;
use axum::Router;

pub fn api_routes() -> Router<AppState> {
    Router::new()
        .nest("/auth", auth::routes())
        .nest("/campaigns", campaigns::routes())
        .nest("/assets", assets::routes())
        .nest("/ws", ws::routes())
        .merge(maps::routes())
}
