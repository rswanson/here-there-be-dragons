use crate::drawing::{CreateDrawingRequest, Drawing, UpdateDrawingRequest};
use crate::game_system::BonusEntry;
use crate::map::{Map, MapImage, MapLayer, PlaceMapImageRequest, UpdateMapImageRequest};
use crate::token::{CreateTokenRequest, Token, UpdateTokenRequest};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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
    JoinSession {
        campaign_id: Uuid,
    },
    LeaveSession {},
    RequestFullState {
        map_id: Uuid,
    },
    UpdateCharacterFields {
        character_id: Uuid,
        fields: HashMap<String, serde_json::Value>,
    },
    AddCharacterBonus {
        character_id: Uuid,
        field_id: String,
        source: String,
        bonus_type: String,
        value: i64,
    },
    RemoveCharacterBonus {
        character_id: Uuid,
        bonus_id: Uuid,
    },
    UpdateCharacterBonus {
        character_id: Uuid,
        bonus_id: Uuid,
        source: Option<String>,
        bonus_type: Option<String>,
        value: Option<i64>,
    },
    LinkTokenToCharacter {
        token_id: Uuid,
        character_id: Option<Uuid>,
    },
}

/// A connected user in a session
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ConnectedUser {
    pub user_id: Uuid,
    pub display_name: String,
    pub role: String,
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
    LayerCreated {
        layer: MapLayer,
    },
    LayerUpdated {
        layer: MapLayer,
    },
    LayerDeleted {
        layer_id: Uuid,
    },
    LayersReordered {
        map_id: Uuid,
        layer_ids: Vec<Uuid>,
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
    SessionJoined {
        user_id: Uuid,
        campaign_id: Uuid,
        connected_users: Vec<ConnectedUser>,
    },
    UserJoined {
        user_id: Uuid,
        display_name: String,
    },
    UserLeft {
        user_id: Uuid,
        display_name: String,
    },
    FullState {
        map: Map,
        layers: Vec<MapLayer>,
        tokens: Vec<Token>,
        drawings: Vec<Drawing>,
    },
    CharacterFieldsUpdated {
        character_id: Uuid,
        fields: HashMap<String, serde_json::Value>,
        updated_by: Uuid,
    },
    CharacterBonusAdded {
        character_id: Uuid,
        field_id: String,
        bonus: BonusEntry,
        computed_total: i64,
    },
    CharacterBonusRemoved {
        character_id: Uuid,
        bonus_id: Uuid,
        field_id: String,
        computed_total: i64,
    },
    CharacterBonusUpdated {
        character_id: Uuid,
        bonus: BonusEntry,
        field_id: String,
        computed_total: i64,
    },
    TokenCharacterLinked {
        token_id: Uuid,
        character_id: Option<Uuid>,
    },
}
