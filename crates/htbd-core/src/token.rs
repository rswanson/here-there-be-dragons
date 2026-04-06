use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Token {
    pub id: Uuid,
    pub layer_id: Uuid,
    pub name: String,
    pub asset_id: Option<Uuid>,
    pub owner_id: Option<Uuid>,
    pub x: f32,
    pub y: f32,
    pub size: i32,
    pub rotation: f32,
    pub bars: Vec<TokenBar>,
    pub status_markers: Vec<String>,
    pub has_vision: bool,
    pub vision_range: f32,
    pub darkvision_range: f32,
    pub light_bright: f32,
    pub light_dim: f32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TokenBar {
    pub label: String,
    pub current: f32,
    pub max: f32,
    pub color: String,
    pub visibility: BarVisibility,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum BarVisibility {
    Everyone,
    DmOnly,
    OwnerAndDm,
}

/// Well-known status marker IDs for D&D 3.5e conditions.
pub const STATUS_MARKERS_3_5E: &[&str] = &[
    "blinded",
    "charmed",
    "confused",
    "dazed",
    "dazzled",
    "deafened",
    "entangled",
    "exhausted",
    "fascinated",
    "fatigued",
    "frightened",
    "grappled",
    "helpless",
    "invisible",
    "nauseated",
    "paralyzed",
    "prone",
    "shaken",
    "sickened",
    "stunned",
];

/// Request type for creating a token
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CreateTokenRequest {
    pub name: String,
    pub asset_id: Option<Uuid>,
    pub owner_id: Option<Uuid>,
    #[serde(default)]
    pub x: f32,
    #[serde(default)]
    pub y: f32,
    #[serde(default = "default_size")]
    pub size: i32,
    #[serde(default)]
    pub rotation: f32,
    #[serde(default)]
    pub bars: Vec<TokenBar>,
    #[serde(default)]
    pub status_markers: Vec<String>,
    #[serde(default)]
    pub has_vision: bool,
    #[serde(default)]
    pub vision_range: f32,
    #[serde(default)]
    pub darkvision_range: f32,
    #[serde(default)]
    pub light_bright: f32,
    #[serde(default)]
    pub light_dim: f32,
}

fn default_size() -> i32 {
    1
}

/// Request type for updating a token (all fields optional for PATCH)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UpdateTokenRequest {
    pub name: Option<String>,
    pub asset_id: Option<Option<Uuid>>,
    pub owner_id: Option<Option<Uuid>>,
    pub x: Option<f32>,
    pub y: Option<f32>,
    pub size: Option<i32>,
    pub rotation: Option<f32>,
    pub bars: Option<Vec<TokenBar>>,
    pub status_markers: Option<Vec<String>>,
    pub has_vision: Option<bool>,
    pub vision_range: Option<f32>,
    pub darkvision_range: Option<f32>,
    pub light_bright: Option<f32>,
    pub light_dim: Option<f32>,
}
