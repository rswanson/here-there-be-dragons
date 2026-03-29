use htbd_core::messages::ServerMessage;
use htbd_core::models::CampaignRole;
use tokio::sync::mpsc;
use uuid::Uuid;

/// A single WebSocket connection to a user in a session.
/// Multiple connections per user are supported (multi-tab).
/// Each connection gets a unique `connection_id` for identification.
#[derive(Debug, Clone)]
pub struct ConnectionHandle {
    pub connection_id: Uuid,
    pub user_id: Uuid,
    pub display_name: String,
    pub role: CampaignRole,
    pub tx: mpsc::UnboundedSender<ServerMessage>,
}

/// Summary info about a connected user (no sender channel).
#[derive(Debug, Clone)]
pub struct ConnectedUserInfo {
    pub user_id: Uuid,
    pub display_name: String,
    pub role: CampaignRole,
}
