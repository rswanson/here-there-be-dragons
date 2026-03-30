pub mod assets;
pub mod auth;
pub mod campaigns;
pub mod drawings;
pub mod game_systems;
pub mod guards;
pub mod layers;
pub mod map_images;
pub mod maps;
pub mod state;
pub mod tokens;
pub mod ws;

use crate::state::AppState;
use axum::Router;

pub fn api_routes() -> Router<AppState> {
    Router::new()
        .nest("/auth", auth::routes())
        .nest("/campaigns", campaigns::routes())
        .nest("/assets", assets::routes())
        .route("/ws/{campaign_id}", axum::routing::get(ws::ws_upgrade))
        .merge(maps::routes())
        .merge(layers::routes())
        .merge(map_images::routes())
        .merge(drawings::routes())
        .merge(tokens::routes())
        .merge(game_systems::routes())
        .route("/maps/{id}/state", axum::routing::get(state::get_map_state))
}
