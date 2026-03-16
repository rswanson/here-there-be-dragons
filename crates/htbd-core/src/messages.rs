use crate::drawing::{CreateDrawingRequest, Drawing, UpdateDrawingRequest};
use crate::map::{MapImage, MapLayer, PlaceMapImageRequest, UpdateMapImageRequest};
use crate::token::{CreateTokenRequest, Token, UpdateTokenRequest};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

/// Messages sent from client to server
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "type", content = "payload")]
pub enum ClientMessage {
    Ping,
    CreateToken {
        layer_id: Uuid,
        token: CreateTokenRequest,
    },
    MoveToken {
        token_id: Uuid,
        x: f32,
        y: f32,
    },
    UpdateToken {
        token_id: Uuid,
        patch: UpdateTokenRequest,
    },
    DeleteToken {
        token_id: Uuid,
    },
    CreateDrawing {
        layer_id: Uuid,
        drawing: CreateDrawingRequest,
    },
    UpdateDrawing {
        drawing_id: Uuid,
        patch: UpdateDrawingRequest,
    },
    DeleteDrawing {
        drawing_id: Uuid,
    },
    ReorderLayers {
        map_id: Uuid,
        layer_ids: Vec<Uuid>,
    },
    PlaceMapImage {
        layer_id: Uuid,
        image: PlaceMapImageRequest,
    },
    UpdateMapImage {
        image_id: Uuid,
        patch: UpdateMapImageRequest,
    },
    DeleteMapImage {
        image_id: Uuid,
    },
}

/// Messages sent from server to client
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "type", content = "payload")]
pub enum ServerMessage {
    Pong,
    Error {
        code: String,
        message: String,
    },
    TokenCreated {
        layer_id: Uuid,
        token: Token,
        created_by: Uuid,
    },
    TokenMoved {
        token_id: Uuid,
        x: f32,
        y: f32,
        moved_by: Uuid,
    },
    TokenUpdated {
        token_id: Uuid,
        patch: UpdateTokenRequest,
        updated_by: Uuid,
    },
    TokenDeleted {
        token_id: Uuid,
        deleted_by: Uuid,
    },
    DrawingCreated {
        layer_id: Uuid,
        drawing: Drawing,
    },
    DrawingUpdated {
        drawing_id: Uuid,
        patch: UpdateDrawingRequest,
    },
    DrawingDeleted {
        drawing_id: Uuid,
    },
    LayerUpdated {
        layer: MapLayer,
    },
    MapImagePlaced {
        layer_id: Uuid,
        image: MapImage,
    },
    MapImageUpdated {
        image_id: Uuid,
        patch: UpdateMapImageRequest,
    },
    MapImageDeleted {
        image_id: Uuid,
    },
}
