pub mod auth;
pub mod drawing;
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
    use ts_rs::TS;

    #[test]
    fn export_bindings() {
        let out_dir =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../client/src/types");
        std::fs::create_dir_all(&out_dir).unwrap();

        // Models
        models::User::export_all_to(&out_dir).unwrap();
        models::Campaign::export_all_to(&out_dir).unwrap();
        models::CampaignRole::export_all_to(&out_dir).unwrap();
        models::CampaignMember::export_all_to(&out_dir).unwrap();
        models::Asset::export_all_to(&out_dir).unwrap();

        // Messages
        messages::ClientMessage::export_all_to(&out_dir).unwrap();
        messages::ServerMessage::export_all_to(&out_dir).unwrap();
        messages::ConnectedUser::export_all_to(&out_dir).unwrap();

        // Auth
        auth::AuthResponse::export_all_to(&out_dir).unwrap();
        auth::RegisterRequest::export_all_to(&out_dir).unwrap();
        auth::LoginRequest::export_all_to(&out_dir).unwrap();

        // Map
        map::Map::export_all_to(&out_dir).unwrap();
        map::MapLayer::export_all_to(&out_dir).unwrap();
        map::MapImage::export_all_to(&out_dir).unwrap();
        map::CreateMapRequest::export_all_to(&out_dir).unwrap();
        map::UpdateMapRequest::export_all_to(&out_dir).unwrap();
        map::MapWithLayers::export_all_to(&out_dir).unwrap();
        map::CreateLayerRequest::export_all_to(&out_dir).unwrap();
        map::UpdateLayerRequest::export_all_to(&out_dir).unwrap();
        map::PlaceMapImageRequest::export_all_to(&out_dir).unwrap();
        map::UpdateMapImageRequest::export_all_to(&out_dir).unwrap();
        map::MapFullState::export_all_to(&out_dir).unwrap();

        // Token
        token::Token::export_all_to(&out_dir).unwrap();
        token::TokenBar::export_all_to(&out_dir).unwrap();
        token::CreateTokenRequest::export_all_to(&out_dir).unwrap();
        token::UpdateTokenRequest::export_all_to(&out_dir).unwrap();

        // Drawing
        drawing::Drawing::export_all_to(&out_dir).unwrap();
        drawing::DrawingType::export_all_to(&out_dir).unwrap();
        drawing::CreateDrawingRequest::export_all_to(&out_dir).unwrap();
        drawing::UpdateDrawingRequest::export_all_to(&out_dir).unwrap();
    }
}
