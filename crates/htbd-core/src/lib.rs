pub mod auth;
pub mod drawing;
pub mod game_system;
pub mod map;
pub mod messages;
pub mod models;
pub mod token;

// Re-export commonly used types
pub use messages::*;
pub use models::*;

#[cfg(test)]
mod tests {
    use super::*;
    use ts_rs::{Config, TS};

    #[test]
    fn export_bindings() {
        let out_dir =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../client/src/types");
        std::fs::create_dir_all(&out_dir).unwrap();

        let cfg = Config::new().with_out_dir(&out_dir);

        // Models
        models::User::export_all(&cfg).unwrap();
        models::Campaign::export_all(&cfg).unwrap();
        models::CampaignRole::export_all(&cfg).unwrap();
        models::CampaignMember::export_all(&cfg).unwrap();
        models::Asset::export_all(&cfg).unwrap();

        // Messages
        messages::ClientMessage::export_all(&cfg).unwrap();
        messages::ServerMessage::export_all(&cfg).unwrap();
        messages::ConnectedUser::export_all(&cfg).unwrap();

        // Auth
        auth::AuthResponse::export_all(&cfg).unwrap();
        auth::RegisterRequest::export_all(&cfg).unwrap();
        auth::LoginRequest::export_all(&cfg).unwrap();

        // Map
        map::Map::export_all(&cfg).unwrap();
        map::MapLayer::export_all(&cfg).unwrap();
        map::MapImage::export_all(&cfg).unwrap();
        map::CreateMapRequest::export_all(&cfg).unwrap();
        map::UpdateMapRequest::export_all(&cfg).unwrap();
        map::MapWithLayers::export_all(&cfg).unwrap();
        map::CreateLayerRequest::export_all(&cfg).unwrap();
        map::UpdateLayerRequest::export_all(&cfg).unwrap();
        map::PlaceMapImageRequest::export_all(&cfg).unwrap();
        map::UpdateMapImageRequest::export_all(&cfg).unwrap();
        map::MapFullState::export_all(&cfg).unwrap();

        // Token
        token::Token::export_all(&cfg).unwrap();
        token::TokenBar::export_all(&cfg).unwrap();
        token::CreateTokenRequest::export_all(&cfg).unwrap();
        token::UpdateTokenRequest::export_all(&cfg).unwrap();

        // Drawing
        drawing::Drawing::export_all(&cfg).unwrap();
        drawing::DrawingType::export_all(&cfg).unwrap();
        drawing::CreateDrawingRequest::export_all(&cfg).unwrap();
        drawing::UpdateDrawingRequest::export_all(&cfg).unwrap();
    }
}
