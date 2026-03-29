use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Map {
    pub id: Uuid,
    pub campaign_id: Uuid,
    pub name: String,
    pub grid_enabled: bool,
    pub grid_size_px: i32,
    pub grid_color: String,
    pub grid_opacity: f32,
    pub grid_line_width: f32,
    pub grid_scale: f32,
    pub grid_scale_unit: String,
    pub snap_mode: SnapMode,
    pub diagonal_mode: DiagonalMode,
    pub width_squares: i32,
    pub height_squares: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum SnapMode {
    Off,
    Center,
    Corner,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum DiagonalMode {
    DndStandard,
    Euclidean,
    Manhattan,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum LayerType {
    MapImage,
    Token,
    Drawing,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MapLayer {
    pub id: Uuid,
    pub map_id: Uuid,
    pub name: String,
    pub layer_type: LayerType,
    pub sort_order: i32,
    pub visible: bool,
    pub locked: bool,
    pub opacity: f32,
    pub dm_only: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MapImage {
    pub id: Uuid,
    pub layer_id: Uuid,
    pub asset_id: Uuid,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub rotation: f32,
    pub opacity: f32,
}

/// Full map state including all entities on the map
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MapFullState {
    pub map: Map,
    pub layers: Vec<MapLayer>,
    pub tokens: Vec<crate::token::Token>,
    pub drawings: Vec<crate::drawing::Drawing>,
}

/// Request type for creating a new map
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CreateMapRequest {
    pub name: String,
    #[serde(default = "default_true")]
    pub grid_enabled: bool,
    #[serde(default = "default_grid_size")]
    pub grid_size_px: i32,
    #[serde(default = "default_grid_scale")]
    pub grid_scale: f32,
    #[serde(default = "default_width")]
    pub width_squares: i32,
    #[serde(default = "default_height")]
    pub height_squares: i32,
}

fn default_true() -> bool {
    true
}
fn default_grid_size() -> i32 {
    70
}
fn default_grid_scale() -> f32 {
    5.0
}
fn default_width() -> i32 {
    30
}
fn default_height() -> i32 {
    20
}

/// Request type for updating map settings
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UpdateMapRequest {
    pub name: Option<String>,
    pub grid_enabled: Option<bool>,
    pub grid_size_px: Option<i32>,
    pub grid_color: Option<String>,
    pub grid_opacity: Option<f32>,
    pub grid_line_width: Option<f32>,
    pub grid_scale: Option<f32>,
    pub grid_scale_unit: Option<String>,
    pub snap_mode: Option<SnapMode>,
    pub diagonal_mode: Option<DiagonalMode>,
    pub width_squares: Option<i32>,
    pub height_squares: Option<i32>,
}

/// Full map response with layers included
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MapWithLayers {
    #[serde(flatten)]
    pub map: Map,
    pub layers: Vec<MapLayer>,
}

/// Request for creating a layer
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CreateLayerRequest {
    pub name: String,
    pub layer_type: LayerType,
    #[serde(default)]
    pub dm_only: bool,
}

/// Request for updating a layer
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UpdateLayerRequest {
    pub name: Option<String>,
    pub visible: Option<bool>,
    pub locked: Option<bool>,
    pub opacity: Option<f32>,
    pub dm_only: Option<bool>,
}

/// Request for placing an image on a layer
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PlaceMapImageRequest {
    pub asset_id: Uuid,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    #[serde(default)]
    pub rotation: f32,
    #[serde(default = "default_opacity")]
    pub opacity: f32,
}

fn default_opacity() -> f32 {
    1.0
}

/// Request for updating a map image
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UpdateMapImageRequest {
    pub x: Option<f32>,
    pub y: Option<f32>,
    pub width: Option<f32>,
    pub height: Option<f32>,
    pub rotation: Option<f32>,
    pub opacity: Option<f32>,
}
