pub mod config;
pub mod error;
pub mod game_system;
pub mod middleware;
pub mod routes;
pub mod session;
pub mod state;

use axum::Router;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use state::AppState;

/// Build the API router. Used by both main.rs and integration tests.
pub fn build_app(state: AppState) -> Router {
    Router::new()
        .nest("/api", routes::api_routes())
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(state)
}
