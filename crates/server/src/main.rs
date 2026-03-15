mod config;
mod error;
mod middleware;
mod routes;
mod state;

use axum::Router;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

use config::Config;
use state::AppState;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let config = Config::from_env();
    tracing::info!("Starting server on {}", config.bind_address);

    let pool = db::create_pool(&config.database_url)
        .await
        .expect("Failed to connect to database");

    db::run_migrations(&pool)
        .await
        .expect("Failed to run migrations");

    let storage = asset_store::create_storage(config.asset_storage_path.clone());

    let state = AppState {
        pool,
        config: config.clone(),
        storage: Arc::from(storage),
    };

    let client_dir =
        std::env::var("CLIENT_DIR").unwrap_or_else(|_| "/srv/client".to_string());
    let app = Router::new()
        .nest("/api", routes::api_routes())
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive()) // Tighten in production
        .with_state(state)
        .fallback_service(
            tower_http::services::ServeDir::new(&client_dir).fallback(
                tower_http::services::ServeFile::new(format!("{}/index.html", client_dir)),
            ),
        );

    let listener = tokio::net::TcpListener::bind(&config.bind_address)
        .await
        .expect("Failed to bind");

    tracing::info!("Listening on {}", config.bind_address);
    axum::serve(listener, app).await.expect("Server failed");
}
