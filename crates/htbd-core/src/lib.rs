pub mod auth;
pub mod messages;
pub mod models;

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

        // Auth
        auth::AuthResponse::export_all_to(&out_dir).unwrap();
        auth::RegisterRequest::export_all_to(&out_dir).unwrap();
        auth::LoginRequest::export_all_to(&out_dir).unwrap();
    }
}
