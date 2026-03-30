use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use ts_rs::TS;
use uuid::Uuid;

use crate::game_system::BonusEntry;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Character {
    pub id: Uuid,
    pub campaign_id: Uuid,
    pub owner_id: Uuid,
    pub game_system_id: String,
    pub name: String,
    pub portrait_asset_id: Option<Uuid>,
    pub visible_to_players: bool,
    pub fields: HashMap<String, serde_json::Value>,
    pub bonuses: HashMap<String, Vec<BonusEntry>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CreateCharacterRequest {
    pub game_system_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub portrait_asset_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UpdateCharacterRequest {
    pub name: Option<String>,
    pub portrait_asset_id: Option<Option<Uuid>>,
    pub visible_to_players: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CharacterExport {
    pub format: String,
    pub game_system_id: String,
    pub game_system_version: String,
    pub name: String,
    pub fields: HashMap<String, serde_json::Value>,
    pub bonuses: HashMap<String, Vec<BonusEntry>>,
    pub exported_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AddBonusRequest {
    pub field_id: String,
    pub source: String,
    pub bonus_type: String,
    pub value: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UpdateBonusRequest {
    pub source: Option<String>,
    pub bonus_type: Option<String>,
    pub value: Option<i64>,
}
