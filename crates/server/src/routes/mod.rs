pub mod auth;
pub mod assets;
pub mod campaigns;
pub mod ws;

use axum::Router;
use crate::state::AppState;

pub fn api_routes() -> Router<AppState> {
    Router::new()
        .nest("/auth", auth::routes())
        .nest("/campaigns", campaigns::routes())
        .nest("/assets", assets::routes())
        .nest("/ws", ws::routes())
}
