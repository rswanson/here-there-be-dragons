use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum WallType {
    Wall,
    Door,
    SecretDoor,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum DoorState {
    Closed,
    Open,
    Locked,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Wall {
    pub id: Uuid,
    pub map_id: Uuid,
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
    pub wall_type: WallType,
    pub door_state: DoorState,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CreateWallRequest {
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
    #[serde(default = "default_wall_type")]
    pub wall_type: WallType,
    #[serde(default = "default_door_state")]
    pub door_state: DoorState,
}

fn default_wall_type() -> WallType {
    WallType::Wall
}

fn default_door_state() -> DoorState {
    DoorState::Closed
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UpdateWallRequest {
    pub x1: Option<f32>,
    pub y1: Option<f32>,
    pub x2: Option<f32>,
    pub y2: Option<f32>,
    pub wall_type: Option<WallType>,
    pub door_state: Option<DoorState>,
}
