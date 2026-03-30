use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum HandoutVisibility {
    Everyone,
    DmOnly,
    SpecificPlayers,
}

impl fmt::Display for HandoutVisibility {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            HandoutVisibility::Everyone => write!(f, "everyone"),
            HandoutVisibility::DmOnly => write!(f, "dm_only"),
            HandoutVisibility::SpecificPlayers => write!(f, "specific_players"),
        }
    }
}

impl FromStr for HandoutVisibility {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "everyone" => Ok(HandoutVisibility::Everyone),
            "dm_only" => Ok(HandoutVisibility::DmOnly),
            "specific_players" => Ok(HandoutVisibility::SpecificPlayers),
            _ => Err(format!("Unknown HandoutVisibility: {}", s)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Handout {
    pub id: Uuid,
    pub campaign_id: Uuid,
    pub title: String,
    pub content: String,
    pub visibility: HandoutVisibility,
    pub player_ids: Vec<Uuid>,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct HandoutSummary {
    pub id: Uuid,
    pub title: String,
    pub visibility: HandoutVisibility,
    pub player_ids: Vec<Uuid>,
    pub updated_at: DateTime<Utc>,
}

fn default_dm_only() -> HandoutVisibility {
    HandoutVisibility::DmOnly
}

fn default_empty_string() -> String {
    String::new()
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CreateHandoutRequest {
    pub title: String,
    #[serde(default = "default_empty_string")]
    pub content: String,
    #[serde(default = "default_dm_only")]
    pub visibility: HandoutVisibility,
    #[serde(default)]
    pub player_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UpdateHandoutRequest {
    pub title: Option<String>,
    pub content: Option<String>,
    pub visibility: Option<HandoutVisibility>,
    pub player_ids: Option<Vec<Uuid>>,
}
