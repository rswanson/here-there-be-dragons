use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Messages sent from client to server
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "type", content = "payload")]
pub enum ClientMessage {
    Ping,
    // Future sub-projects add variants here
}

/// Messages sent from server to client
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "type", content = "payload")]
pub enum ServerMessage {
    Pong,
    Error { code: String, message: String },
    // Future sub-projects add variants here
}
