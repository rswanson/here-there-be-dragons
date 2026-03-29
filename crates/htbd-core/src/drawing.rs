use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum DrawingType {
    Freehand,
    Line,
    Rectangle,
    Circle,
    Polygon,
    AoeCone,
    AoeCube,
    AoeSphere,
    AoeLine,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Drawing {
    pub id: Uuid,
    pub layer_id: Uuid,
    pub drawing_type: DrawingType,
    pub points: serde_json::Value,
    pub stroke_color: String,
    pub stroke_width: f32,
    pub stroke_opacity: f32,
    pub fill_color: Option<String>,
    pub fill_opacity: f32,
    pub created_at: DateTime<Utc>,
}

/// Request type for creating a drawing
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CreateDrawingRequest {
    pub drawing_type: DrawingType,
    pub points: serde_json::Value,
    #[serde(default = "default_stroke_color")]
    pub stroke_color: String,
    #[serde(default = "default_stroke_width")]
    pub stroke_width: f32,
    #[serde(default = "default_full_opacity")]
    pub stroke_opacity: f32,
    pub fill_color: Option<String>,
    #[serde(default = "default_fill_opacity")]
    pub fill_opacity: f32,
}

fn default_stroke_color() -> String {
    "#ffffff".to_string()
}
fn default_stroke_width() -> f32 {
    2.0
}
fn default_full_opacity() -> f32 {
    1.0
}
fn default_fill_opacity() -> f32 {
    0.3
}

/// Request type for updating a drawing
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UpdateDrawingRequest {
    pub points: Option<serde_json::Value>,
    pub stroke_color: Option<String>,
    pub stroke_width: Option<f32>,
    pub stroke_opacity: Option<f32>,
    pub fill_color: Option<Option<String>>,
    pub fill_opacity: Option<f32>,
}
