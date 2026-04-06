pub mod auth;
pub mod character;
pub mod chat;
pub mod drawing;
pub mod fog;
pub mod game_system;
pub mod handout;
pub mod initiative;
pub mod map;
pub mod messages;
pub mod models;
pub mod token;
pub mod wall;

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

        // Game system
        game_system::SheetSchema::export_all(&cfg).unwrap();
        game_system::SheetSection::export_all(&cfg).unwrap();
        game_system::SectionLayout::export_all(&cfg).unwrap();
        game_system::FieldDef::export_all(&cfg).unwrap();
        game_system::FieldType::export_all(&cfg).unwrap();
        game_system::ChoiceOption::export_all(&cfg).unwrap();
        game_system::WidthHint::export_all(&cfg).unwrap();
        game_system::BonusTypeDef::export_all(&cfg).unwrap();
        game_system::BonusEntry::export_all(&cfg).unwrap();
        game_system::GameSystemInfo::export_all(&cfg).unwrap();
        game_system::FieldVisibility::export_all(&cfg).unwrap();

        // Character
        character::Character::export_all(&cfg).unwrap();
        character::CreateCharacterRequest::export_all(&cfg).unwrap();
        character::UpdateCharacterRequest::export_all(&cfg).unwrap();
        character::CharacterExport::export_all(&cfg).unwrap();
        character::AddBonusRequest::export_all(&cfg).unwrap();
        character::UpdateBonusRequest::export_all(&cfg).unwrap();

        // Chat
        chat::ChatMessage::export_all(&cfg).unwrap();
        chat::ChatMessageType::export_all(&cfg).unwrap();
        chat::SendChatMessageRequest::export_all(&cfg).unwrap();

        // Handout
        handout::Handout::export_all(&cfg).unwrap();
        handout::HandoutSummary::export_all(&cfg).unwrap();
        handout::HandoutVisibility::export_all(&cfg).unwrap();
        handout::CreateHandoutRequest::export_all(&cfg).unwrap();
        handout::UpdateHandoutRequest::export_all(&cfg).unwrap();

        // Initiative
        initiative::Encounter::export_all(&cfg).unwrap();
        initiative::Combatant::export_all(&cfg).unwrap();
        initiative::StartEncounterRequest::export_all(&cfg).unwrap();
        initiative::NewCombatant::export_all(&cfg).unwrap();

        // Wall
        wall::Wall::export_all(&cfg).unwrap();
        wall::WallType::export_all(&cfg).unwrap();
        wall::DoorState::export_all(&cfg).unwrap();
        wall::CreateWallRequest::export_all(&cfg).unwrap();
        wall::UpdateWallRequest::export_all(&cfg).unwrap();

        // Fog
        fog::FogCell::export_all(&cfg).unwrap();
        fog::RevealFogRequest::export_all(&cfg).unwrap();
    }
}
