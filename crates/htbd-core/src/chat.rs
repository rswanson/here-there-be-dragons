use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum ChatMessageType {
    Character,
    Ooc,
    Emote,
    Whisper,
    System,
}

impl fmt::Display for ChatMessageType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ChatMessageType::Character => write!(f, "character"),
            ChatMessageType::Ooc => write!(f, "ooc"),
            ChatMessageType::Emote => write!(f, "emote"),
            ChatMessageType::Whisper => write!(f, "whisper"),
            ChatMessageType::System => write!(f, "system"),
        }
    }
}

impl FromStr for ChatMessageType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "character" => Ok(ChatMessageType::Character),
            "ooc" => Ok(ChatMessageType::Ooc),
            "emote" => Ok(ChatMessageType::Emote),
            "whisper" => Ok(ChatMessageType::Whisper),
            "system" => Ok(ChatMessageType::System),
            _ => Err(format!("Unknown ChatMessageType: {}", s)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ChatMessage {
    pub id: Uuid,
    pub campaign_id: Uuid,
    pub sender_user_id: Uuid,
    pub sender_display_name: String,
    pub character_id: Option<Uuid>,
    pub character_name: Option<String>,
    pub message_type: ChatMessageType,
    pub content: String,
    pub whisper_target_ids: Vec<Uuid>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SendChatMessageRequest {
    pub character_id: Option<Uuid>,
    pub message_type: ChatMessageType,
    pub content: String,
    #[serde(default)]
    pub whisper_target_ids: Vec<Uuid>,
}
