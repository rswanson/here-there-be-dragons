# SP-1: Grid & Map Rendering Engine — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core canvas system — grid, maps, layers, tokens, drawing tools, and measurement — turning the empty SP-0 canvas into a functional battle map.

**Architecture:** Backend-first, then frontend. Rust types in `htbd-core` are the source of truth — define models and messages first, then DB layer, then REST API routes, then frontend stores and canvas rendering. Each backend task produces types that auto-export to TypeScript via `ts-rs`.

**Tech Stack:** Rust/Axum (backend), PostgreSQL/sqlx (database), React 19/TypeScript (frontend), PixiJS 8 (canvas), Zustand 5 (state), Vitest (unit tests), Playwright (e2e)

---

## File Structure

### Backend — New Files

| File | Responsibility |
|------|---------------|
| `migrations/002_maps_and_layers.sql` | Maps, map_layers, map_images tables |
| `migrations/003_tokens.sql` | Tokens table |
| `migrations/004_drawings.sql` | Drawings table |
| `crates/htbd-core/src/map.rs` | Map, MapLayer, MapImage domain types |
| `crates/htbd-core/src/token.rs` | Token, TokenBar, StatusMarker types |
| `crates/htbd-core/src/drawing.rs` | Drawing, DrawingType, AoE types |
| `crates/db/src/maps.rs` | Map repository (CRUD queries) |
| `crates/db/src/map_layers.rs` | Layer repository (CRUD + reorder) |
| `crates/db/src/map_images.rs` | Map image repository |
| `crates/db/src/tokens.rs` | Token repository |
| `crates/db/src/drawings.rs` | Drawing repository |
| `crates/server/src/routes/maps.rs` | Map REST endpoints |
| `crates/server/src/routes/layers.rs` | Layer REST endpoints |
| `crates/server/src/routes/map_images.rs` | Map image REST endpoints |
| `crates/server/src/routes/tokens.rs` | Token REST endpoints |
| `crates/server/src/routes/drawings.rs` | Drawing REST endpoints |

### Backend — Modified Files

| File | Changes |
|------|---------|
| `crates/htbd-core/src/lib.rs` | Add `pub mod map; pub mod token; pub mod drawing;` + update TS export test |
| `crates/htbd-core/src/messages.rs` | Add SP-1 WebSocket message variants |
| `crates/db/src/lib.rs` | Add `pub mod maps; pub mod map_layers; pub mod map_images; pub mod tokens; pub mod drawings;` |
| `crates/server/src/routes/mod.rs` | Mount new route modules |
| `crates/server/src/routes/ws.rs` | Handle new message types |

### Frontend — New Files

| File | Responsibility |
|------|---------------|
| `client/src/state/map.ts` | Map store — current map, grid settings, layers |
| `client/src/state/tokens.ts` | Token store — tokens, selection, drag state |
| `client/src/state/tools.ts` | Tool store — active tool, draw settings |
| `client/src/state/drawings.ts` | Drawing store — drawing objects, undo/redo |
| `client/src/api/maps.ts` | Map REST API client |
| `client/src/api/tokens.ts` | Token REST API client |
| `client/src/api/drawings.ts` | Drawing REST API client |
| `client/src/canvas/Viewport.ts` | Pan/zoom/culling manager (pure PixiJS class) |
| `client/src/canvas/GridRenderer.ts` | Square grid rendering (pure PixiJS class) |
| `client/src/canvas/LayerManager.ts` | Layer Container management (pure PixiJS class) |
| `client/src/canvas/TokenRenderer.ts` | Token sprite + bars + status rendering |
| `client/src/canvas/TokenInteraction.ts` | Click/drag/select/context-menu handlers |
| `client/src/canvas/DrawingRenderer.ts` | Drawing object rendering (shapes, freehand) |
| `client/src/canvas/DrawingTools.ts` | Tool state machine (freehand, line, rect, etc.) |
| `client/src/canvas/AoeTemplates.ts` | AoE template rendering + affected square calc |
| `client/src/canvas/MeasurementOverlay.ts` | Ruler, waypoint, AoE preview rendering |
| `client/src/canvas/math/grid.ts` | Grid coordinate math (pixel↔grid, snap, distance) |
| `client/src/canvas/math/aoe.ts` | AoE affected-square calculations |
| `client/src/canvas/math/simplify.ts` | Ramer-Douglas-Peucker point simplification |
| `client/src/components/Toolbar.tsx` | Tool selection, draw settings UI |
| `client/src/components/LayerPanel.tsx` | DM layer management panel |
| `client/src/components/TokenInspector.tsx` | Selected token property editor |
| `client/src/components/MapSettings.tsx` | Grid config, scale, snap mode |
| `client/src/components/TokenContextMenu.tsx` | Right-click token menu |

### Frontend — Modified Files

| File | Changes |
|------|---------|
| `client/src/canvas/CanvasView.tsx` | Integrate Viewport, GridRenderer, LayerManager; connect to stores |
| `client/src/state/ui.ts` | Remove `mapAssetUrl` (replaced by map store), keep sidebar/tool state |
| `client/src/pages/Campaign.tsx` | Add Toolbar, LayerPanel, TokenInspector, MapSettings panels |
| `client/src/api/client.ts` | Add `api.maps`, `api.tokens`, `api.drawings` namespaces |

---

## Chunk 1: Backend Data Model & Database Layer

Tasks 1–5 establish the Rust domain types, database migrations, and repository queries. After this chunk, all SP-1 data can be created, read, updated, and deleted via the DB layer, and types auto-export to TypeScript.

### Task 1: Domain Types — Maps & Layers

**Files:**
- Create: `crates/htbd-core/src/map.rs`
- Modify: `crates/htbd-core/src/lib.rs`

- [ ] **Step 1: Create map.rs with Map, MapLayer, MapImage types**

```rust
// crates/htbd-core/src/map.rs
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

fn default_true() -> bool { true }
fn default_grid_size() -> i32 { 70 }
fn default_grid_scale() -> f32 { 5.0 }
fn default_width() -> i32 { 30 }
fn default_height() -> i32 { 20 }

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

fn default_opacity() -> f32 { 1.0 }

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
```

- [ ] **Step 2: Register module and update TS export test in lib.rs**

Add `pub mod map;` to `crates/htbd-core/src/lib.rs` and add the new types to the existing `export_all_bindings` test.

- [ ] **Step 3: Verify types compile and TS bindings generate**

Run: `cargo test -p htbd-core`

Expected: All tests pass, new `.ts` files appear in `client/src/types/` for Map, MapLayer, MapImage, SnapMode, DiagonalMode, LayerType, and all request types.

- [ ] **Step 4: Commit**

```bash
git add crates/htbd-core/src/map.rs crates/htbd-core/src/lib.rs client/src/types/
git commit -m "feat(core): add Map, MapLayer, MapImage domain types with TS bindings"
```

---

### Task 2: Domain Types — Tokens

**Files:**
- Create: `crates/htbd-core/src/token.rs`
- Modify: `crates/htbd-core/src/lib.rs`

- [ ] **Step 1: Create token.rs with Token, TokenBar, StatusMarker types**

```rust
// crates/htbd-core/src/token.rs
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
/// Status markers are stored as strings (not an enum) to allow future extensibility.
/// The frontend will map these well-known IDs to icons.
pub const STATUS_MARKERS_3_5E: &[&str] = &[
    "blinded", "charmed", "confused", "dazed", "dazzled", "deafened",
    "entangled", "exhausted", "fascinated", "fatigued", "frightened",
    "grappled", "helpless", "invisible", "nauseated", "paralyzed",
    "prone", "shaken", "sickened", "stunned",
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
}

fn default_size() -> i32 { 1 }

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
}
```

- [ ] **Step 2: Register module in lib.rs and update TS export test**

Add `pub mod token;` to `crates/htbd-core/src/lib.rs`.

- [ ] **Step 3: Verify compilation and TS generation**

Run: `cargo test -p htbd-core`

Expected: PASS. New TS files for Token, TokenBar, BarVisibility, CreateTokenRequest, UpdateTokenRequest.

- [ ] **Step 4: Commit**

```bash
git add crates/htbd-core/src/token.rs crates/htbd-core/src/lib.rs client/src/types/
git commit -m "feat(core): add Token, TokenBar, StatusMarker domain types with TS bindings"
```

---

### Task 3: Domain Types — Drawings & WebSocket Messages

**Files:**
- Create: `crates/htbd-core/src/drawing.rs`
- Modify: `crates/htbd-core/src/lib.rs`
- Modify: `crates/htbd-core/src/messages.rs`

- [ ] **Step 1: Create drawing.rs with Drawing and DrawingType types**

```rust
// crates/htbd-core/src/drawing.rs
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

fn default_stroke_color() -> String { "#ffffff".to_string() }
fn default_stroke_width() -> f32 { 2.0 }
fn default_full_opacity() -> f32 { 1.0 }
fn default_fill_opacity() -> f32 { 0.3 }

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
```

- [ ] **Step 2: Add SP-1 WebSocket message variants to messages.rs**

Add these variants to the existing `ClientMessage` and `ServerMessage` enums in `crates/htbd-core/src/messages.rs`:

```rust
// Add to ClientMessage enum:
    CreateToken { layer_id: Uuid, token: CreateTokenRequest },
    MoveToken { token_id: Uuid, x: f32, y: f32 },
    UpdateToken { token_id: Uuid, patch: UpdateTokenRequest },
    DeleteToken { token_id: Uuid },
    CreateDrawing { layer_id: Uuid, drawing: CreateDrawingRequest },
    UpdateDrawing { drawing_id: Uuid, patch: UpdateDrawingRequest },
    DeleteDrawing { drawing_id: Uuid },
    ReorderLayers { map_id: Uuid, layer_ids: Vec<Uuid> },
    PlaceMapImage { layer_id: Uuid, image: PlaceMapImageRequest },
    UpdateMapImage { image_id: Uuid, patch: UpdateMapImageRequest },
    DeleteMapImage { image_id: Uuid },

// Add to ServerMessage enum:
    TokenCreated { layer_id: Uuid, token: Token, created_by: Uuid },
    TokenMoved { token_id: Uuid, x: f32, y: f32, moved_by: Uuid },
    TokenUpdated { token_id: Uuid, patch: UpdateTokenRequest, updated_by: Uuid },
    TokenDeleted { token_id: Uuid, deleted_by: Uuid },
    DrawingCreated { layer_id: Uuid, drawing: Drawing },
    DrawingUpdated { drawing_id: Uuid, patch: UpdateDrawingRequest },
    DrawingDeleted { drawing_id: Uuid },
    LayerUpdated { layer: MapLayer },
    MapImagePlaced { layer_id: Uuid, image: MapImage },
    MapImageUpdated { image_id: Uuid, patch: UpdateMapImageRequest },
    MapImageDeleted { image_id: Uuid },
```

Add necessary `use` imports at the top of messages.rs for the new types from `crate::map`, `crate::token`, `crate::drawing`.

- [ ] **Step 3: Register drawing module in lib.rs and update TS export test**

Add `pub mod drawing;` to `crates/htbd-core/src/lib.rs`.

- [ ] **Step 4: Verify compilation and TS generation**

Run: `cargo test -p htbd-core`

Expected: PASS. New TS files for Drawing, DrawingType, and updated ClientMessage/ServerMessage types.

- [ ] **Step 5: Commit**

```bash
git add crates/htbd-core/ client/src/types/
git commit -m "feat(core): add Drawing types and SP-1 WebSocket message variants"
```

---

### Task 4: Database Migrations

**Files:**
- Create: `migrations/002_maps_and_layers.sql`
- Create: `migrations/003_tokens.sql`
- Create: `migrations/004_drawings.sql`

- [ ] **Step 1: Create migration for maps and layers**

```sql
-- migrations/002_maps_and_layers.sql

CREATE TABLE maps (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id      UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    grid_enabled     BOOLEAN NOT NULL DEFAULT true,
    grid_size_px     INTEGER NOT NULL DEFAULT 70,
    grid_color       TEXT NOT NULL DEFAULT '#000000',
    grid_opacity     REAL NOT NULL DEFAULT 0.3,
    grid_line_width  REAL NOT NULL DEFAULT 1.0,
    grid_scale       REAL NOT NULL DEFAULT 5.0,
    grid_scale_unit  TEXT NOT NULL DEFAULT 'ft',
    snap_mode        TEXT NOT NULL DEFAULT 'center'
                     CHECK (snap_mode IN ('off', 'center', 'corner')),
    diagonal_mode    TEXT NOT NULL DEFAULT 'dnd_standard'
                     CHECK (diagonal_mode IN ('dnd_standard', 'euclidean', 'manhattan')),
    width_squares    INTEGER NOT NULL DEFAULT 30,
    height_squares   INTEGER NOT NULL DEFAULT 20,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_maps_campaign_id ON maps(campaign_id);

CREATE TABLE map_layers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id      UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    layer_type  TEXT NOT NULL CHECK (layer_type IN ('map_image', 'token', 'drawing')),
    sort_order  INTEGER NOT NULL DEFAULT 0,
    visible     BOOLEAN NOT NULL DEFAULT true,
    locked      BOOLEAN NOT NULL DEFAULT false,
    opacity     REAL NOT NULL DEFAULT 1.0,
    dm_only     BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_map_layers_map_id ON map_layers(map_id);

CREATE TABLE map_images (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layer_id    UUID NOT NULL REFERENCES map_layers(id) ON DELETE CASCADE,
    asset_id    UUID NOT NULL REFERENCES assets(id),
    x           REAL NOT NULL DEFAULT 0,
    y           REAL NOT NULL DEFAULT 0,
    width       REAL NOT NULL,
    height      REAL NOT NULL,
    rotation    REAL NOT NULL DEFAULT 0,
    opacity     REAL NOT NULL DEFAULT 1.0
);

CREATE INDEX idx_map_images_layer_id ON map_images(layer_id);
```

- [ ] **Step 2: Create migration for tokens**

```sql
-- migrations/003_tokens.sql

CREATE TABLE tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layer_id        UUID NOT NULL REFERENCES map_layers(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    asset_id        UUID REFERENCES assets(id),
    owner_id        UUID REFERENCES users(id),
    x               REAL NOT NULL DEFAULT 0,
    y               REAL NOT NULL DEFAULT 0,
    size            INTEGER NOT NULL DEFAULT 1 CHECK (size BETWEEN 1 AND 4),
    rotation        REAL NOT NULL DEFAULT 0,
    bars_json       JSONB NOT NULL DEFAULT '[]',
    status_markers  TEXT[] NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tokens_layer_id ON tokens(layer_id);
CREATE INDEX idx_tokens_owner_id ON tokens(owner_id);
```

- [ ] **Step 3: Create migration for drawings**

```sql
-- migrations/004_drawings.sql

CREATE TABLE drawings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layer_id        UUID NOT NULL REFERENCES map_layers(id) ON DELETE CASCADE,
    drawing_type    TEXT NOT NULL CHECK (drawing_type IN
                    ('freehand', 'line', 'rectangle', 'circle', 'polygon',
                     'aoe_cone', 'aoe_cube', 'aoe_sphere', 'aoe_line')),
    points_json     JSONB NOT NULL,
    stroke_color    TEXT NOT NULL DEFAULT '#ffffff',
    stroke_width    REAL NOT NULL DEFAULT 2,
    stroke_opacity  REAL NOT NULL DEFAULT 1.0,
    fill_color      TEXT,
    fill_opacity    REAL NOT NULL DEFAULT 0.3,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_drawings_layer_id ON drawings(layer_id);
```

- [ ] **Step 4: Apply migrations against local DB**

Run: `sqlx migrate run` (from workspace root, with `DATABASE_URL` set)

Expected: 3 new migrations applied successfully.

- [ ] **Step 5: Regenerate offline query data**

Run: `cargo sqlx prepare --workspace`

Expected: `.sqlx/` directory updated with new table schemas.

- [ ] **Step 6: Commit**

```bash
git add migrations/ .sqlx/
git commit -m "feat(db): add migrations for maps, layers, tokens, drawings"
```

---

### Task 5: Database Repository — Maps

**Files:**
- Create: `crates/db/src/maps.rs`
- Modify: `crates/db/src/lib.rs`

- [ ] **Step 1: Write failing test for map creation**

Add to a test block at the bottom of `crates/db/src/maps.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;

    // Tests require a running PostgreSQL with migrations applied.
    // Use `DATABASE_URL` env var.

    #[sqlx::test(migrations = "../migrations")]
    async fn test_create_and_find_map(pool: PgPool) {
        // First create a user and campaign (required FK references)
        let user = crate::users::create_user(&pool, "dm@test.com", "hash", "DM").await.unwrap();
        let campaign = crate::campaigns::create_campaign(&pool, &user.id, "Test Campaign").await.unwrap();

        let map = create_map(&pool, &campaign.id, "Tavern").await.unwrap();
        assert_eq!(map.name, "Tavern");
        assert!(map.grid_enabled);
        assert_eq!(map.grid_size_px, 70);
        assert_eq!(map.width_squares, 30);
        assert_eq!(map.height_squares, 20);

        let found = find_by_id(&pool, &map.id).await.unwrap().unwrap();
        assert_eq!(found.id, map.id);
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn test_list_maps_for_campaign(pool: PgPool) {
        let user = crate::users::create_user(&pool, "dm@test.com", "hash", "DM").await.unwrap();
        let campaign = crate::campaigns::create_campaign(&pool, &user.id, "Test Campaign").await.unwrap();

        create_map(&pool, &campaign.id, "Map A").await.unwrap();
        create_map(&pool, &campaign.id, "Map B").await.unwrap();

        let maps = list_for_campaign(&pool, &campaign.id).await.unwrap();
        assert_eq!(maps.len(), 2);
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn test_update_map(pool: PgPool) {
        let user = crate::users::create_user(&pool, "dm@test.com", "hash", "DM").await.unwrap();
        let campaign = crate::campaigns::create_campaign(&pool, &user.id, "Test Campaign").await.unwrap();
        let map = create_map(&pool, &campaign.id, "Old Name").await.unwrap();

        let updated = update_map(&pool, &map.id, Some("New Name"), None, None, None, None, None, None, None, None, None, None, None).await.unwrap().unwrap();
        assert_eq!(updated.name, "New Name");
        assert!(updated.grid_enabled); // unchanged
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn test_delete_map(pool: PgPool) {
        let user = crate::users::create_user(&pool, "dm@test.com", "hash", "DM").await.unwrap();
        let campaign = crate::campaigns::create_campaign(&pool, &user.id, "Test Campaign").await.unwrap();
        let map = create_map(&pool, &campaign.id, "Deletable").await.unwrap();

        delete_map(&pool, &map.id).await.unwrap();
        let found = find_by_id(&pool, &map.id).await.unwrap();
        assert!(found.is_none());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p db -- maps`

Expected: FAIL — functions `create_map`, `find_by_id`, etc. don't exist yet.

- [ ] **Step 3: Implement maps.rs repository**

```rust
// crates/db/src/maps.rs
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub struct MapRow {
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
    pub snap_mode: String,
    pub diagonal_mode: String,
    pub width_squares: i32,
    pub height_squares: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<MapRow> for htbd_core::map::Map {
    fn from(row: MapRow) -> Self {
        Self {
            id: row.id,
            campaign_id: row.campaign_id,
            name: row.name,
            grid_enabled: row.grid_enabled,
            grid_size_px: row.grid_size_px,
            grid_color: row.grid_color,
            grid_opacity: row.grid_opacity,
            grid_line_width: row.grid_line_width,
            grid_scale: row.grid_scale,
            grid_scale_unit: row.grid_scale_unit,
            snap_mode: serde_json::from_value(
                serde_json::Value::String(row.snap_mode)
            ).unwrap_or(htbd_core::map::SnapMode::Center),
            diagonal_mode: serde_json::from_value(
                serde_json::Value::String(row.diagonal_mode)
            ).unwrap_or(htbd_core::map::DiagonalMode::DndStandard),
            width_squares: row.width_squares,
            height_squares: row.height_squares,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

pub async fn create_map(
    pool: &PgPool,
    campaign_id: &Uuid,
    name: &str,
) -> Result<MapRow, sqlx::Error> {
    sqlx::query_as!(
        MapRow,
        r#"INSERT INTO maps (campaign_id, name)
           VALUES ($1, $2)
           RETURNING *"#,
        campaign_id,
        name
    )
    .fetch_one(pool)
    .await
}

pub async fn find_by_id(
    pool: &PgPool,
    id: &Uuid,
) -> Result<Option<MapRow>, sqlx::Error> {
    sqlx::query_as!(
        MapRow,
        "SELECT * FROM maps WHERE id = $1",
        id
    )
    .fetch_optional(pool)
    .await
}

pub async fn list_for_campaign(
    pool: &PgPool,
    campaign_id: &Uuid,
) -> Result<Vec<MapRow>, sqlx::Error> {
    sqlx::query_as!(
        MapRow,
        "SELECT * FROM maps WHERE campaign_id = $1 ORDER BY created_at DESC",
        campaign_id
    )
    .fetch_all(pool)
    .await
}

#[allow(clippy::too_many_arguments)]
pub async fn update_map(
    pool: &PgPool,
    id: &Uuid,
    name: Option<&str>,
    grid_enabled: Option<bool>,
    grid_size_px: Option<i32>,
    grid_color: Option<&str>,
    grid_opacity: Option<f32>,
    grid_line_width: Option<f32>,
    grid_scale: Option<f32>,
    grid_scale_unit: Option<&str>,
    snap_mode: Option<&str>,
    diagonal_mode: Option<&str>,
    width_squares: Option<i32>,
    height_squares: Option<i32>,
) -> Result<Option<MapRow>, sqlx::Error> {
    sqlx::query_as!(
        MapRow,
        r#"UPDATE maps SET
            name = COALESCE($2, name),
            grid_enabled = COALESCE($3, grid_enabled),
            grid_size_px = COALESCE($4, grid_size_px),
            grid_color = COALESCE($5, grid_color),
            grid_opacity = COALESCE($6, grid_opacity),
            grid_line_width = COALESCE($7, grid_line_width),
            grid_scale = COALESCE($8, grid_scale),
            grid_scale_unit = COALESCE($9, grid_scale_unit),
            snap_mode = COALESCE($10, snap_mode),
            diagonal_mode = COALESCE($11, diagonal_mode),
            width_squares = COALESCE($12, width_squares),
            height_squares = COALESCE($13, height_squares),
            updated_at = now()
        WHERE id = $1
        RETURNING *"#,
        id, name, grid_enabled, grid_size_px, grid_color, grid_opacity,
        grid_line_width, grid_scale, grid_scale_unit, snap_mode,
        diagonal_mode, width_squares, height_squares
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_map(
    pool: &PgPool,
    id: &Uuid,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM maps WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}
```

- [ ] **Step 4: Register module in db/src/lib.rs**

Add `pub mod maps;` to `crates/db/src/lib.rs`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test -p db -- maps`

Expected: All 4 tests PASS.

- [ ] **Step 6: Regenerate sqlx offline data**

Run: `cargo sqlx prepare --workspace`

- [ ] **Step 7: Commit**

```bash
git add crates/db/src/maps.rs crates/db/src/lib.rs .sqlx/
git commit -m "feat(db): add maps repository with CRUD queries"
```

---

### Task 6: Database Repository — Layers

**Files:**
- Create: `crates/db/src/map_layers.rs`
- Modify: `crates/db/src/lib.rs`

- [ ] **Step 1: Write failing tests for layer operations**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;

    async fn setup_map(pool: &PgPool) -> (uuid::Uuid, uuid::Uuid) {
        let user = crate::users::create_user(pool, "dm@test.com", "hash", "DM").await.unwrap();
        let campaign = crate::campaigns::create_campaign(pool, &user.id, "Campaign").await.unwrap();
        let map = crate::maps::create_map(pool, &campaign.id, "Map").await.unwrap();
        (campaign.id, map.id)
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn test_create_default_layers(pool: PgPool) {
        let (_, map_id) = setup_map(&pool).await;
        let layers = create_default_layers(&pool, &map_id).await.unwrap();
        assert_eq!(layers.len(), 3);
        assert_eq!(layers[0].name, "Background");
        assert_eq!(layers[0].layer_type, "map_image");
        assert_eq!(layers[1].name, "Tokens");
        assert_eq!(layers[1].layer_type, "token");
        assert_eq!(layers[2].name, "DM Notes");
        assert!(layers[2].dm_only);
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn test_create_and_list_layers(pool: PgPool) {
        let (_, map_id) = setup_map(&pool).await;
        create_layer(&pool, &map_id, "Custom", "drawing", false).await.unwrap();
        create_layer(&pool, &map_id, "Enemies", "token", true).await.unwrap();

        let layers = list_for_map(&pool, &map_id).await.unwrap();
        assert_eq!(layers.len(), 2);
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn test_reorder_layers(pool: PgPool) {
        let (_, map_id) = setup_map(&pool).await;
        let layers = create_default_layers(&pool, &map_id).await.unwrap();
        let ids: Vec<Uuid> = vec![layers[2].id, layers[0].id, layers[1].id];

        reorder_layers(&pool, &map_id, &ids).await.unwrap();

        let reordered = list_for_map(&pool, &map_id).await.unwrap();
        assert_eq!(reordered[0].id, layers[2].id);
        assert_eq!(reordered[0].sort_order, 0);
        assert_eq!(reordered[1].id, layers[0].id);
        assert_eq!(reordered[1].sort_order, 1);
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn test_list_for_map_excludes_dm_only(pool: PgPool) {
        let (_, map_id) = setup_map(&pool).await;
        create_default_layers(&pool, &map_id).await.unwrap();

        let player_layers = list_for_map_player(&pool, &map_id).await.unwrap();
        // Default layers include "DM Notes" (dm_only=true), so player should see 2
        assert_eq!(player_layers.len(), 2);
        assert!(player_layers.iter().all(|l| !l.dm_only));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p db -- map_layers`

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement map_layers.rs repository**

```rust
// crates/db/src/map_layers.rs
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub struct MapLayerRow {
    pub id: Uuid,
    pub map_id: Uuid,
    pub name: String,
    pub layer_type: String,
    pub sort_order: i32,
    pub visible: bool,
    pub locked: bool,
    pub opacity: f32,
    pub dm_only: bool,
    pub created_at: DateTime<Utc>,
}

impl From<MapLayerRow> for htbd_core::map::MapLayer {
    fn from(row: MapLayerRow) -> Self {
        Self {
            id: row.id,
            map_id: row.map_id,
            name: row.name,
            layer_type: serde_json::from_value(
                serde_json::Value::String(row.layer_type)
            ).unwrap_or(htbd_core::map::LayerType::Drawing),
            sort_order: row.sort_order,
            visible: row.visible,
            locked: row.locked,
            opacity: row.opacity,
            dm_only: row.dm_only,
            created_at: row.created_at,
        }
    }
}

pub async fn create_layer(
    pool: &PgPool,
    map_id: &Uuid,
    name: &str,
    layer_type: &str,
    dm_only: bool,
) -> Result<MapLayerRow, sqlx::Error> {
    // Auto-assign sort_order as max + 1
    let max_order: Option<i32> = sqlx::query_scalar!(
        "SELECT MAX(sort_order) FROM map_layers WHERE map_id = $1",
        map_id
    )
    .fetch_one(pool)
    .await?;

    let sort_order = max_order.unwrap_or(-1) + 1;

    sqlx::query_as!(
        MapLayerRow,
        r#"INSERT INTO map_layers (map_id, name, layer_type, sort_order, dm_only)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *"#,
        map_id, name, layer_type, sort_order, dm_only
    )
    .fetch_one(pool)
    .await
}

/// Creates the three default layers for a new map
pub async fn create_default_layers(
    pool: &PgPool,
    map_id: &Uuid,
) -> Result<Vec<MapLayerRow>, sqlx::Error> {
    let bg = create_layer(pool, map_id, "Background", "map_image", false).await?;
    let tokens = create_layer(pool, map_id, "Tokens", "token", false).await?;
    let dm = create_layer(pool, map_id, "DM Notes", "drawing", true).await?;
    Ok(vec![bg, tokens, dm])
}

pub async fn find_by_id(
    pool: &PgPool,
    id: &Uuid,
) -> Result<Option<MapLayerRow>, sqlx::Error> {
    sqlx::query_as!(
        MapLayerRow,
        "SELECT * FROM map_layers WHERE id = $1",
        id
    )
    .fetch_optional(pool)
    .await
}

/// List all layers for a map (DM view — includes dm_only)
pub async fn list_for_map(
    pool: &PgPool,
    map_id: &Uuid,
) -> Result<Vec<MapLayerRow>, sqlx::Error> {
    sqlx::query_as!(
        MapLayerRow,
        "SELECT * FROM map_layers WHERE map_id = $1 ORDER BY sort_order ASC",
        map_id
    )
    .fetch_all(pool)
    .await
}

/// List layers visible to players (excludes dm_only)
pub async fn list_for_map_player(
    pool: &PgPool,
    map_id: &Uuid,
) -> Result<Vec<MapLayerRow>, sqlx::Error> {
    sqlx::query_as!(
        MapLayerRow,
        "SELECT * FROM map_layers WHERE map_id = $1 AND dm_only = false ORDER BY sort_order ASC",
        map_id
    )
    .fetch_all(pool)
    .await
}

pub async fn update_layer(
    pool: &PgPool,
    id: &Uuid,
    name: Option<&str>,
    visible: Option<bool>,
    locked: Option<bool>,
    opacity: Option<f32>,
    dm_only: Option<bool>,
) -> Result<Option<MapLayerRow>, sqlx::Error> {
    sqlx::query_as!(
        MapLayerRow,
        r#"UPDATE map_layers SET
            name = COALESCE($2, name),
            visible = COALESCE($3, visible),
            locked = COALESCE($4, locked),
            opacity = COALESCE($5, opacity),
            dm_only = COALESCE($6, dm_only)
        WHERE id = $1
        RETURNING *"#,
        id, name, visible, locked, opacity, dm_only
    )
    .fetch_optional(pool)
    .await
}

pub async fn reorder_layers(
    pool: &PgPool,
    map_id: &Uuid,
    layer_ids: &[Uuid],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    for (i, layer_id) in layer_ids.iter().enumerate() {
        sqlx::query!(
            "UPDATE map_layers SET sort_order = $1 WHERE id = $2 AND map_id = $3",
            i as i32,
            layer_id,
            map_id
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await
}

pub async fn delete_layer(
    pool: &PgPool,
    id: &Uuid,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM map_layers WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

/// Get the map_id for a given layer (used for auth checks)
pub async fn get_map_id_for_layer(
    pool: &PgPool,
    layer_id: &Uuid,
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT map_id FROM map_layers WHERE id = $1",
        layer_id
    )
    .fetch_optional(pool)
    .await
}
```

- [ ] **Step 4: Register module in db/src/lib.rs**

Add `pub mod map_layers;` to `crates/db/src/lib.rs`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test -p db -- map_layers`

Expected: All 4 tests PASS.

- [ ] **Step 6: Regenerate sqlx offline data and commit**

```bash
cargo sqlx prepare --workspace
git add crates/db/src/map_layers.rs crates/db/src/lib.rs .sqlx/
git commit -m "feat(db): add map_layers repository with CRUD, reorder, and player filtering"
```

---

### Task 7: Database Repository — Map Images

**Files:**
- Create: `crates/db/src/map_images.rs`
- Modify: `crates/db/src/lib.rs`

- [ ] **Step 1: Write failing tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;

    async fn setup_layer(pool: &PgPool) -> (Uuid, Uuid, Uuid) {
        let user = crate::users::create_user(pool, "dm@test.com", "hash", "DM").await.unwrap();
        let campaign = crate::campaigns::create_campaign(pool, &user.id, "Campaign").await.unwrap();
        let map = crate::maps::create_map(pool, &campaign.id, "Map").await.unwrap();
        let layer = crate::map_layers::create_layer(pool, &map.id, "Background", "map_image", false).await.unwrap();
        // Create a dummy asset for FK reference
        let asset = crate::assets::create_asset(pool, &campaign.id, &user.id, "map.png", "image/png", "path/map.png", 1024).await.unwrap();
        (layer.id, asset.id, campaign.id)
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn test_place_and_list_images(pool: PgPool) {
        let (layer_id, asset_id, _) = setup_layer(&pool).await;

        let img = place_image(&pool, &layer_id, &asset_id, 0.0, 0.0, 30.0, 20.0, 0.0, 1.0).await.unwrap();
        assert_eq!(img.width, 30.0);

        let images = list_for_layer(&pool, &layer_id).await.unwrap();
        assert_eq!(images.len(), 1);
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn test_update_image(pool: PgPool) {
        let (layer_id, asset_id, _) = setup_layer(&pool).await;
        let img = place_image(&pool, &layer_id, &asset_id, 0.0, 0.0, 30.0, 20.0, 0.0, 1.0).await.unwrap();

        let updated = update_image(&pool, &img.id, Some(5.0), Some(5.0), None, None, None, None).await.unwrap().unwrap();
        assert_eq!(updated.x, 5.0);
        assert_eq!(updated.y, 5.0);
        assert_eq!(updated.width, 30.0); // unchanged
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn test_delete_image(pool: PgPool) {
        let (layer_id, asset_id, _) = setup_layer(&pool).await;
        let img = place_image(&pool, &layer_id, &asset_id, 0.0, 0.0, 30.0, 20.0, 0.0, 1.0).await.unwrap();

        delete_image(&pool, &img.id).await.unwrap();
        let images = list_for_layer(&pool, &layer_id).await.unwrap();
        assert!(images.is_empty());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p db -- map_images`

Expected: FAIL.

- [ ] **Step 3: Implement map_images.rs repository**

```rust
// crates/db/src/map_images.rs
use sqlx::PgPool;
use uuid::Uuid;

pub struct MapImageRow {
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

impl From<MapImageRow> for htbd_core::map::MapImage {
    fn from(row: MapImageRow) -> Self {
        Self {
            id: row.id,
            layer_id: row.layer_id,
            asset_id: row.asset_id,
            x: row.x,
            y: row.y,
            width: row.width,
            height: row.height,
            rotation: row.rotation,
            opacity: row.opacity,
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn place_image(
    pool: &PgPool,
    layer_id: &Uuid,
    asset_id: &Uuid,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    rotation: f32,
    opacity: f32,
) -> Result<MapImageRow, sqlx::Error> {
    sqlx::query_as!(
        MapImageRow,
        r#"INSERT INTO map_images (layer_id, asset_id, x, y, width, height, rotation, opacity)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *"#,
        layer_id, asset_id, x, y, width, height, rotation, opacity
    )
    .fetch_one(pool)
    .await
}

pub async fn find_by_id(
    pool: &PgPool,
    id: &Uuid,
) -> Result<Option<MapImageRow>, sqlx::Error> {
    sqlx::query_as!(
        MapImageRow,
        "SELECT * FROM map_images WHERE id = $1",
        id
    )
    .fetch_optional(pool)
    .await
}

pub async fn list_for_layer(
    pool: &PgPool,
    layer_id: &Uuid,
) -> Result<Vec<MapImageRow>, sqlx::Error> {
    sqlx::query_as!(
        MapImageRow,
        "SELECT * FROM map_images WHERE layer_id = $1",
        layer_id
    )
    .fetch_all(pool)
    .await
}

pub async fn update_image(
    pool: &PgPool,
    id: &Uuid,
    x: Option<f32>,
    y: Option<f32>,
    width: Option<f32>,
    height: Option<f32>,
    rotation: Option<f32>,
    opacity: Option<f32>,
) -> Result<Option<MapImageRow>, sqlx::Error> {
    sqlx::query_as!(
        MapImageRow,
        r#"UPDATE map_images SET
            x = COALESCE($2, x),
            y = COALESCE($3, y),
            width = COALESCE($4, width),
            height = COALESCE($5, height),
            rotation = COALESCE($6, rotation),
            opacity = COALESCE($7, opacity)
        WHERE id = $1
        RETURNING *"#,
        id, x, y, width, height, rotation, opacity
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_image(
    pool: &PgPool,
    id: &Uuid,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM map_images WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

/// Get the layer_id for auth checks
pub async fn get_layer_id_for_image(
    pool: &PgPool,
    image_id: &Uuid,
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT layer_id FROM map_images WHERE id = $1",
        image_id
    )
    .fetch_optional(pool)
    .await
}
```

- [ ] **Step 4: Register module and run tests**

Add `pub mod map_images;` to `crates/db/src/lib.rs`.

Run: `cargo test -p db -- map_images`

Expected: All 3 tests PASS.

- [ ] **Step 5: Regenerate sqlx offline data and commit**

```bash
cargo sqlx prepare --workspace
git add crates/db/src/map_images.rs crates/db/src/lib.rs .sqlx/
git commit -m "feat(db): add map_images repository"
```

---

### Task 8: Database Repository — Tokens

**Files:**
- Create: `crates/db/src/tokens.rs`
- Modify: `crates/db/src/lib.rs`

- [ ] **Step 1: Write failing tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;

    async fn setup_token_layer(pool: &PgPool) -> (Uuid, Uuid) {
        let user = crate::users::create_user(pool, "dm@test.com", "hash", "DM").await.unwrap();
        let campaign = crate::campaigns::create_campaign(pool, &user.id, "Campaign").await.unwrap();
        let map = crate::maps::create_map(pool, &campaign.id, "Map").await.unwrap();
        let layer = crate::map_layers::create_layer(pool, &map.id, "Tokens", "token", false).await.unwrap();
        (layer.id, user.id)
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn test_create_and_find_token(pool: PgPool) {
        let (layer_id, user_id) = setup_token_layer(&pool).await;

        let bars = serde_json::json!([{"label": "HP", "current": 20.0, "max": 20.0, "color": "#ff0000", "visibility": "everyone"}]);
        let token = create_token(&pool, &layer_id, "Goblin", None, Some(&user_id), 5.0, 3.0, 1, 0.0, &bars, &["stunned".to_string()]).await.unwrap();
        assert_eq!(token.name, "Goblin");
        assert_eq!(token.x, 5.0);
        assert_eq!(token.status_markers, vec!["stunned"]);

        let found = find_by_id(&pool, &token.id).await.unwrap().unwrap();
        assert_eq!(found.id, token.id);
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn test_update_token_position(pool: PgPool) {
        let (layer_id, _) = setup_token_layer(&pool).await;
        let token = create_token(&pool, &layer_id, "Orc", None, None, 0.0, 0.0, 2, 0.0, &serde_json::json!([]), &[]).await.unwrap();

        let updated = update_token_position(&pool, &token.id, 10.0, 15.0).await.unwrap().unwrap();
        assert_eq!(updated.x, 10.0);
        assert_eq!(updated.y, 15.0);
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn test_delete_token(pool: PgPool) {
        let (layer_id, _) = setup_token_layer(&pool).await;
        let token = create_token(&pool, &layer_id, "Deletable", None, None, 0.0, 0.0, 1, 0.0, &serde_json::json!([]), &[]).await.unwrap();

        delete_token(&pool, &token.id).await.unwrap();
        assert!(find_by_id(&pool, &token.id).await.unwrap().is_none());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p db -- tokens`

Expected: FAIL.

- [ ] **Step 3: Implement tokens.rs repository**

```rust
// crates/db/src/tokens.rs
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub struct TokenRow {
    pub id: Uuid,
    pub layer_id: Uuid,
    pub name: String,
    pub asset_id: Option<Uuid>,
    pub owner_id: Option<Uuid>,
    pub x: f32,
    pub y: f32,
    pub size: i32,
    pub rotation: f32,
    pub bars_json: serde_json::Value,
    pub status_markers: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<TokenRow> for htbd_core::token::Token {
    fn from(row: TokenRow) -> Self {
        let bars: Vec<htbd_core::token::TokenBar> =
            serde_json::from_value(row.bars_json).unwrap_or_default();
        Self {
            id: row.id,
            layer_id: row.layer_id,
            name: row.name,
            asset_id: row.asset_id,
            owner_id: row.owner_id,
            x: row.x,
            y: row.y,
            size: row.size,
            rotation: row.rotation,
            bars,
            status_markers: row.status_markers,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn create_token(
    pool: &PgPool,
    layer_id: &Uuid,
    name: &str,
    asset_id: Option<&Uuid>,
    owner_id: Option<&Uuid>,
    x: f32,
    y: f32,
    size: i32,
    rotation: f32,
    bars_json: &serde_json::Value,
    status_markers: &[String],
) -> Result<TokenRow, sqlx::Error> {
    sqlx::query_as!(
        TokenRow,
        r#"INSERT INTO tokens (layer_id, name, asset_id, owner_id, x, y, size, rotation, bars_json, status_markers)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *"#,
        layer_id, name, asset_id, owner_id, x, y, size, rotation, bars_json, status_markers
    )
    .fetch_one(pool)
    .await
}

pub async fn find_by_id(
    pool: &PgPool,
    id: &Uuid,
) -> Result<Option<TokenRow>, sqlx::Error> {
    sqlx::query_as!(
        TokenRow,
        "SELECT * FROM tokens WHERE id = $1",
        id
    )
    .fetch_optional(pool)
    .await
}

pub async fn list_for_layer(
    pool: &PgPool,
    layer_id: &Uuid,
) -> Result<Vec<TokenRow>, sqlx::Error> {
    sqlx::query_as!(
        TokenRow,
        "SELECT * FROM tokens WHERE layer_id = $1 ORDER BY created_at ASC",
        layer_id
    )
    .fetch_all(pool)
    .await
}

pub async fn update_token_position(
    pool: &PgPool,
    id: &Uuid,
    x: f32,
    y: f32,
) -> Result<Option<TokenRow>, sqlx::Error> {
    sqlx::query_as!(
        TokenRow,
        r#"UPDATE tokens SET x = $2, y = $3, updated_at = now()
           WHERE id = $1 RETURNING *"#,
        id, x, y
    )
    .fetch_optional(pool)
    .await
}

pub async fn update_token(
    pool: &PgPool,
    id: &Uuid,
    name: Option<&str>,
    asset_id: Option<Option<&Uuid>>,
    owner_id: Option<Option<&Uuid>>,
    x: Option<f32>,
    y: Option<f32>,
    size: Option<i32>,
    rotation: Option<f32>,
    bars_json: Option<&serde_json::Value>,
    status_markers: Option<&[String]>,
) -> Result<Option<TokenRow>, sqlx::Error> {
    sqlx::query_as!(
        TokenRow,
        r#"UPDATE tokens SET
            name = COALESCE($2, name),
            asset_id = CASE WHEN $3 THEN $4 ELSE asset_id END,
            owner_id = CASE WHEN $5 THEN $6 ELSE owner_id END,
            x = COALESCE($7, x),
            y = COALESCE($8, y),
            size = COALESCE($9, size),
            rotation = COALESCE($10, rotation),
            bars_json = COALESCE($11, bars_json),
            status_markers = COALESCE($12, status_markers),
            updated_at = now()
        WHERE id = $1
        RETURNING *"#,
        id, name,
        asset_id.is_some(), asset_id.flatten(),
        owner_id.is_some(), owner_id.flatten(),
        x, y, size, rotation, bars_json, status_markers
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_token(
    pool: &PgPool,
    id: &Uuid,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM tokens WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

/// Get the layer_id and owner_id for auth checks
pub async fn get_token_auth_info(
    pool: &PgPool,
    token_id: &Uuid,
) -> Result<Option<(Uuid, Option<Uuid>)>, sqlx::Error> {
    let row = sqlx::query!(
        "SELECT layer_id, owner_id FROM tokens WHERE id = $1",
        token_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| (r.layer_id, r.owner_id)))
}
```

- [ ] **Step 4: Register module and run tests**

Add `pub mod tokens;` to `crates/db/src/lib.rs`.

Run: `cargo test -p db -- tokens`

Expected: All 3 tests PASS.

- [ ] **Step 5: Regenerate sqlx offline data and commit**

```bash
cargo sqlx prepare --workspace
git add crates/db/src/tokens.rs crates/db/src/lib.rs .sqlx/
git commit -m "feat(db): add tokens repository with CRUD and position updates"
```

---

### Task 9: Database Repository — Drawings

**Files:**
- Create: `crates/db/src/drawings.rs`
- Modify: `crates/db/src/lib.rs`

- [ ] **Step 1: Write failing tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;

    async fn setup_drawing_layer(pool: &PgPool) -> Uuid {
        let user = crate::users::create_user(pool, "dm@test.com", "hash", "DM").await.unwrap();
        let campaign = crate::campaigns::create_campaign(pool, &user.id, "Campaign").await.unwrap();
        let map = crate::maps::create_map(pool, &campaign.id, "Map").await.unwrap();
        let layer = crate::map_layers::create_layer(pool, &map.id, "Drawings", "drawing", false).await.unwrap();
        layer.id
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn test_create_and_find_drawing(pool: PgPool) {
        let layer_id = setup_drawing_layer(&pool).await;
        let points = serde_json::json!([{"x": 0, "y": 0}, {"x": 10, "y": 10}]);

        let drawing = create_drawing(&pool, &layer_id, "line", &points, "#ff0000", 3.0, 1.0, None, 0.3).await.unwrap();
        assert_eq!(drawing.drawing_type, "line");
        assert_eq!(drawing.stroke_color, "#ff0000");

        let found = find_by_id(&pool, &drawing.id).await.unwrap().unwrap();
        assert_eq!(found.id, drawing.id);
    }

    #[sqlx::test(migrations = "../migrations")]
    async fn test_list_and_delete_drawings(pool: PgPool) {
        let layer_id = setup_drawing_layer(&pool).await;
        let points = serde_json::json!([]);

        create_drawing(&pool, &layer_id, "freehand", &points, "#fff", 2.0, 1.0, None, 0.3).await.unwrap();
        create_drawing(&pool, &layer_id, "rectangle", &points, "#fff", 2.0, 1.0, Some("#00f"), 0.5).await.unwrap();

        let drawings = list_for_layer(&pool, &layer_id).await.unwrap();
        assert_eq!(drawings.len(), 2);

        delete_drawing(&pool, &drawings[0].id).await.unwrap();
        let remaining = list_for_layer(&pool, &layer_id).await.unwrap();
        assert_eq!(remaining.len(), 1);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p db -- drawings`

Expected: FAIL.

- [ ] **Step 3: Implement drawings.rs repository**

```rust
// crates/db/src/drawings.rs
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub struct DrawingRow {
    pub id: Uuid,
    pub layer_id: Uuid,
    pub drawing_type: String,
    pub points_json: serde_json::Value,
    pub stroke_color: String,
    pub stroke_width: f32,
    pub stroke_opacity: f32,
    pub fill_color: Option<String>,
    pub fill_opacity: f32,
    pub created_at: DateTime<Utc>,
}

impl From<DrawingRow> for htbd_core::drawing::Drawing {
    fn from(row: DrawingRow) -> Self {
        Self {
            id: row.id,
            layer_id: row.layer_id,
            drawing_type: serde_json::from_value(
                serde_json::Value::String(row.drawing_type)
            ).unwrap_or(htbd_core::drawing::DrawingType::Freehand),
            points: row.points_json,
            stroke_color: row.stroke_color,
            stroke_width: row.stroke_width,
            stroke_opacity: row.stroke_opacity,
            fill_color: row.fill_color,
            fill_opacity: row.fill_opacity,
            created_at: row.created_at,
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn create_drawing(
    pool: &PgPool,
    layer_id: &Uuid,
    drawing_type: &str,
    points_json: &serde_json::Value,
    stroke_color: &str,
    stroke_width: f32,
    stroke_opacity: f32,
    fill_color: Option<&str>,
    fill_opacity: f32,
) -> Result<DrawingRow, sqlx::Error> {
    sqlx::query_as!(
        DrawingRow,
        r#"INSERT INTO drawings (layer_id, drawing_type, points_json, stroke_color, stroke_width, stroke_opacity, fill_color, fill_opacity)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *"#,
        layer_id, drawing_type, points_json, stroke_color, stroke_width, stroke_opacity, fill_color, fill_opacity
    )
    .fetch_one(pool)
    .await
}

pub async fn find_by_id(
    pool: &PgPool,
    id: &Uuid,
) -> Result<Option<DrawingRow>, sqlx::Error> {
    sqlx::query_as!(
        DrawingRow,
        "SELECT * FROM drawings WHERE id = $1",
        id
    )
    .fetch_optional(pool)
    .await
}

pub async fn list_for_layer(
    pool: &PgPool,
    layer_id: &Uuid,
) -> Result<Vec<DrawingRow>, sqlx::Error> {
    sqlx::query_as!(
        DrawingRow,
        "SELECT * FROM drawings WHERE layer_id = $1 ORDER BY created_at ASC",
        layer_id
    )
    .fetch_all(pool)
    .await
}

pub async fn update_drawing(
    pool: &PgPool,
    id: &Uuid,
    points_json: Option<&serde_json::Value>,
    stroke_color: Option<&str>,
    stroke_width: Option<f32>,
    stroke_opacity: Option<f32>,
    fill_color: Option<Option<&str>>,
    fill_opacity: Option<f32>,
) -> Result<Option<DrawingRow>, sqlx::Error> {
    sqlx::query_as!(
        DrawingRow,
        r#"UPDATE drawings SET
            points_json = COALESCE($2, points_json),
            stroke_color = COALESCE($3, stroke_color),
            stroke_width = COALESCE($4, stroke_width),
            stroke_opacity = COALESCE($5, stroke_opacity),
            fill_color = CASE WHEN $6 THEN $7 ELSE fill_color END,
            fill_opacity = COALESCE($8, fill_opacity)
        WHERE id = $1
        RETURNING *"#,
        id, points_json, stroke_color, stroke_width, stroke_opacity,
        fill_color.is_some(), fill_color.flatten(), fill_opacity
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_drawing(
    pool: &PgPool,
    id: &Uuid,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM drawings WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

/// Get the layer_id for auth checks
pub async fn get_layer_id_for_drawing(
    pool: &PgPool,
    drawing_id: &Uuid,
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT layer_id FROM drawings WHERE id = $1",
        drawing_id
    )
    .fetch_optional(pool)
    .await
}
```

- [ ] **Step 4: Register module and run tests**

Add `pub mod drawings;` to `crates/db/src/lib.rs`.

Run: `cargo test -p db -- drawings`

Expected: All 2 tests PASS.

- [ ] **Step 5: Regenerate sqlx offline data and commit**

```bash
cargo sqlx prepare --workspace
git add crates/db/src/drawings.rs crates/db/src/lib.rs .sqlx/
git commit -m "feat(db): add drawings repository"
```

---

### Task 10: Chunk 1 Verification

- [ ] **Step 1: Run all backend tests**

Run: `cargo test --workspace`

Expected: All tests pass, including ts-rs binding generation.

- [ ] **Step 2: Run clippy**

Run: `SQLX_OFFLINE=true cargo clippy --workspace -- -D warnings`

Expected: No warnings.

- [ ] **Step 3: Run fmt check**

Run: `cargo fmt --all -- --check`

Expected: No formatting issues.

- [ ] **Step 4: Verify TypeScript types generated**

Check that `client/src/types/` contains new files: `Map.ts`, `MapLayer.ts`, `MapImage.ts`, `Token.ts`, `TokenBar.ts`, `Drawing.ts`, `DrawingType.ts`, `SnapMode.ts`, `DiagonalMode.ts`, `LayerType.ts`, `BarVisibility.ts`, `StatusMarker.ts`, and updated `ClientMessage.ts`, `ServerMessage.ts`.

- [ ] **Step 5: Verify frontend still builds**

Run: `cd client && npm run build`

Expected: Build succeeds (new types don't break existing code).

---

## Chunk 2: REST API Routes

Tasks 11–15 add Axum HTTP routes for maps, layers, map images, tokens, and drawings. Each route module follows the existing pattern from `routes/campaigns.rs`: define routes, extract auth, check permissions via guards, call DB functions, return JSON. Integration tests use the existing `TestApp` harness from `tests/common/`.

### Task 11: Map Routes

**Files:**
- Create: `crates/server/src/routes/maps.rs`
- Modify: `crates/server/src/routes/mod.rs`

- [ ] **Step 1: Write integration tests for map CRUD**

Create `crates/server/tests/maps.rs`:

```rust
mod common;

use serde_json::json;

#[tokio::test]
async fn test_create_map() {
    let app = common::spawn_app().await;
    let campaign = common::create_test_campaign(&app, "dm@test.com", "Campaign").await;
    let campaign_id = campaign["id"].as_str().unwrap();

    let resp = app.client
        .post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Tavern" }))
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);

    let map: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(map["name"], "Tavern");
    assert_eq!(map["grid_enabled"], true);
    assert_eq!(map["grid_size_px"], 70);

    // Verify default layers were created
    assert!(map["layers"].is_array());
    let layers = map["layers"].as_array().unwrap();
    assert_eq!(layers.len(), 3);
    assert_eq!(layers[0]["name"], "Background");
    assert_eq!(layers[1]["name"], "Tokens");
    assert_eq!(layers[2]["name"], "DM Notes");
}

#[tokio::test]
async fn test_list_maps() {
    let app = common::spawn_app().await;
    let campaign = common::create_test_campaign(&app, "dm@test.com", "Campaign").await;
    let campaign_id = campaign["id"].as_str().unwrap();

    // Create two maps
    app.client.post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Map A" })).send().await.unwrap();
    app.client.post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Map B" })).send().await.unwrap();

    let resp = app.client
        .get(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);

    let maps: Vec<serde_json::Value> = resp.json().await.unwrap();
    assert_eq!(maps.len(), 2);
}

#[tokio::test]
async fn test_get_map_filters_dm_only_for_player() {
    let app = common::spawn_app().await;
    let campaign = common::create_test_campaign(&app, "dm@test.com", "Campaign").await;
    let campaign_id = campaign["id"].as_str().unwrap();
    let invite_code = campaign["invite_code"].as_str().unwrap();

    // DM creates a map (gets 3 default layers, one dm_only)
    let resp = app.client
        .post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Tavern" })).send().await.unwrap();
    let map: serde_json::Value = resp.json().await.unwrap();
    let map_id = map["id"].as_str().unwrap();

    // Player joins
    let player_client = reqwest::Client::builder().cookie_store(true).build().unwrap();
    let resp = player_client.post(app.url("/api/auth/register"))
        .json(&json!({"email": "player@test.com", "password": "password123", "display_name": "Player"}))
        .send().await.unwrap();
    assert!(resp.status().is_success());
    player_client.post(app.url(&format!("/api/campaigns/join/{}", invite_code)))
        .send().await.unwrap();

    // Player gets map — should not see dm_only layers
    let resp = player_client
        .get(app.url(&format!("/api/maps/{}", map_id)))
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);
    let player_map: serde_json::Value = resp.json().await.unwrap();
    let layers = player_map["layers"].as_array().unwrap();
    assert_eq!(layers.len(), 2); // Background + Tokens, NOT DM Notes
    assert!(layers.iter().all(|l| l["dm_only"] == false));
}

#[tokio::test]
async fn test_update_map_settings() {
    let app = common::spawn_app().await;
    let campaign = common::create_test_campaign(&app, "dm@test.com", "Campaign").await;
    let campaign_id = campaign["id"].as_str().unwrap();

    let resp = app.client
        .post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Tavern" })).send().await.unwrap();
    let map: serde_json::Value = resp.json().await.unwrap();
    let map_id = map["id"].as_str().unwrap();

    let resp = app.client
        .patch(app.url(&format!("/api/maps/{}", map_id)))
        .json(&json!({ "name": "Updated Tavern", "grid_enabled": false, "snap_mode": "off" }))
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);

    let updated: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(updated["name"], "Updated Tavern");
    assert_eq!(updated["grid_enabled"], false);
    assert_eq!(updated["snap_mode"], "off");
}

#[tokio::test]
async fn test_delete_map() {
    let app = common::spawn_app().await;
    let campaign = common::create_test_campaign(&app, "dm@test.com", "Campaign").await;
    let campaign_id = campaign["id"].as_str().unwrap();

    let resp = app.client
        .post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Deletable" })).send().await.unwrap();
    let map: serde_json::Value = resp.json().await.unwrap();
    let map_id = map["id"].as_str().unwrap();

    let resp = app.client
        .delete(app.url(&format!("/api/maps/{}", map_id)))
        .send().await.unwrap();
    assert_eq!(resp.status(), 204);

    let resp = app.client
        .get(app.url(&format!("/api/maps/{}", map_id)))
        .send().await.unwrap();
    assert_eq!(resp.status(), 404);
}

#[tokio::test]
async fn test_player_cannot_create_map() {
    let app = common::spawn_app().await;
    let campaign = common::create_test_campaign(&app, "dm@test.com", "Campaign").await;
    let campaign_id = campaign["id"].as_str().unwrap();
    let invite_code = campaign["invite_code"].as_str().unwrap();

    // Register and join as player
    let player_client = reqwest::Client::builder().cookie_store(true).build().unwrap();
    player_client.post(app.url("/api/auth/register"))
        .json(&json!({"email": "player@test.com", "password": "password123", "display_name": "Player"}))
        .send().await.unwrap();
    player_client.post(app.url(&format!("/api/campaigns/join/{}", invite_code)))
        .send().await.unwrap();

    let resp = player_client
        .post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Sneaky Map" }))
        .send().await.unwrap();
    assert_eq!(resp.status(), 403);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p server --test maps`

Expected: FAIL — routes don't exist.

- [ ] **Step 3: Implement maps.rs routes**

```rust
// crates/server/src/routes/maps.rs
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, patch, post},
};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::map::*;

use super::guards::{require_dm, require_member};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/campaigns/{campaign_id}/maps", get(list_maps).post(create_map))
        .route("/maps/{id}", get(get_map).patch(update_map).delete(delete_map))
}

async fn create_map(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(campaign_id): Path<Uuid>,
    Json(req): Json<CreateMapRequest>,
) -> Result<Json<MapWithLayers>, AppError> {
    require_dm(&state, campaign_id, auth.user_id).await?;

    if req.name.is_empty() {
        return Err(AppError::BadRequest("Map name required".to_string()));
    }

    let map_row = db::maps::create_map(&state.pool, &campaign_id, &req.name).await?;

    // Update non-default fields if provided
    let map_row = if req.grid_size_px != 70 || req.grid_scale != 5.0
        || req.width_squares != 30 || req.height_squares != 20 || !req.grid_enabled
    {
        db::maps::update_map(
            &state.pool, &map_row.id,
            None,
            Some(req.grid_enabled),
            Some(req.grid_size_px),
            None, None, None,
            Some(req.grid_scale),
            None, None, None,
            Some(req.width_squares),
            Some(req.height_squares),
        ).await?.unwrap_or(map_row)
    } else {
        map_row
    };

    // Create default layers
    let layer_rows = db::map_layers::create_default_layers(&state.pool, &map_row.id).await?;

    let map: Map = map_row.into();
    let layers: Vec<MapLayer> = layer_rows.into_iter().map(Into::into).collect();

    Ok(Json(MapWithLayers { map, layers }))
}

async fn list_maps(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(campaign_id): Path<Uuid>,
) -> Result<Json<Vec<Map>>, AppError> {
    require_member(&state, campaign_id, auth.user_id).await?;

    let rows = db::maps::list_for_campaign(&state.pool, &campaign_id).await?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

async fn get_map(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<MapWithLayers>, AppError> {
    let map_row = db::maps::find_by_id(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;

    let role = require_member(&state, map_row.campaign_id, auth.user_id).await?;

    // Filter dm_only layers for non-DM users
    let layer_rows = if role == htbd_core::models::CampaignRole::Dm {
        db::map_layers::list_for_map(&state.pool, &id).await?
    } else {
        db::map_layers::list_for_map_player(&state.pool, &id).await?
    };

    let map: Map = map_row.into();
    let layers: Vec<MapLayer> = layer_rows.into_iter().map(Into::into).collect();

    Ok(Json(MapWithLayers { map, layers }))
}

async fn update_map(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateMapRequest>,
) -> Result<Json<Map>, AppError> {
    let map_row = db::maps::find_by_id(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;

    require_dm(&state, map_row.campaign_id, auth.user_id).await?;

    let snap_mode_str = req.snap_mode.map(|s| serde_json::to_value(s).unwrap().as_str().unwrap().to_string());
    let diagonal_mode_str = req.diagonal_mode.map(|d| serde_json::to_value(d).unwrap().as_str().unwrap().to_string());

    let updated = db::maps::update_map(
        &state.pool, &id,
        req.name.as_deref(),
        req.grid_enabled,
        req.grid_size_px,
        req.grid_color.as_deref(),
        req.grid_opacity,
        req.grid_line_width,
        req.grid_scale,
        req.grid_scale_unit.as_deref(),
        snap_mode_str.as_deref(),
        diagonal_mode_str.as_deref(),
        req.width_squares,
        req.height_squares,
    ).await?.ok_or(AppError::NotFound)?;

    Ok(Json(updated.into()))
}

async fn delete_map(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let map_row = db::maps::find_by_id(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;

    require_dm(&state, map_row.campaign_id, auth.user_id).await?;

    db::maps::delete_map(&state.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 4: Mount routes in routes/mod.rs**

Add `pub mod maps;` and nest in `api_routes()`:

```rust
pub fn api_routes() -> Router<AppState> {
    Router::new()
        .nest("/auth", auth::routes())
        .nest("/campaigns", campaigns::routes())
        .nest("/assets", assets::routes())
        .nest("/ws", ws::routes())
        .merge(maps::routes()) // merged, not nested — paths include /campaigns and /maps prefixes
}
```

- [ ] **Step 5: Run integration tests**

Run: `cargo test -p server --test maps`

Expected: All 6 tests PASS.

- [ ] **Step 6: Run clippy and commit**

```bash
SQLX_OFFLINE=true cargo clippy --workspace -- -D warnings
git add crates/server/src/routes/maps.rs crates/server/src/routes/mod.rs crates/server/tests/maps.rs
git commit -m "feat(server): add map CRUD routes with DM-only layer filtering"
```

---

### Task 12: Layer Routes

**Files:**
- Create: `crates/server/src/routes/layers.rs`
- Modify: `crates/server/src/routes/mod.rs`

- [ ] **Step 1: Write integration tests**

Create `crates/server/tests/layers.rs`:

```rust
mod common;

use serde_json::json;

/// Helper: create a campaign and map, return (campaign_id, map_id)
async fn setup_map(app: &common::TestApp) -> (String, String) {
    let campaign = common::create_test_campaign(app, "dm@test.com", "Campaign").await;
    let campaign_id = campaign["id"].as_str().unwrap().to_string();

    let resp = app.client
        .post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Map" })).send().await.unwrap();
    let map: serde_json::Value = resp.json().await.unwrap();
    let map_id = map["id"].as_str().unwrap().to_string();

    (campaign_id, map_id)
}

#[tokio::test]
async fn test_create_layer() {
    let app = common::spawn_app().await;
    let (_, map_id) = setup_map(&app).await;

    let resp = app.client
        .post(app.url(&format!("/api/maps/{}/layers", map_id)))
        .json(&json!({ "name": "Enemies", "layer_type": "token", "dm_only": false }))
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);

    let layer: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(layer["name"], "Enemies");
    assert_eq!(layer["layer_type"], "token");
    assert_eq!(layer["sort_order"], 3); // after 3 default layers (0,1,2)
}

#[tokio::test]
async fn test_update_layer() {
    let app = common::spawn_app().await;
    let (_, map_id) = setup_map(&app).await;

    // Get default layers
    let resp = app.client.get(app.url(&format!("/api/maps/{}", map_id))).send().await.unwrap();
    let map: serde_json::Value = resp.json().await.unwrap();
    let layer_id = map["layers"][0]["id"].as_str().unwrap();

    let resp = app.client
        .patch(app.url(&format!("/api/layers/{}", layer_id)))
        .json(&json!({ "name": "Renamed", "locked": true, "opacity": 0.5 }))
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);

    let updated: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(updated["name"], "Renamed");
    assert_eq!(updated["locked"], true);
    assert_eq!(updated["opacity"], 0.5);
}

#[tokio::test]
async fn test_reorder_layers() {
    let app = common::spawn_app().await;
    let (_, map_id) = setup_map(&app).await;

    let resp = app.client.get(app.url(&format!("/api/maps/{}", map_id))).send().await.unwrap();
    let map: serde_json::Value = resp.json().await.unwrap();
    let layers = map["layers"].as_array().unwrap();

    // Reverse the order
    let reversed_ids: Vec<&str> = layers.iter().rev().map(|l| l["id"].as_str().unwrap()).collect();

    let resp = app.client
        .put(app.url(&format!("/api/maps/{}/layers/order", map_id)))
        .json(&json!({ "layer_ids": reversed_ids }))
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);

    // Verify new order
    let resp = app.client.get(app.url(&format!("/api/maps/{}", map_id))).send().await.unwrap();
    let map: serde_json::Value = resp.json().await.unwrap();
    let new_layers = map["layers"].as_array().unwrap();
    assert_eq!(new_layers[0]["id"].as_str().unwrap(), reversed_ids[0]);
}

#[tokio::test]
async fn test_delete_layer() {
    let app = common::spawn_app().await;
    let (_, map_id) = setup_map(&app).await;

    // Create extra layer to delete
    let resp = app.client
        .post(app.url(&format!("/api/maps/{}/layers", map_id)))
        .json(&json!({ "name": "Temp", "layer_type": "drawing" }))
        .send().await.unwrap();
    let layer: serde_json::Value = resp.json().await.unwrap();
    let layer_id = layer["id"].as_str().unwrap();

    let resp = app.client
        .delete(app.url(&format!("/api/layers/{}", layer_id)))
        .send().await.unwrap();
    assert_eq!(resp.status(), 204);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p server --test layers`

Expected: FAIL.

- [ ] **Step 3: Implement layers.rs routes**

```rust
// crates/server/src/routes/layers.rs
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, patch, post, put},
};
use serde::Deserialize;
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::map::*;

use super::guards::require_dm;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/maps/{map_id}/layers", post(create_layer))
        .route("/maps/{map_id}/layers/order", put(reorder_layers))
        .route("/layers/{id}", patch(update_layer).delete(delete_layer))
}

async fn create_layer(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(map_id): Path<Uuid>,
    Json(req): Json<CreateLayerRequest>,
) -> Result<Json<MapLayer>, AppError> {
    let map_row = db::maps::find_by_id(&state.pool, &map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(&state, map_row.campaign_id, auth.user_id).await?;

    let layer_type_str = serde_json::to_value(&req.layer_type).unwrap();
    let layer_type_str = layer_type_str.as_str().unwrap();

    let row = db::map_layers::create_layer(
        &state.pool, &map_id, &req.name, layer_type_str, req.dm_only,
    ).await?;

    Ok(Json(row.into()))
}

#[derive(Deserialize)]
struct ReorderRequest {
    layer_ids: Vec<Uuid>,
}

async fn reorder_layers(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(map_id): Path<Uuid>,
    Json(req): Json<ReorderRequest>,
) -> Result<StatusCode, AppError> {
    let map_row = db::maps::find_by_id(&state.pool, &map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(&state, map_row.campaign_id, auth.user_id).await?;

    db::map_layers::reorder_layers(&state.pool, &map_id, &req.layer_ids).await?;
    Ok(StatusCode::OK)
}

async fn update_layer(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateLayerRequest>,
) -> Result<Json<MapLayer>, AppError> {
    let map_id = db::map_layers::get_map_id_for_layer(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;
    let map_row = db::maps::find_by_id(&state.pool, &map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(&state, map_row.campaign_id, auth.user_id).await?;

    let updated = db::map_layers::update_layer(
        &state.pool, &id,
        req.name.as_deref(),
        req.visible,
        req.locked,
        req.opacity,
        req.dm_only,
    ).await?.ok_or(AppError::NotFound)?;

    Ok(Json(updated.into()))
}

async fn delete_layer(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let map_id = db::map_layers::get_map_id_for_layer(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;
    let map_row = db::maps::find_by_id(&state.pool, &map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(&state, map_row.campaign_id, auth.user_id).await?;

    db::map_layers::delete_layer(&state.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 4: Mount routes in mod.rs**

Add `pub mod layers;` and `.merge(layers::routes())` in `api_routes()`.

- [ ] **Step 5: Run tests**

Run: `cargo test -p server --test layers`

Expected: All 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add crates/server/src/routes/layers.rs crates/server/src/routes/mod.rs crates/server/tests/layers.rs
git commit -m "feat(server): add layer CRUD and reorder routes"
```

---

### Task 13: Map Image Routes

**Files:**
- Create: `crates/server/src/routes/map_images.rs`
- Modify: `crates/server/src/routes/mod.rs`

- [ ] **Step 1: Write integration tests**

Create `crates/server/tests/map_images.rs`:

```rust
mod common;

use serde_json::json;

async fn setup_with_asset(app: &common::TestApp) -> (String, String, String) {
    let campaign = common::create_test_campaign(app, "dm@test.com", "Campaign").await;
    let campaign_id = campaign["id"].as_str().unwrap().to_string();

    // Create map
    let resp = app.client
        .post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Map" })).send().await.unwrap();
    let map: serde_json::Value = resp.json().await.unwrap();
    let map_id = map["id"].as_str().unwrap().to_string();
    let layer_id = map["layers"][0]["id"].as_str().unwrap().to_string(); // Background layer

    // Upload an asset
    let form = reqwest::multipart::Form::new()
        .part("file", reqwest::multipart::Part::bytes(vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) // PNG header
            .file_name("map.png")
            .mime_str("image/png").unwrap());
    let resp = app.client
        .post(app.url(&format!("/api/assets/campaigns/{}", campaign_id)))
        .multipart(form).send().await.unwrap();
    let asset: serde_json::Value = resp.json().await.unwrap();
    let asset_id = asset["id"].as_str().unwrap().to_string();

    (layer_id, asset_id, map_id)
}

#[tokio::test]
async fn test_place_and_list_images() {
    let app = common::spawn_app().await;
    let (layer_id, asset_id, _) = setup_with_asset(&app).await;

    let resp = app.client
        .post(app.url(&format!("/api/layers/{}/images", layer_id)))
        .json(&json!({ "asset_id": asset_id, "x": 0, "y": 0, "width": 30, "height": 20 }))
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);

    let image: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(image["width"], 30.0);
}

#[tokio::test]
async fn test_update_image() {
    let app = common::spawn_app().await;
    let (layer_id, asset_id, _) = setup_with_asset(&app).await;

    let resp = app.client
        .post(app.url(&format!("/api/layers/{}/images", layer_id)))
        .json(&json!({ "asset_id": asset_id, "x": 0, "y": 0, "width": 30, "height": 20 }))
        .send().await.unwrap();
    let image: serde_json::Value = resp.json().await.unwrap();
    let image_id = image["id"].as_str().unwrap();

    let resp = app.client
        .patch(app.url(&format!("/api/images/{}", image_id)))
        .json(&json!({ "x": 5.0, "y": 5.0 }))
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);

    let updated: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(updated["x"], 5.0);
}

#[tokio::test]
async fn test_delete_image() {
    let app = common::spawn_app().await;
    let (layer_id, asset_id, _) = setup_with_asset(&app).await;

    let resp = app.client
        .post(app.url(&format!("/api/layers/{}/images", layer_id)))
        .json(&json!({ "asset_id": asset_id, "x": 0, "y": 0, "width": 30, "height": 20 }))
        .send().await.unwrap();
    let image: serde_json::Value = resp.json().await.unwrap();
    let image_id = image["id"].as_str().unwrap();

    let resp = app.client
        .delete(app.url(&format!("/api/images/{}", image_id)))
        .send().await.unwrap();
    assert_eq!(resp.status(), 204);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p server --test map_images`

Expected: FAIL.

- [ ] **Step 3: Implement map_images.rs routes**

```rust
// crates/server/src/routes/map_images.rs
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, patch, post},
};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::map::*;

use super::guards::require_dm;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/layers/{layer_id}/images", post(place_image))
        .route("/images/{id}", patch(update_image).delete(delete_image))
}

/// Resolve layer_id → map_id → campaign_id and require DM
async fn require_dm_for_layer(
    state: &AppState,
    layer_id: &Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    let map_id = db::map_layers::get_map_id_for_layer(&state.pool, layer_id)
        .await?
        .ok_or(AppError::NotFound)?;
    let map_row = db::maps::find_by_id(&state.pool, &map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(state, map_row.campaign_id, user_id).await
}

async fn place_image(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(layer_id): Path<Uuid>,
    Json(req): Json<PlaceMapImageRequest>,
) -> Result<Json<MapImage>, AppError> {
    require_dm_for_layer(&state, &layer_id, auth.user_id).await?;

    let row = db::map_images::place_image(
        &state.pool, &layer_id, &req.asset_id,
        req.x, req.y, req.width, req.height, req.rotation, req.opacity,
    ).await?;

    Ok(Json(row.into()))
}

async fn update_image(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateMapImageRequest>,
) -> Result<Json<MapImage>, AppError> {
    let layer_id = db::map_images::get_layer_id_for_image(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm_for_layer(&state, &layer_id, auth.user_id).await?;

    let updated = db::map_images::update_image(
        &state.pool, &id,
        req.x, req.y, req.width, req.height, req.rotation, req.opacity,
    ).await?.ok_or(AppError::NotFound)?;

    Ok(Json(updated.into()))
}

async fn delete_image(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let layer_id = db::map_images::get_layer_id_for_image(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm_for_layer(&state, &layer_id, auth.user_id).await?;

    db::map_images::delete_image(&state.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 4: Mount routes and run tests**

Add `pub mod map_images;` and `.merge(map_images::routes())` in `api_routes()`.

Run: `cargo test -p server --test map_images`

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/routes/map_images.rs crates/server/src/routes/mod.rs crates/server/tests/map_images.rs
git commit -m "feat(server): add map image placement routes"
```

---

### Task 14: Token Routes

**Files:**
- Create: `crates/server/src/routes/tokens.rs`
- Modify: `crates/server/src/routes/mod.rs`

- [ ] **Step 1: Write integration tests**

Create `crates/server/tests/tokens.rs`:

```rust
mod common;

use serde_json::json;

async fn setup_token_layer(app: &common::TestApp) -> (String, String, String) {
    let campaign = common::create_test_campaign(app, "dm@test.com", "Campaign").await;
    let campaign_id = campaign["id"].as_str().unwrap().to_string();
    let invite_code = campaign["invite_code"].as_str().unwrap().to_string();

    let resp = app.client
        .post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Map" })).send().await.unwrap();
    let map: serde_json::Value = resp.json().await.unwrap();
    let token_layer_id = map["layers"][1]["id"].as_str().unwrap().to_string(); // "Tokens" layer

    (token_layer_id, campaign_id, invite_code)
}

#[tokio::test]
async fn test_create_token() {
    let app = common::spawn_app().await;
    let (layer_id, _, _) = setup_token_layer(&app).await;

    let resp = app.client
        .post(app.url(&format!("/api/layers/{}/tokens", layer_id)))
        .json(&json!({
            "name": "Goblin",
            "x": 5.0, "y": 3.0,
            "size": 1,
            "bars": [{"label": "HP", "current": 7, "max": 7, "color": "#ff0000", "visibility": "everyone"}],
            "status_markers": ["stunned"]
        }))
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);

    let token: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(token["name"], "Goblin");
    assert_eq!(token["x"], 5.0);
    assert_eq!(token["size"], 1);
    assert_eq!(token["bars"][0]["label"], "HP");
    assert_eq!(token["status_markers"][0], "stunned");
}

#[tokio::test]
async fn test_player_can_move_own_token() {
    let app = common::spawn_app().await;
    let (layer_id, _, invite_code) = setup_token_layer(&app).await;

    // Register player
    let player_client = reqwest::Client::builder().cookie_store(true).build().unwrap();
    let resp = player_client.post(app.url("/api/auth/register"))
        .json(&json!({"email": "player@test.com", "password": "password123", "display_name": "Player"}))
        .send().await.unwrap();
    let player_auth: serde_json::Value = resp.json().await.unwrap();
    let player_id = player_auth["user"]["id"].as_str().unwrap();

    player_client.post(app.url(&format!("/api/campaigns/join/{}", invite_code)))
        .send().await.unwrap();

    // DM creates token owned by player
    let resp = app.client
        .post(app.url(&format!("/api/layers/{}/tokens", layer_id)))
        .json(&json!({ "name": "Player Token", "owner_id": player_id, "x": 0, "y": 0 }))
        .send().await.unwrap();
    let token: serde_json::Value = resp.json().await.unwrap();
    let token_id = token["id"].as_str().unwrap();

    // Player moves their own token
    let resp = player_client
        .patch(app.url(&format!("/api/tokens/{}", token_id)))
        .json(&json!({ "x": 10.0, "y": 15.0 }))
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);

    let updated: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(updated["x"], 10.0);
}

#[tokio::test]
async fn test_player_cannot_move_others_token() {
    let app = common::spawn_app().await;
    let (layer_id, _, invite_code) = setup_token_layer(&app).await;

    // DM creates unowned token
    let resp = app.client
        .post(app.url(&format!("/api/layers/{}/tokens", layer_id)))
        .json(&json!({ "name": "NPC", "x": 0, "y": 0 }))
        .send().await.unwrap();
    let token: serde_json::Value = resp.json().await.unwrap();
    let token_id = token["id"].as_str().unwrap();

    // Player joins
    let player_client = reqwest::Client::builder().cookie_store(true).build().unwrap();
    player_client.post(app.url("/api/auth/register"))
        .json(&json!({"email": "player@test.com", "password": "password123", "display_name": "Player"}))
        .send().await.unwrap();
    player_client.post(app.url(&format!("/api/campaigns/join/{}", invite_code)))
        .send().await.unwrap();

    // Player tries to move NPC token
    let resp = player_client
        .patch(app.url(&format!("/api/tokens/{}", token_id)))
        .json(&json!({ "x": 10.0, "y": 15.0 }))
        .send().await.unwrap();
    assert_eq!(resp.status(), 403);
}

#[tokio::test]
async fn test_player_cannot_delete_token() {
    let app = common::spawn_app().await;
    let (layer_id, _, invite_code) = setup_token_layer(&app).await;

    // Register player
    let player_client = reqwest::Client::builder().cookie_store(true).build().unwrap();
    let resp = player_client.post(app.url("/api/auth/register"))
        .json(&json!({"email": "player@test.com", "password": "password123", "display_name": "Player"}))
        .send().await.unwrap();
    let player_auth: serde_json::Value = resp.json().await.unwrap();
    let player_id = player_auth["user"]["id"].as_str().unwrap();

    player_client.post(app.url(&format!("/api/campaigns/join/{}", invite_code)))
        .send().await.unwrap();

    // DM creates token owned by player
    let resp = app.client
        .post(app.url(&format!("/api/layers/{}/tokens", layer_id)))
        .json(&json!({ "name": "Player Token", "owner_id": player_id }))
        .send().await.unwrap();
    let token: serde_json::Value = resp.json().await.unwrap();
    let token_id = token["id"].as_str().unwrap();

    // Player cannot delete even their own token
    let resp = player_client
        .delete(app.url(&format!("/api/tokens/{}", token_id)))
        .send().await.unwrap();
    assert_eq!(resp.status(), 403);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p server --test tokens`

Expected: FAIL.

- [ ] **Step 3: Implement tokens.rs routes**

```rust
// crates/server/src/routes/tokens.rs
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, patch, post},
};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::models::CampaignRole;
use htbd_core::token::*;

use super::guards::{require_dm, require_member};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/layers/{layer_id}/tokens", post(create_token))
        .route("/tokens/{id}", patch(update_token).delete(delete_token))
}

/// Resolve layer_id → map_id → campaign_id, returns campaign_id
async fn get_campaign_for_layer(
    state: &AppState,
    layer_id: &Uuid,
) -> Result<Uuid, AppError> {
    let map_id = db::map_layers::get_map_id_for_layer(&state.pool, layer_id)
        .await?
        .ok_or(AppError::NotFound)?;
    let map_row = db::maps::find_by_id(&state.pool, &map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(map_row.campaign_id)
}

async fn create_token(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(layer_id): Path<Uuid>,
    Json(req): Json<CreateTokenRequest>,
) -> Result<Json<Token>, AppError> {
    let campaign_id = get_campaign_for_layer(&state, &layer_id).await?;
    require_dm(&state, campaign_id, auth.user_id).await?;

    if req.name.is_empty() {
        return Err(AppError::BadRequest("Token name required".to_string()));
    }

    let bars_json = serde_json::to_value(&req.bars).unwrap_or_default();

    let row = db::tokens::create_token(
        &state.pool, &layer_id, &req.name,
        req.asset_id.as_ref(), req.owner_id.as_ref(),
        req.x, req.y, req.size, req.rotation,
        &bars_json, &req.status_markers,
    ).await?;

    Ok(Json(row.into()))
}

async fn update_token(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateTokenRequest>,
) -> Result<Json<Token>, AppError> {
    // Get token to check ownership
    let (layer_id, owner_id) = db::tokens::get_token_auth_info(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;

    let campaign_id = get_campaign_for_layer(&state, &layer_id).await?;
    let role = require_member(&state, campaign_id, auth.user_id).await?;

    // Players can only update tokens they own
    if role != CampaignRole::Dm {
        match owner_id {
            Some(oid) if oid == auth.user_id => {} // OK — player owns this token
            _ => return Err(AppError::Forbidden),
        }
    }

    let bars_json = req.bars.as_ref().map(|b| serde_json::to_value(b).unwrap_or_default());

    let updated = db::tokens::update_token(
        &state.pool, &id,
        req.name.as_deref(),
        req.asset_id.as_ref().map(|a| a.as_ref()),
        req.owner_id.as_ref().map(|o| o.as_ref()),
        req.x, req.y, req.size, req.rotation,
        bars_json.as_ref(),
        req.status_markers.as_deref(),
    ).await?.ok_or(AppError::NotFound)?;

    Ok(Json(updated.into()))
}

async fn delete_token(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let (layer_id, _) = db::tokens::get_token_auth_info(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;

    let campaign_id = get_campaign_for_layer(&state, &layer_id).await?;
    require_dm(&state, campaign_id, auth.user_id).await?;

    db::tokens::delete_token(&state.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 4: Mount routes and run tests**

Add `pub mod tokens;` and `.merge(tokens::routes())` in `api_routes()`.

Run: `cargo test -p server --test tokens`

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/routes/tokens.rs crates/server/src/routes/mod.rs crates/server/tests/tokens.rs
git commit -m "feat(server): add token routes with owner-based permission checks"
```

---

### Task 15: Drawing Routes

**Files:**
- Create: `crates/server/src/routes/drawings.rs`
- Modify: `crates/server/src/routes/mod.rs`

- [ ] **Step 1: Write integration tests**

Create `crates/server/tests/drawings.rs`:

```rust
mod common;

use serde_json::json;

async fn setup_drawing_layer(app: &common::TestApp) -> String {
    let campaign = common::create_test_campaign(app, "dm@test.com", "Campaign").await;
    let campaign_id = campaign["id"].as_str().unwrap();

    let resp = app.client
        .post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Map" })).send().await.unwrap();
    let map: serde_json::Value = resp.json().await.unwrap();
    // DM Notes layer (index 2) is a drawing layer
    map["layers"][2]["id"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn test_create_drawing() {
    let app = common::spawn_app().await;
    let layer_id = setup_drawing_layer(&app).await;

    let resp = app.client
        .post(app.url(&format!("/api/layers/{}/drawings", layer_id)))
        .json(&json!({
            "drawing_type": "line",
            "points": [{"x": 0, "y": 0}, {"x": 10, "y": 10}],
            "stroke_color": "#ff0000",
            "stroke_width": 3.0
        }))
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);

    let drawing: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(drawing["drawing_type"], "line");
    assert_eq!(drawing["stroke_color"], "#ff0000");
}

#[tokio::test]
async fn test_update_drawing() {
    let app = common::spawn_app().await;
    let layer_id = setup_drawing_layer(&app).await;

    let resp = app.client
        .post(app.url(&format!("/api/layers/{}/drawings", layer_id)))
        .json(&json!({
            "drawing_type": "rectangle",
            "points": [{"x": 0, "y": 0}, {"x": 5, "y": 5}],
            "stroke_color": "#ffffff"
        }))
        .send().await.unwrap();
    let drawing: serde_json::Value = resp.json().await.unwrap();
    let drawing_id = drawing["id"].as_str().unwrap();

    let resp = app.client
        .patch(app.url(&format!("/api/drawings/{}", drawing_id)))
        .json(&json!({ "stroke_color": "#00ff00", "stroke_width": 5.0 }))
        .send().await.unwrap();
    assert_eq!(resp.status(), 200);

    let updated: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(updated["stroke_color"], "#00ff00");
}

#[tokio::test]
async fn test_delete_drawing() {
    let app = common::spawn_app().await;
    let layer_id = setup_drawing_layer(&app).await;

    let resp = app.client
        .post(app.url(&format!("/api/layers/{}/drawings", layer_id)))
        .json(&json!({ "drawing_type": "freehand", "points": [] }))
        .send().await.unwrap();
    let drawing: serde_json::Value = resp.json().await.unwrap();
    let drawing_id = drawing["id"].as_str().unwrap();

    let resp = app.client
        .delete(app.url(&format!("/api/drawings/{}", drawing_id)))
        .send().await.unwrap();
    assert_eq!(resp.status(), 204);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p server --test drawings`

Expected: FAIL.

- [ ] **Step 3: Implement drawings.rs routes**

```rust
// crates/server/src/routes/drawings.rs
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, patch, post},
};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::drawing::*;

use super::guards::require_dm;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/layers/{layer_id}/drawings", post(create_drawing))
        .route("/drawings/{id}", patch(update_drawing).delete(delete_drawing))
}

/// Resolve layer_id → map_id → campaign_id and require DM
async fn require_dm_for_layer(
    state: &AppState,
    layer_id: &Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    let map_id = db::map_layers::get_map_id_for_layer(&state.pool, layer_id)
        .await?
        .ok_or(AppError::NotFound)?;
    let map_row = db::maps::find_by_id(&state.pool, &map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(state, map_row.campaign_id, user_id).await
}

async fn create_drawing(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(layer_id): Path<Uuid>,
    Json(req): Json<CreateDrawingRequest>,
) -> Result<Json<Drawing>, AppError> {
    require_dm_for_layer(&state, &layer_id, auth.user_id).await?;

    let drawing_type_str = serde_json::to_value(&req.drawing_type).unwrap();
    let drawing_type_str = drawing_type_str.as_str().unwrap();

    let row = db::drawings::create_drawing(
        &state.pool, &layer_id, drawing_type_str,
        &req.points, &req.stroke_color, req.stroke_width,
        req.stroke_opacity, req.fill_color.as_deref(), req.fill_opacity,
    ).await?;

    Ok(Json(row.into()))
}

async fn update_drawing(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateDrawingRequest>,
) -> Result<Json<Drawing>, AppError> {
    let layer_id = db::drawings::get_layer_id_for_drawing(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm_for_layer(&state, &layer_id, auth.user_id).await?;

    let updated = db::drawings::update_drawing(
        &state.pool, &id,
        req.points.as_ref(),
        req.stroke_color.as_deref(),
        req.stroke_width,
        req.stroke_opacity,
        req.fill_color.as_ref().map(|fc| fc.as_deref()),
        req.fill_opacity,
    ).await?.ok_or(AppError::NotFound)?;

    Ok(Json(updated.into()))
}

async fn delete_drawing(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let layer_id = db::drawings::get_layer_id_for_drawing(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm_for_layer(&state, &layer_id, auth.user_id).await?;

    db::drawings::delete_drawing(&state.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 4: Mount routes and run tests**

Add `pub mod drawings;` and `.merge(drawings::routes())` in `api_routes()`.

Run: `cargo test -p server --test drawings`

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/routes/drawings.rs crates/server/src/routes/mod.rs crates/server/tests/drawings.rs
git commit -m "feat(server): add drawing CRUD routes"
```

---

### Task 16: Chunk 2 Verification

- [ ] **Step 1: Run all backend tests**

Run: `cargo test --workspace`

Expected: All tests pass.

- [ ] **Step 2: Run clippy**

Run: `SQLX_OFFLINE=true cargo clippy --workspace -- -D warnings`

Expected: No warnings.

- [ ] **Step 3: Run fmt check**

Run: `cargo fmt --all -- --check`

Expected: No formatting issues.

- [ ] **Step 4: Regenerate sqlx offline data**

Run: `cargo sqlx prepare --workspace`

Expected: `.sqlx/` updated with route query data.

- [ ] **Step 5: Commit sqlx data if changed**

```bash
git add .sqlx/
git commit -m "chore: update sqlx offline data for SP-1 routes"
```

---

## Chunk 3: Frontend — Stores, API Clients & Grid Math

Tasks 17–22 build the frontend data layer and pure math utilities. After this chunk, the frontend can fetch maps/tokens/drawings from the API, manage state in Zustand stores, and compute grid coordinates, distances, and AoE templates — all with full test coverage.

### Task 17: API Clients — Maps, Tokens, Drawings

**Files:**
- Create: `client/src/api/maps.ts`
- Create: `client/src/api/tokens.ts`
- Create: `client/src/api/drawings.ts`

**Note:** The existing `client/src/api/client.ts` already has a `request<T>` helper. Import and reuse it in all three new API files instead of duplicating it. If it's not exported, export it first.

- [ ] **Step 1: Create maps API client**

```typescript
// client/src/api/maps.ts
import type { Map, MapWithLayers, CreateMapRequest, UpdateMapRequest } from '../types/Map';
import type { MapLayer, CreateLayerRequest, UpdateLayerRequest } from '../types/MapLayer';
import type { MapImage, PlaceMapImageRequest, UpdateMapImageRequest } from '../types/MapImage';

const base = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(url, { credentials: 'include', ...options });
  if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`);
  if (resp.status === 204) return undefined as T;
  return resp.json();
}

export const mapsApi = {
  create: (campaignId: string, data: CreateMapRequest) =>
    request<MapWithLayers>(`${base}/campaigns/${campaignId}/maps`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  list: (campaignId: string) =>
    request<Map[]>(`${base}/campaigns/${campaignId}/maps`),

  get: (mapId: string) =>
    request<MapWithLayers>(`${base}/maps/${mapId}`),

  update: (mapId: string, data: UpdateMapRequest) =>
    request<Map>(`${base}/maps/${mapId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  delete: (mapId: string) =>
    request<void>(`${base}/maps/${mapId}`, { method: 'DELETE' }),

  // Layers
  createLayer: (mapId: string, data: CreateLayerRequest) =>
    request<MapLayer>(`${base}/maps/${mapId}/layers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateLayer: (layerId: string, data: UpdateLayerRequest) =>
    request<MapLayer>(`${base}/layers/${layerId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteLayer: (layerId: string) =>
    request<void>(`${base}/layers/${layerId}`, { method: 'DELETE' }),

  reorderLayers: (mapId: string, layerIds: string[]) =>
    request<void>(`${base}/maps/${mapId}/layers/order`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layer_ids: layerIds }),
    }),

  // Map Images
  placeImage: (layerId: string, data: PlaceMapImageRequest) =>
    request<MapImage>(`${base}/layers/${layerId}/images`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateImage: (imageId: string, data: UpdateMapImageRequest) =>
    request<MapImage>(`${base}/images/${imageId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteImage: (imageId: string) =>
    request<void>(`${base}/images/${imageId}`, { method: 'DELETE' }),
};
```

- [ ] **Step 2: Create tokens API client**

```typescript
// client/src/api/tokens.ts
import type { Token, CreateTokenRequest, UpdateTokenRequest } from '../types/Token';

const base = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(url, { credentials: 'include', ...options });
  if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`);
  if (resp.status === 204) return undefined as T;
  return resp.json();
}

export const tokensApi = {
  create: (layerId: string, data: CreateTokenRequest) =>
    request<Token>(`${base}/layers/${layerId}/tokens`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  update: (tokenId: string, data: UpdateTokenRequest) =>
    request<Token>(`${base}/tokens/${tokenId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  delete: (tokenId: string) =>
    request<void>(`${base}/tokens/${tokenId}`, { method: 'DELETE' }),
};
```

- [ ] **Step 3: Create drawings API client**

```typescript
// client/src/api/drawings.ts
import type { Drawing, CreateDrawingRequest, UpdateDrawingRequest } from '../types/Drawing';

const base = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(url, { credentials: 'include', ...options });
  if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`);
  if (resp.status === 204) return undefined as T;
  return resp.json();
}

export const drawingsApi = {
  create: (layerId: string, data: CreateDrawingRequest) =>
    request<Drawing>(`${base}/layers/${layerId}/drawings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  update: (drawingId: string, data: UpdateDrawingRequest) =>
    request<Drawing>(`${base}/drawings/${drawingId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  delete: (drawingId: string) =>
    request<void>(`${base}/drawings/${drawingId}`, { method: 'DELETE' }),
};
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd client && npm run build`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/src/api/maps.ts client/src/api/tokens.ts client/src/api/drawings.ts
git commit -m "feat(client): add maps, tokens, drawings API clients"
```

---

### Task 18: Grid Math Utilities

**Files:**
- Create: `client/src/canvas/math/grid.ts`
- Create: `client/src/canvas/math/__tests__/grid.test.ts`

- [ ] **Step 1: Write failing tests for grid math**

```typescript
// client/src/canvas/math/__tests__/grid.test.ts
import { describe, it, expect } from 'vitest';
import {
  gridToPixel, pixelToGrid, snapToCenter, snapToCorner,
  gridDistance, diagonalDistance, waypointDistance,
} from '../grid';

describe('gridToPixel', () => {
  it('converts grid coords to pixel coords', () => {
    expect(gridToPixel(3, 2, 70)).toEqual({ x: 210, y: 140 });
  });

  it('handles fractional grid coords', () => {
    expect(gridToPixel(1.5, 2.5, 70)).toEqual({ x: 105, y: 175 });
  });
});

describe('pixelToGrid', () => {
  it('converts pixel coords to grid coords', () => {
    expect(pixelToGrid(210, 140, 70)).toEqual({ col: 3, row: 2 });
  });

  it('floors fractional positions', () => {
    expect(pixelToGrid(215, 145, 70)).toEqual({ col: 3, row: 2 });
  });
});

describe('snapToCenter', () => {
  it('snaps pixel position to cell center', () => {
    expect(snapToCenter(215, 145, 70)).toEqual({ x: 245, y: 175 }); // center of cell (3,2)
  });
});

describe('snapToCorner', () => {
  it('snaps pixel position to nearest grid intersection', () => {
    expect(snapToCorner(215, 145, 70)).toEqual({ x: 210, y: 140 }); // corner at (3,2)
  });

  it('snaps to nearest corner', () => {
    expect(snapToCorner(260, 170, 70)).toEqual({ x: 280, y: 210 }); // corner at (4,3)
  });
});

describe('diagonalDistance', () => {
  it('computes dnd_standard distance (alternating 5/10)', () => {
    // 3 diagonal squares at scale 5: 5 + 10 + 5 = 20
    expect(diagonalDistance(0, 0, 3, 3, 5, 'dnd_standard')).toBe(20);
  });

  it('computes euclidean distance', () => {
    const d = diagonalDistance(0, 0, 3, 4, 5, 'euclidean');
    expect(d).toBeCloseTo(25); // 5 * sqrt(9+16) = 25
  });

  it('computes manhattan distance', () => {
    expect(diagonalDistance(0, 0, 3, 4, 5, 'manhattan')).toBe(35); // 7 * 5
  });

  it('computes straight line distance', () => {
    expect(diagonalDistance(0, 0, 0, 5, 5, 'dnd_standard')).toBe(25);
  });
});

describe('gridDistance', () => {
  it('computes distance between two grid points', () => {
    expect(gridDistance(0, 0, 3, 0, 5, 'dnd_standard')).toBe(15);
  });
});

describe('waypointDistance', () => {
  it('computes total distance for multi-segment path', () => {
    const result = waypointDistance(
      [{ col: 0, row: 0 }, { col: 3, row: 0 }, { col: 3, row: 4 }],
      5, 'dnd_standard',
    );
    expect(result.segments).toEqual([15, 20]);
    expect(result.total).toBe(35);
  });

  it('returns empty for single point', () => {
    const result = waypointDistance([{ col: 0, row: 0 }], 5, 'dnd_standard');
    expect(result.segments).toEqual([]);
    expect(result.total).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npm run test -- --run src/canvas/math/__tests__/grid.test.ts`

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement grid math**

```typescript
// client/src/canvas/math/grid.ts

export interface PixelPoint { x: number; y: number; }
export interface GridPoint { col: number; row: number; }

export type DiagonalMode = 'dnd_standard' | 'euclidean' | 'manhattan';
export type SnapMode = 'off' | 'center' | 'corner';

/** Convert grid coordinates to pixel coordinates (top-left of cell) */
export function gridToPixel(col: number, row: number, cellSize: number): PixelPoint {
  return { x: col * cellSize, y: row * cellSize };
}

/** Convert pixel coordinates to grid cell (floor) */
export function pixelToGrid(x: number, y: number, cellSize: number): GridPoint {
  return { col: Math.floor(x / cellSize), row: Math.floor(y / cellSize) };
}

/** Snap pixel position to the center of the nearest grid cell */
export function snapToCenter(x: number, y: number, cellSize: number): PixelPoint {
  const col = Math.floor(x / cellSize);
  const row = Math.floor(y / cellSize);
  return { x: col * cellSize + cellSize / 2, y: row * cellSize + cellSize / 2 };
}

/** Snap pixel position to the nearest grid intersection (corner) */
export function snapToCorner(x: number, y: number, cellSize: number): PixelPoint {
  return {
    x: Math.round(x / cellSize) * cellSize,
    y: Math.round(y / cellSize) * cellSize,
  };
}

/** Snap pixel position according to the given snap mode */
export function snapPosition(x: number, y: number, cellSize: number, mode: SnapMode): PixelPoint {
  switch (mode) {
    case 'center': return snapToCenter(x, y, cellSize);
    case 'corner': return snapToCorner(x, y, cellSize);
    case 'off': return { x, y };
  }
}

/**
 * Compute distance between two grid positions using the specified diagonal mode.
 * Returns distance in world units (grid_scale * squares).
 */
export function gridDistance(
  c1: number, r1: number, c2: number, r2: number,
  gridScale: number, mode: DiagonalMode,
): number {
  return diagonalDistance(c1, r1, c2, r2, gridScale, mode);
}

/**
 * Compute distance between two grid positions.
 */
export function diagonalDistance(
  c1: number, r1: number, c2: number, r2: number,
  gridScale: number, mode: DiagonalMode,
): number {
  const dc = Math.abs(c2 - c1);
  const dr = Math.abs(r2 - r1);

  switch (mode) {
    case 'euclidean':
      return Math.sqrt(dc * dc + dr * dr) * gridScale;

    case 'manhattan':
      return (dc + dr) * gridScale;

    case 'dnd_standard': {
      // D&D 3.5e: alternating 1/2/1/2 cost for diagonals
      const diag = Math.min(dc, dr);
      const straight = Math.max(dc, dr) - diag;
      // Each pair of diagonal moves costs 1 + 2 = 3 squares
      // Odd diagonal costs 1 extra
      const diagCost = Math.floor(diag / 2) * 3 + (diag % 2);
      return (straight + diagCost) * gridScale;
    }
  }
}

/**
 * Compute waypoint path total distance.
 * points: array of {col, row} grid positions
 */
export function waypointDistance(
  points: GridPoint[],
  gridScale: number,
  mode: DiagonalMode,
): { segments: number[]; total: number } {
  const segments: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = gridDistance(
      points[i - 1].col, points[i - 1].row,
      points[i].col, points[i].row,
      gridScale, mode,
    );
    segments.push(d);
    total += d;
  }
  return { segments, total };
}
```

- [ ] **Step 4: Run tests**

Run: `cd client && npm run test -- --run src/canvas/math/__tests__/grid.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/canvas/math/grid.ts client/src/canvas/math/__tests__/grid.test.ts
git commit -m "feat(client): add grid coordinate math utilities with tests"
```

---

### Task 19: AoE Math Utilities

**Files:**
- Create: `client/src/canvas/math/aoe.ts`
- Create: `client/src/canvas/math/__tests__/aoe.test.ts`

- [ ] **Step 1: Write failing tests for AoE math**

```typescript
// client/src/canvas/math/__tests__/aoe.test.ts
import { describe, it, expect } from 'vitest';
import { coneAffectedSquares, cubeAffectedSquares, sphereAffectedSquares, lineAffectedSquares } from '../aoe';

describe('sphereAffectedSquares', () => {
  it('returns center square for radius 0', () => {
    const squares = sphereAffectedSquares(5, 5, 0);
    expect(squares).toEqual([{ col: 5, row: 5 }]);
  });

  it('returns correct squares for 10ft sphere (radius 2)', () => {
    const squares = sphereAffectedSquares(5, 5, 2);
    // 10ft radius = 2 squares. Should be a roughly circular area.
    expect(squares.length).toBeGreaterThan(4);
    // Center should be included
    expect(squares).toContainEqual({ col: 5, row: 5 });
    // Corners at distance > 2 should NOT be included
    expect(squares).not.toContainEqual({ col: 3, row: 3 });
  });
});

describe('cubeAffectedSquares', () => {
  it('returns correct NxN squares', () => {
    const squares = cubeAffectedSquares(2, 3, 3);
    expect(squares.length).toBe(9); // 3x3
    expect(squares).toContainEqual({ col: 2, row: 3 });
    expect(squares).toContainEqual({ col: 4, row: 5 });
  });
});

describe('coneAffectedSquares', () => {
  it('returns squares in cone direction', () => {
    const squares = coneAffectedSquares(5, 5, 3, 0, 90); // 3 squares long, pointing right
    expect(squares.length).toBeGreaterThan(0);
    // All squares should be to the right of origin
    expect(squares.every(s => s.col >= 5)).toBe(true);
  });
});

describe('lineAffectedSquares', () => {
  it('returns squares along a horizontal line', () => {
    const squares = lineAffectedSquares(2, 3, 5, 0, 1);
    expect(squares.length).toBe(5);
    expect(squares[0]).toEqual({ col: 2, row: 3 });
    expect(squares[4]).toEqual({ col: 6, row: 3 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npm run test -- --run src/canvas/math/__tests__/aoe.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement AoE math**

```typescript
// client/src/canvas/math/aoe.ts
import type { GridPoint } from './grid';

/**
 * Sphere/Circle: all squares whose center is within `radius` squares of the center.
 * Per D&D 3.5e PHB p.304: a square is in the area if any part overlaps.
 * We approximate by checking if the square center is within radius + 0.5.
 */
export function sphereAffectedSquares(
  centerCol: number, centerRow: number, radius: number,
): GridPoint[] {
  if (radius === 0) return [{ col: centerCol, row: centerRow }];

  const squares: GridPoint[] = [];
  const r = radius + 0.5; // half-square overlap rule
  for (let c = centerCol - radius; c <= centerCol + radius; c++) {
    for (let r2 = centerRow - radius; r2 <= centerRow + radius; r2++) {
      const dc = c - centerCol;
      const dr = r2 - centerRow;
      if (Math.sqrt(dc * dc + dr * dr) <= r) {
        squares.push({ col: c, row: r2 });
      }
    }
  }
  return squares;
}

/**
 * Cube: NxN square starting at origin corner.
 */
export function cubeAffectedSquares(
  originCol: number, originRow: number, size: number,
): GridPoint[] {
  const squares: GridPoint[] = [];
  for (let c = originCol; c < originCol + size; c++) {
    for (let r = originRow; r < originRow + size; r++) {
      squares.push({ col: c, row: r });
    }
  }
  return squares;
}

/**
 * Cone: originates from a grid intersection, expands outward.
 * direction: angle in degrees (0 = right, 90 = down, etc.)
 * angle: cone spread in degrees (default 90)
 * length: in grid squares
 */
export function coneAffectedSquares(
  originCol: number, originRow: number,
  length: number, direction: number, angle: number = 90,
): GridPoint[] {
  const squares: GridPoint[] = [];
  const halfAngle = (angle / 2) * (Math.PI / 180);
  const dirRad = direction * (Math.PI / 180);

  for (let c = originCol - length; c <= originCol + length; c++) {
    for (let r = originRow - length; r <= originRow + length; r++) {
      // Vector from origin to cell center
      const dx = (c + 0.5) - originCol;
      const dy = (r + 0.5) - originRow;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist === 0 || dist > length + 0.5) continue;

      const cellAngle = Math.atan2(dy, dx);
      let angleDiff = Math.abs(cellAngle - dirRad);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

      if (angleDiff <= halfAngle) {
        squares.push({ col: c, row: r });
      }
    }
  }
  return squares;
}

/**
 * Line: extends from origin in a direction for `length` squares, `width` squares wide.
 * direction: angle in degrees (0 = right, 90 = down)
 */
export function lineAffectedSquares(
  originCol: number, originRow: number,
  length: number, direction: number, width: number = 1,
): GridPoint[] {
  const squares: GridPoint[] = [];
  const dirRad = direction * (Math.PI / 180);
  const perpRad = dirRad + Math.PI / 2;

  const dx = Math.cos(dirRad);
  const dy = Math.sin(dirRad);
  const px = Math.cos(perpRad);
  const py = Math.sin(perpRad);

  const halfWidth = (width - 1) / 2;

  for (let l = 0; l < length; l++) {
    for (let w = -Math.floor(halfWidth); w <= Math.ceil(halfWidth); w++) {
      const col = Math.round(originCol + dx * l + px * w);
      const row = Math.round(originRow + dy * l + py * w);
      // Deduplicate
      if (!squares.some(s => s.col === col && s.row === row)) {
        squares.push({ col, row });
      }
    }
  }
  return squares;
}
```

- [ ] **Step 4: Run tests**

Run: `cd client && npm run test -- --run src/canvas/math/__tests__/aoe.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/canvas/math/aoe.ts client/src/canvas/math/__tests__/aoe.test.ts
git commit -m "feat(client): add AoE template math (cone, cube, sphere, line)"
```

---

### Task 20: Point Simplification Utility

**Files:**
- Create: `client/src/canvas/math/simplify.ts`
- Create: `client/src/canvas/math/__tests__/simplify.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// client/src/canvas/math/__tests__/simplify.test.ts
import { describe, it, expect } from 'vitest';
import { simplifyPoints } from '../simplify';

describe('simplifyPoints (Ramer-Douglas-Peucker)', () => {
  it('returns endpoints for a straight line', () => {
    const points = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
      { x: 3, y: 0 }, { x: 4, y: 0 },
    ];
    const result = simplifyPoints(points, 1);
    expect(result).toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }]);
  });

  it('preserves corners', () => {
    const points = [
      { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 },
    ];
    const result = simplifyPoints(points, 1);
    expect(result.length).toBe(3);
  });

  it('reduces point count for noisy curves', () => {
    // Generate a noisy sine wave
    const points = Array.from({ length: 100 }, (_, i) => ({
      x: i,
      y: Math.sin(i / 10) * 20 + (Math.random() - 0.5) * 2,
    }));
    const result = simplifyPoints(points, 2);
    expect(result.length).toBeLessThan(points.length);
    expect(result.length).toBeGreaterThan(2);
  });

  it('returns original for 2 or fewer points', () => {
    expect(simplifyPoints([{ x: 0, y: 0 }], 1)).toEqual([{ x: 0, y: 0 }]);
    expect(simplifyPoints([], 1)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npm run test -- --run src/canvas/math/__tests__/simplify.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement Ramer-Douglas-Peucker**

```typescript
// client/src/canvas/math/simplify.ts

interface Point { x: number; y: number; }

/**
 * Ramer-Douglas-Peucker line simplification.
 * Reduces the number of points in a polyline while preserving its shape.
 * @param points Input polyline
 * @param epsilon Maximum perpendicular distance threshold
 */
export function simplifyPoints(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return [...points];

  // Find the point furthest from the line between first and last
  let maxDist = 0;
  let maxIdx = 0;

  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], start, end);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPoints(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyPoints(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [start, end];
}

function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lineLenSq = dx * dx + dy * dy;

  if (lineLenSq === 0) {
    // Start and end are the same point
    const ddx = point.x - lineStart.x;
    const ddy = point.y - lineStart.y;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }

  return Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) /
    Math.sqrt(lineLenSq);
}
```

- [ ] **Step 4: Run tests**

Run: `cd client && npm run test -- --run src/canvas/math/__tests__/simplify.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/canvas/math/simplify.ts client/src/canvas/math/__tests__/simplify.test.ts
git commit -m "feat(client): add Ramer-Douglas-Peucker point simplification"
```

---

### Task 21: Zustand Stores — Map & Tool

**Files:**
- Create: `client/src/state/map.ts`
- Create: `client/src/state/tools.ts`
- Create: `client/src/state/__tests__/map.test.ts`
- Create: `client/src/state/__tests__/tools.test.ts`

- [ ] **Step 1: Write failing tests for map store**

```typescript
// client/src/state/__tests__/map.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useMapStore } from '../map';

describe('useMapStore', () => {
  beforeEach(() => {
    useMapStore.setState(useMapStore.getInitialState());
  });

  it('starts with no map loaded', () => {
    const state = useMapStore.getState();
    expect(state.currentMap).toBeNull();
    expect(state.layers).toEqual([]);
  });

  it('loads a map with layers', () => {
    const map = { id: '1', name: 'Tavern', grid_enabled: true, grid_size_px: 70 } as any;
    const layers = [
      { id: 'l1', name: 'Background', sort_order: 0 },
      { id: 'l2', name: 'Tokens', sort_order: 1 },
    ] as any[];

    useMapStore.getState().loadMap(map, layers);

    const state = useMapStore.getState();
    expect(state.currentMap?.id).toBe('1');
    expect(state.layers.length).toBe(2);
    expect(state.activeLayerId).toBe('l1');
  });

  it('sets active layer', () => {
    useMapStore.getState().loadMap({ id: '1' } as any, [{ id: 'l1' }, { id: 'l2' }] as any[]);
    useMapStore.getState().setActiveLayer('l2');
    expect(useMapStore.getState().activeLayerId).toBe('l2');
  });

  it('updates layer properties', () => {
    useMapStore.getState().loadMap({ id: '1' } as any, [
      { id: 'l1', name: 'Old', visible: true, locked: false } as any,
    ]);
    useMapStore.getState().updateLayer('l1', { name: 'New', locked: true });

    const layer = useMapStore.getState().layers[0];
    expect(layer.name).toBe('New');
    expect(layer.locked).toBe(true);
    expect(layer.visible).toBe(true); // unchanged
  });
});
```

- [ ] **Step 2: Write failing tests for tool store**

```typescript
// client/src/state/__tests__/tools.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useToolStore } from '../tools';

describe('useToolStore', () => {
  beforeEach(() => {
    useToolStore.setState(useToolStore.getInitialState());
  });

  it('starts with select tool', () => {
    expect(useToolStore.getState().activeTool).toBe('select');
  });

  it('switches tool', () => {
    useToolStore.getState().setTool('freehand');
    expect(useToolStore.getState().activeTool).toBe('freehand');
  });

  it('updates draw settings', () => {
    useToolStore.getState().setDrawSettings({ strokeColor: '#ff0000', strokeWidth: 5 });
    const { drawSettings } = useToolStore.getState();
    expect(drawSettings.strokeColor).toBe('#ff0000');
    expect(drawSettings.strokeWidth).toBe(5);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd client && npm run test -- --run src/state/__tests__/map.test.ts src/state/__tests__/tools.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement map store**

```typescript
// client/src/state/map.ts
import { create } from 'zustand';
import type { Map } from '../types/Map';
import type { MapLayer } from '../types/MapLayer';
// ToolName is defined in tools.ts — import it if needed here, do NOT duplicate

interface MapState {
  currentMap: Map | null;
  layers: MapLayer[];
  activeLayerId: string | null;

  loadMap: (map: Map, layers: MapLayer[]) => void;
  unloadMap: () => void;
  setActiveLayer: (layerId: string) => void;
  updateMap: (patch: Partial<Map>) => void;
  updateLayer: (layerId: string, patch: Partial<MapLayer>) => void;
  addLayer: (layer: MapLayer) => void;
  removeLayer: (layerId: string) => void;
  reorderLayers: (layerIds: string[]) => void;
}

export const useMapStore = create<MapState>()((set) => ({
  currentMap: null,
  layers: [],
  activeLayerId: null,

  loadMap: (map, layers) => set({
    currentMap: map,
    layers,
    activeLayerId: layers[0]?.id ?? null,
  }),

  unloadMap: () => set({
    currentMap: null,
    layers: [],
    activeLayerId: null,
  }),

  setActiveLayer: (layerId) => set({ activeLayerId: layerId }),

  updateMap: (patch) => set((s) => ({
    currentMap: s.currentMap ? { ...s.currentMap, ...patch } : null,
  })),

  updateLayer: (layerId, patch) => set((s) => ({
    layers: s.layers.map((l) =>
      l.id === layerId ? { ...l, ...patch } : l
    ),
  })),

  addLayer: (layer) => set((s) => ({
    layers: [...s.layers, layer],
  })),

  removeLayer: (layerId) => set((s) => ({
    layers: s.layers.filter((l) => l.id !== layerId),
    activeLayerId: s.activeLayerId === layerId
      ? s.layers.find((l) => l.id !== layerId)?.id ?? null
      : s.activeLayerId,
  })),

  reorderLayers: (layerIds) => set((s) => ({
    layers: layerIds
      .map((id, i) => {
        const layer = s.layers.find((l) => l.id === id);
        return layer ? { ...layer, sort_order: i } : null;
      })
      .filter((l): l is MapLayer => l !== null),
  })),
}));
```

- [ ] **Step 5: Implement tool store**

```typescript
// client/src/state/tools.ts
import { create } from 'zustand';

export type ToolName =
  | 'select' | 'pan'
  | 'freehand' | 'line' | 'rectangle' | 'circle' | 'polygon' | 'eraser'
  | 'aoe_cone' | 'aoe_cube' | 'aoe_sphere' | 'aoe_line'
  | 'ruler' | 'waypoint';

export interface DrawSettings {
  strokeColor: string;
  strokeWidth: number;
  strokeOpacity: number;
  fillColor: string | null;
  fillOpacity: number;
}

interface ToolState {
  activeTool: ToolName;
  drawSettings: DrawSettings;

  setTool: (tool: ToolName) => void;
  setDrawSettings: (patch: Partial<DrawSettings>) => void;
}

const defaultDrawSettings: DrawSettings = {
  strokeColor: '#ffffff',
  strokeWidth: 2,
  strokeOpacity: 1,
  fillColor: null,
  fillOpacity: 0.3,
};

export const useToolStore = create<ToolState>()((set) => ({
  activeTool: 'select',
  drawSettings: { ...defaultDrawSettings },

  setTool: (tool) => set({ activeTool: tool }),

  setDrawSettings: (patch) => set((s) => ({
    drawSettings: { ...s.drawSettings, ...patch },
  })),
}));
```

- [ ] **Step 6: Run tests**

Run: `cd client && npm run test -- --run src/state/__tests__/map.test.ts src/state/__tests__/tools.test.ts`

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/state/map.ts client/src/state/tools.ts client/src/state/__tests__/
git commit -m "feat(client): add map and tool Zustand stores with tests"
```

---

### Task 22: Zustand Stores — Tokens & Drawings

**Files:**
- Create: `client/src/state/tokens.ts`
- Create: `client/src/state/drawings.ts`
- Create: `client/src/state/__tests__/tokens.test.ts`
- Create: `client/src/state/__tests__/drawings.test.ts`

- [ ] **Step 1: Write failing tests for token store**

```typescript
// client/src/state/__tests__/tokens.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useTokenStore } from '../tokens';

describe('useTokenStore', () => {
  beforeEach(() => {
    useTokenStore.setState(useTokenStore.getInitialState());
  });

  it('starts with empty tokens', () => {
    expect(useTokenStore.getState().tokens).toEqual([]);
    expect(useTokenStore.getState().selectedIds).toEqual([]);
  });

  it('loads tokens', () => {
    useTokenStore.getState().loadTokens([
      { id: 't1', name: 'Goblin' } as any,
      { id: 't2', name: 'Orc' } as any,
    ]);
    expect(useTokenStore.getState().tokens.length).toBe(2);
  });

  it('selects and deselects tokens', () => {
    useTokenStore.getState().loadTokens([{ id: 't1' } as any]);
    useTokenStore.getState().selectToken('t1');
    expect(useTokenStore.getState().selectedIds).toEqual(['t1']);

    useTokenStore.getState().deselectAll();
    expect(useTokenStore.getState().selectedIds).toEqual([]);
  });

  it('toggle-selects for multi-select', () => {
    useTokenStore.getState().loadTokens([
      { id: 't1' } as any, { id: 't2' } as any,
    ]);
    useTokenStore.getState().selectToken('t1');
    useTokenStore.getState().toggleSelect('t2');
    expect(useTokenStore.getState().selectedIds).toEqual(['t1', 't2']);

    useTokenStore.getState().toggleSelect('t1');
    expect(useTokenStore.getState().selectedIds).toEqual(['t2']);
  });

  it('updates token position', () => {
    useTokenStore.getState().loadTokens([{ id: 't1', x: 0, y: 0 } as any]);
    useTokenStore.getState().moveToken('t1', 5, 3);
    const token = useTokenStore.getState().tokens[0];
    expect(token.x).toBe(5);
    expect(token.y).toBe(3);
  });
});
```

- [ ] **Step 2: Write failing tests for drawing store**

```typescript
// client/src/state/__tests__/drawings.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore } from '../drawings';

describe('useDrawingStore', () => {
  beforeEach(() => {
    useDrawingStore.setState(useDrawingStore.getInitialState());
  });

  it('starts empty', () => {
    expect(useDrawingStore.getState().drawings).toEqual([]);
  });

  it('adds and removes drawings', () => {
    const d = { id: 'd1', layer_id: 'l1', drawing_type: 'line' } as any;
    useDrawingStore.getState().addDrawing(d);
    expect(useDrawingStore.getState().drawings.length).toBe(1);

    useDrawingStore.getState().removeDrawing('d1');
    expect(useDrawingStore.getState().drawings.length).toBe(0);
  });

  it('supports undo/redo', () => {
    const d1 = { id: 'd1', layer_id: 'l1' } as any;
    useDrawingStore.getState().addDrawing(d1);

    useDrawingStore.getState().undo('l1');
    expect(useDrawingStore.getState().drawings.length).toBe(0);

    useDrawingStore.getState().redo('l1');
    expect(useDrawingStore.getState().drawings.length).toBe(1);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd client && npm run test -- --run src/state/__tests__/tokens.test.ts src/state/__tests__/drawings.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement token store**

```typescript
// client/src/state/tokens.ts
import { create } from 'zustand';
import type { Token } from '../types/Token';

interface TokenState {
  tokens: Token[];
  selectedIds: string[];

  loadTokens: (tokens: Token[]) => void;
  addToken: (token: Token) => void;
  removeToken: (tokenId: string) => void;
  updateToken: (tokenId: string, patch: Partial<Token>) => void;
  moveToken: (tokenId: string, x: number, y: number) => void;

  selectToken: (tokenId: string) => void;
  toggleSelect: (tokenId: string) => void;
  deselectAll: () => void;
  boxSelect: (tokenIds: string[]) => void;
}

export const useTokenStore = create<TokenState>()((set) => ({
  tokens: [],
  selectedIds: [],

  loadTokens: (tokens) => set({ tokens, selectedIds: [] }),

  addToken: (token) => set((s) => ({
    tokens: [...s.tokens, token],
  })),

  removeToken: (tokenId) => set((s) => ({
    tokens: s.tokens.filter((t) => t.id !== tokenId),
    selectedIds: s.selectedIds.filter((id) => id !== tokenId),
  })),

  updateToken: (tokenId, patch) => set((s) => ({
    tokens: s.tokens.map((t) =>
      t.id === tokenId ? { ...t, ...patch } : t
    ),
  })),

  moveToken: (tokenId, x, y) => set((s) => ({
    tokens: s.tokens.map((t) =>
      t.id === tokenId ? { ...t, x, y } : t
    ),
  })),

  selectToken: (tokenId) => set({ selectedIds: [tokenId] }),
  toggleSelect: (tokenId) => set((s) => ({
    selectedIds: s.selectedIds.includes(tokenId)
      ? s.selectedIds.filter((id) => id !== tokenId)
      : [...s.selectedIds, tokenId],
  })),
  deselectAll: () => set({ selectedIds: [] }),
  boxSelect: (tokenIds) => set({ selectedIds: tokenIds }),
}));
```

- [ ] **Step 5: Implement drawing store with undo/redo**

```typescript
// client/src/state/drawings.ts
import { create } from 'zustand';
import type { Drawing } from '../types/Drawing';

interface UndoEntry {
  layerId: string;
  action: 'add' | 'remove';
  drawing: Drawing;
}

interface DrawingState {
  drawings: Drawing[];
  undoStacks: Record<string, UndoEntry[]>;  // per-layer
  redoStacks: Record<string, UndoEntry[]>;  // per-layer

  loadDrawings: (drawings: Drawing[]) => void;
  addDrawing: (drawing: Drawing) => void;
  removeDrawing: (drawingId: string) => void;
  updateDrawing: (drawingId: string, patch: Partial<Drawing>) => void;

  undo: (layerId: string) => void;
  redo: (layerId: string) => void;
}

export const useDrawingStore = create<DrawingState>()((set) => ({
  drawings: [],
  undoStacks: {},
  redoStacks: {},

  loadDrawings: (drawings) => set({ drawings, undoStacks: {}, redoStacks: {} }),

  addDrawing: (drawing) => set((s) => {
    const layerId = drawing.layer_id;
    const undoStack = [...(s.undoStacks[layerId] ?? []), { layerId, action: 'add' as const, drawing }];
    return {
      drawings: [...s.drawings, drawing],
      undoStacks: { ...s.undoStacks, [layerId]: undoStack },
      redoStacks: { ...s.redoStacks, [layerId]: [] }, // clear redo on new action
    };
  }),

  removeDrawing: (drawingId) => set((s) => {
    const drawing = s.drawings.find((d) => d.id === drawingId);
    if (!drawing) return s;
    const layerId = drawing.layer_id;
    const undoStack = [...(s.undoStacks[layerId] ?? []), { layerId, action: 'remove' as const, drawing }];
    return {
      drawings: s.drawings.filter((d) => d.id !== drawingId),
      undoStacks: { ...s.undoStacks, [layerId]: undoStack },
      redoStacks: { ...s.redoStacks, [layerId]: [] },
    };
  }),

  updateDrawing: (drawingId, patch) => set((s) => {
    const original = s.drawings.find((d) => d.id === drawingId);
    if (!original) return s;
    const layerId = original.layer_id;
    const undoStack = [...(s.undoStacks[layerId] ?? []),
      { layerId, action: 'remove' as const, drawing: original }];
    const updated = { ...original, ...patch };
    return {
      drawings: s.drawings.map((d) => d.id === drawingId ? updated : d),
      undoStacks: { ...s.undoStacks, [layerId]: undoStack },
      redoStacks: { ...s.redoStacks, [layerId]: [] },
    };
  }),

  undo: (layerId) => set((s) => {
    const stack = s.undoStacks[layerId] ?? [];
    if (stack.length === 0) return s;

    const entry = stack[stack.length - 1];
    const newUndo = stack.slice(0, -1);
    const newRedo = [...(s.redoStacks[layerId] ?? []), entry];

    let drawings: Drawing[];
    if (entry.action === 'add') {
      drawings = s.drawings.filter((d) => d.id !== entry.drawing.id);
    } else {
      drawings = [...s.drawings, entry.drawing];
    }

    return {
      drawings,
      undoStacks: { ...s.undoStacks, [layerId]: newUndo },
      redoStacks: { ...s.redoStacks, [layerId]: newRedo },
    };
  }),

  redo: (layerId) => set((s) => {
    const stack = s.redoStacks[layerId] ?? [];
    if (stack.length === 0) return s;

    const entry = stack[stack.length - 1];
    const newRedo = stack.slice(0, -1);
    const newUndo = [...(s.undoStacks[layerId] ?? []), entry];

    let drawings: Drawing[];
    if (entry.action === 'add') {
      drawings = [...s.drawings, entry.drawing];
    } else {
      drawings = s.drawings.filter((d) => d.id !== entry.drawing.id);
    }

    return {
      drawings,
      undoStacks: { ...s.undoStacks, [layerId]: newUndo },
      redoStacks: { ...s.redoStacks, [layerId]: newRedo },
    };
  }),
}));
```

- [ ] **Step 6: Run tests**

Run: `cd client && npm run test -- --run src/state/__tests__/tokens.test.ts src/state/__tests__/drawings.test.ts`

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/state/tokens.ts client/src/state/drawings.ts client/src/state/__tests__/
git commit -m "feat(client): add token and drawing stores with undo/redo"
```

---

### Task 23: Chunk 3 Verification

- [ ] **Step 1: Run all frontend tests**

Run: `cd client && npm run test -- --run`

Expected: All tests pass.

- [ ] **Step 2: Run lint**

Run: `cd client && npm run lint`

Expected: No lint errors.

- [ ] **Step 3: Run build**

Run: `cd client && npm run build`

Expected: TypeScript compiles and Vite builds successfully.

---

## Chunk 4: PixiJS Canvas Rendering

Tasks 24–29 build the six PixiJS canvas subsystems. Each is a plain TypeScript class (not a React component) that owns a PixiJS Container or Graphics object. The existing `CanvasView.tsx` is refactored to compose these subsystems. All canvas classes subscribe to Zustand stores for state and render accordingly.

**Pattern:** Each canvas class follows this structure:
- Constructor receives the PixiJS `Application` and subscribes to relevant Zustand store(s)
- Exposes a `destroy()` method that cleans up subscriptions and PixiJS objects
- Never holds authoritative state — reads from stores, renders to PixiJS

### Task 24: Viewport — Pan, Zoom, Culling

**Files:**
- Create: `client/src/canvas/Viewport.ts`
- Modify: `client/src/canvas/CanvasView.tsx`

**What to build:**
- A class wrapping a PixiJS `Container` that serves as the world root (all other canvas objects are children)
- Pan: on middle-mouse drag or two-finger trackpad, translate the container
- Zoom: on scroll wheel / pinch, scale the container centered on cursor position
- Clamp zoom to 0.1x–5x range
- Expose `worldToScreen(x, y)` and `screenToWorld(x, y)` methods for coordinate conversion
- Expose `getVisibleBounds()` returning the world-space rectangle currently visible (used for culling)
- Keyboard shortcuts: `Home` = fit-to-map, `F` = center on selected token

**Implementation approach:**
- Use a PixiJS Container as the viewport root. Pan = adjust `container.position`, zoom = adjust `container.scale`
- Attach event listeners to the PixiJS `app.canvas` element for mouse/wheel events
- Smooth zoom: animate scale changes with `requestAnimationFrame` or PixiJS ticker

- [ ] **Step 1: Implement Viewport class** — Create the class with pan/zoom/bounds methods
- [ ] **Step 2: Integrate into CanvasView.tsx** — Replace the current simple canvas init with Viewport as the world root
- [ ] **Step 3: Manual test** — Verify pan/zoom works in the browser: `cd client && npm run dev`
- [ ] **Step 4: Commit**

---

### Task 25: Grid Renderer

**Files:**
- Create: `client/src/canvas/GridRenderer.ts`

**What to build:**
- A class that renders the square grid as a PixiJS `Graphics` object
- Subscribes to `useMapStore` for grid settings (enabled, size_px, color, opacity, line_width)
- Only draws grid lines within the visible viewport bounds (from Viewport.getVisibleBounds())
- When grid is disabled (`grid_enabled = false`), hides the Graphics object
- Re-renders on viewport change (pan/zoom) — use PixiJS ticker or viewport change callback
- Grid lines extend to cover `width_squares × height_squares`

**Performance:** Cache the grid as a render texture when the viewport isn't changing. Redraw only when viewport moves or grid settings change.

- [ ] **Step 1: Implement GridRenderer class** — Grid drawing with viewport culling
- [ ] **Step 2: Integrate into CanvasView** — Add grid as first child of Viewport container
- [ ] **Step 3: Connect to map store** — Subscribe to grid settings changes
- [ ] **Step 4: Manual test** — Verify grid renders, changes with settings
- [ ] **Step 5: Commit**

---

### Task 26: Layer Manager

**Files:**
- Create: `client/src/canvas/LayerManager.ts`

**What to build:**
- A class that manages PixiJS `Container` objects, one per map layer
- Subscribes to `useMapStore.layers` — creates/removes/reorders Containers to match
- Each Container's `alpha` = layer opacity, `visible` = layer visible flag
- Containers are children of the Viewport root, ordered by `sort_order`
- Exposes `getContainer(layerId)` so other subsystems (TokenRenderer, DrawingRenderer) can add children to the right layer
- When layers reorder, reorder PixiJS Container children (via `setChildIndex` or re-adding)

- [ ] **Step 1: Implement LayerManager class**
- [ ] **Step 2: Integrate into CanvasView** — LayerManager creates containers inside Viewport
- [ ] **Step 3: Manual test** — Verify layers create/destroy when map loads
- [ ] **Step 4: Commit**

---

### Task 27: Token Renderer & Interaction

**Files:**
- Create: `client/src/canvas/TokenRenderer.ts`
- Create: `client/src/canvas/TokenInteraction.ts`

**What to build (TokenRenderer):**
- Renders each token as a PixiJS `Sprite` (from asset image) inside the correct layer Container
- Subscribes to `useTokenStore.tokens` — creates/removes/updates sprites to match
- Token position: `gridToPixel(token.x, token.y, gridSize)` using the grid math from Task 18
- Token size: sprite scaled to `token.size * gridSize` pixels square
- Circular crop: apply a circular mask to each token sprite
- HP bars: render as thin colored rectangles below the token sprite (using PixiJS Graphics)
- Status markers: render condition icons around the token border (from sprite sheet atlas)
- Selection ring: animated dashed circle around selected tokens
- Shared textures: use PixiJS `Assets.load()` with caching for token images

**What to build (TokenInteraction):**
- Click on token → `useTokenStore.selectToken(id)`, open Token Inspector
- Shift-click → `useTokenStore.toggleSelect(id)`
- Drag selected token(s) → show ghost at snap position, on release update position via `tokensApi.update()` and store
- Box-select: drag on empty canvas area → select all tokens in the rectangle
- Right-click → show context menu (handled by React component, TokenInteraction dispatches an event)
- Double-click → open token editor
- Keyboard: arrow keys move selected token by 1 grid square
- Permission check: only allow drag on tokens where `token.owner_id === currentUserId` or user is DM

- [ ] **Step 1: Implement TokenRenderer** — Sprite creation, bars, status markers, selection ring
- [ ] **Step 2: Write unit tests for TokenInteraction logic** — Test permission checks (can user move this token?), snap position calculations, box-select hit testing. These are pure logic tests that don't need PixiJS. Create `client/src/canvas/__tests__/TokenInteraction.test.ts`.
- [ ] **Step 3: Implement TokenInteraction** — Click, drag, multi-select, keyboard handlers
- [ ] **Step 4: Integrate both into CanvasView** — Wire up with LayerManager and stores
- [ ] **Step 5: Manual test** — Create tokens via API, verify they render and can be moved
- [ ] **Step 6: Commit**

---

### Task 28: Drawing Renderer & Tools

**Files:**
- Create: `client/src/canvas/DrawingRenderer.ts`
- Create: `client/src/canvas/DrawingTools.ts`
- Create: `client/src/canvas/AoeTemplates.ts`

**What to build (DrawingRenderer):**
- Renders each drawing as a PixiJS `Graphics` object inside the correct layer Container
- Subscribes to `useDrawingStore.drawings`
- Drawing types map to PixiJS drawing commands:
  - `freehand` → `graphics.moveTo/lineTo` through all points
  - `line` → `graphics.moveTo/lineTo` between two points
  - `rectangle` → `graphics.rect()`
  - `circle` → `graphics.circle()`
  - `polygon` → `graphics.poly()`
- Stroke and fill applied per drawing's stored properties
- Static drawings (not being edited) cached as render textures per layer

**What to build (DrawingTools):**
- A tool state machine that handles canvas events when a drawing tool is active
- When `activeTool` is a drawing tool, intercepts mouse events on the canvas
- Freehand: collect points on mousemove, simplify with RDP on mouseup, create via `drawingsApi.create()`
- Line/Rect/Circle: preview on mousemove, finalize on mouseup
- Polygon: click to add vertices, double-click to close
- Eraser: hit-test drawings under cursor, delete on click
- All tools optionally snap to grid intersections based on snap mode

**What to build (AoeTemplates):**
- Renders AoE template overlays using the AoE math from Task 19
- When an AoE tool is active, shows a preview that follows the cursor
- Highlights affected grid squares with semi-transparent colored fill
- Shows "15ft cone — affects 6 squares" label
- On click: can be "pinned" (creates a drawing on the active layer) or dismissed

- [ ] **Step 1: Implement DrawingRenderer** — Render drawings from store
- [ ] **Step 2: Write unit tests for DrawingTools logic** — Test freehand point collection, snap-to-grid for drawing endpoints, eraser hit-testing. Create `client/src/canvas/__tests__/DrawingTools.test.ts`.
- [ ] **Step 3: Implement DrawingTools state machine** — Freehand, line, rect, circle, polygon, eraser
- [ ] **Step 4: Implement AoeTemplates** — Cone, cube, sphere, line preview and affected squares
- [ ] **Step 5: Integrate all into CanvasView** — Wire up with tool store and drawing store
- [ ] **Step 6: Manual test** — Draw shapes, AoE templates, undo/redo
- [ ] **Step 7: Commit**

---

### Task 29: Measurement Overlay

**Files:**
- Create: `client/src/canvas/MeasurementOverlay.ts`

**What to build:**
- Renders measurement overlays as an ephemeral PixiJS layer (always on top)
- **Ruler:** When `activeTool === 'ruler'`, draw a line from click origin to cursor with distance label. Distance computed via `gridDistance()` using current map's diagonal mode and grid scale.
- **Waypoint:** When `activeTool === 'waypoint'`, click to add waypoints. Each segment shows its distance, running total at cursor. Right-click or Escape to finish.
- **AoE measurement:** Reuses AoeTemplates — when hovering, shows affected square count and area label
- Measurement text rendered as PixiJS `Text` objects positioned along the measurement line
- Ruler snaps to grid cell centers by default; Alt key disables snap

- [ ] **Step 1: Implement MeasurementOverlay** — Ruler, waypoint path, distance labels. **Important:** measurements are local-only (not broadcast via WebSocket) — render only on the measuring user's client. When SP-2 integrates, this is an explicit non-sync item.
- [ ] **Step 2: Integrate into CanvasView** — Wire to tool store
- [ ] **Step 3: Manual test** — Measure distances, verify diagonal modes produce correct values
- [ ] **Step 4: Commit**

---

### Task 30: Performance — Throttling, Lazy Loading, Texture Management

**Files:**
- Modify: `client/src/canvas/TokenInteraction.ts` (throttled drag updates)
- Modify: `client/src/canvas/DrawingTools.ts` (throttled freehand updates)
- Modify: `client/src/canvas/TokenRenderer.ts` (texture caching, lazy load)
- Modify: `client/src/canvas/LayerManager.ts` (lazy map image loading)
- Create: `client/src/canvas/TextureManager.ts` (shared texture cache, GPU limit detection)

**What to build:**
- **Throttled store updates:** During token drag and freehand drawing, throttle Zustand store writes to ~30Hz. PixiJS renders at 60fps from local position (interpolated). Use `requestAnimationFrame` for visual updates, `setTimeout(33ms)` for store commits.
- **Lazy map image loading:** Map images only decode and upload to GPU when their layer is visible AND overlaps viewport. Use `IntersectionObserver`-like logic based on Viewport bounds.
- **Shared texture cache:** Wrap PixiJS `Assets.load()` in a TextureManager that tracks reference counts. Evict textures when layers are hidden or maps switch.
- **GPU limit detection:** On init, check `gl.getParameter(gl.MAX_TEXTURE_SIZE)`. Warn DM if uploaded map image exceeds this.
- **High-contrast grid:** When grid renders, sample the map image average brightness under grid lines and auto-adjust grid color for contrast (or fall back to DM-configured color).

- [ ] **Step 1: Create TextureManager** — Shared texture cache with reference counting and GPU limit detection
- [ ] **Step 2: Add throttled drag/draw updates** — 30Hz store commits during continuous interactions
- [ ] **Step 3: Add lazy map image loading** — Only load visible, in-viewport images
- [ ] **Step 4: Add high-contrast grid logic** — Auto-adjust grid color based on map brightness
- [ ] **Step 5: Commit**

---

### Task 31: Chunk 4 Verification

- [ ] **Step 1: Run all frontend tests** — `cd client && npm run test -- --run`
- [ ] **Step 2: Run lint** — `cd client && npm run lint`
- [ ] **Step 3: Run build** — `cd client && npm run build`
- [ ] **Step 4: Manual smoke test** — Open the app, create a map, place tokens, draw shapes, measure distances

---

## Chunk 5: React UI Panels & Integration

Tasks 31–36 build the React UI components that control the canvas and connect everything into a working application.

### Task 31: Toolbar Component

**Files:**
- Create: `client/src/components/Toolbar.tsx`

**What to build:**
- Tool selection buttons organized by category: Select/Pan, Drawing tools, AoE templates, Measurement
- Each button sets `useToolStore.setTool()`
- Active tool highlighted visually
- Drawing settings panel: color picker, stroke width slider, fill toggle — when a drawing tool is active
- Keyboard shortcuts: `V` = select, `H` = pan, `B` = freehand, `L` = line, `R` = rectangle, `C` = circle, `M` = ruler
- Built with Radix UI primitives, follows existing inline style pattern with CSS custom properties

- [ ] **Step 1: Implement Toolbar** — Tool buttons, draw settings, keyboard shortcuts
- [ ] **Step 2: Add to Campaign page** — Position toolbar on left edge of canvas
- [ ] **Step 3: Commit**

---

### Task 32: Layer Panel Component

**Files:**
- Create: `client/src/components/LayerPanel.tsx`

**What to build:**
- DM-only panel showing the layer stack
- Each layer row shows: drag handle, name, visibility toggle (eye icon), lock toggle, opacity slider
- Drag to reorder (calls `mapsApi.reorderLayers()` and `useMapStore.reorderLayers()`)
- Click layer row to set active layer
- "Add Layer" button with type selector (map_image, token, drawing)
- Delete layer button (with confirmation)
- DM-only badge on dm_only layers
- Only shown when user's campaign role is `dm`

- [ ] **Step 1: Implement LayerPanel** — Layer list with drag reorder, visibility, lock, opacity
- [ ] **Step 2: Add to Campaign page sidebar** — Show below campaign info for DM users
- [ ] **Step 3: Commit**

---

### Task 33: Token Inspector Component

**Files:**
- Create: `client/src/components/TokenInspector.tsx`

**What to build:**
- Panel that shows when a token is selected
- Displays: token name (editable), position, size selector (1x1–4x4)
- Token bars editor: add/remove bars, edit label/current/max/color/visibility
- Status markers: toggleable grid of condition icons
- Asset image selector (opens AssetBrowser)
- Owner selector (dropdown of campaign members)
- Save changes via `tokensApi.update()`
- Delete button (DM only)

- [ ] **Step 1: Implement TokenInspector** — Name, bars, status, size, asset, owner
- [ ] **Step 2: Show when token selected** — Subscribe to `useTokenStore.selectedIds`
- [ ] **Step 3: Commit**

---

### Task 34: Map Settings Component

**Files:**
- Create: `client/src/components/MapSettings.tsx`

**What to build:**
- DM-only settings panel for the current map
- Grid settings: enabled toggle, cell size, color picker, opacity slider, line width
- Scale settings: grid scale value, unit selector (ft/m/units)
- Snap mode: off / center / corner radio buttons
- Diagonal mode: D&D standard / Euclidean / Manhattan radio buttons
- Map dimensions: width × height in squares
- Save changes via `mapsApi.update()`

- [ ] **Step 1: Implement MapSettings** — Grid, scale, snap, diagonal, dimensions
- [ ] **Step 2: Add to Campaign page** — Accessible from toolbar or sidebar gear icon
- [ ] **Step 3: Commit**

---

### Task 35: Token Context Menu

**Files:**
- Create: `client/src/components/TokenContextMenu.tsx`

**What to build:**
- Right-click context menu using Radix UI `DropdownMenu`
- Options: Edit (opens inspector), Duplicate, Delete, Move to Layer (submenu with layer list), Set Size (submenu 1x1–4x4)
- Duplicate: calls `tokensApi.create()` with same properties at an offset position
- Delete: calls `tokensApi.delete()` (DM only)
- Move to Layer: calls `tokensApi.update()` with new `layer_id`
- Positioned at cursor via Radix portal

- [ ] **Step 1: Implement TokenContextMenu** — Radix DropdownMenu with all options
- [ ] **Step 2: Wire to TokenInteraction right-click** — Show menu at cursor position
- [ ] **Step 3: Commit**

---

### Task 36: Campaign Page Integration

**Files:**
- Modify: `client/src/pages/Campaign.tsx`
- Modify: `client/src/canvas/CanvasView.tsx`

**What to build:**
- Campaign page loads map list and lets DM create/select maps
- On map select: fetch map data via `mapsApi.get()`, populate all stores
- CanvasView now initializes all six subsystems (Viewport, Grid, LayerManager, TokenRenderer, DrawingRenderer, MeasurementOverlay)
- Layout: Toolbar on left, Canvas in center, Sidebar on right (Layer Panel + Token Inspector + Map Settings)
- Player view: no Layer Panel, no Map Settings, no DM-only tools in toolbar
- Map image placement: DM can open AssetBrowser, select an image, place it on the active map-image layer

- [ ] **Step 1: Update Campaign page** — Map list, map selector, panel layout
- [ ] **Step 2: Update CanvasView** — Initialize all subsystems, connect to stores
- [ ] **Step 3: Wire map image placement** — AssetBrowser → place on layer flow
- [ ] **Step 4: Manual end-to-end test** — Full flow: create map, upload image, place tokens, draw, measure
- [ ] **Step 5: Commit**

---

### Task 37: Chunk 5 Verification

- [ ] **Step 1: Run all frontend tests** — `cd client && npm run test -- --run`
- [ ] **Step 2: Run lint** — `cd client && npm run lint`
- [ ] **Step 3: Run build** — `cd client && npm run build`
- [ ] **Step 4: Full pre-push verification** — Run all checks from CLAUDE.md Pre-Push Verification section

---

## Chunk 6: Accessibility & E2E Tests

Tasks 38–40 add accessibility features and Playwright end-to-end tests.

### Task 38: Canvas Accessibility

**Files:**
- Create: `client/src/canvas/AccessibilityDOM.ts`
- Modify: `client/src/canvas/CanvasView.tsx`

**What to build:**
- Off-screen DOM element that mirrors canvas state for screen readers
- Token descriptions: "Goblin 1, HP 15/20, poisoned, at position 5,3"
- ARIA live regions for state changes (token moved, tool activated, measurement result)
- Canvas focus indicator: visible ring when canvas has keyboard focus
- Keyboard navigation: Tab to focus canvas, arrow keys to move selected token, Escape to deselect

- [ ] **Step 1: Implement AccessibilityDOM** — Off-screen DOM mirror with token descriptions, ARIA live regions for state changes
- [ ] **Step 2: Add screen reader announcements** — Token selection, measurement results ("Distance: 30 feet"), drawing tool activation, AoE affected squares count
- [ ] **Step 3: Add keyboard shortcuts** — Arrow keys move selected token, Tab to focus canvas, Escape to deselect, tool shortcuts (V/H/B/L/R/C/M)
- [ ] **Step 4: Commit**

---

### Task 39: Playwright E2E Tests

**Files:**
- Create: `client/e2e/maps.spec.ts`
- Create: `client/e2e/tokens.spec.ts`
- Create: `client/e2e/drawing.spec.ts`
- Create: `client/e2e/measurement.spec.ts`
- Create: `client/e2e/layers.spec.ts`
- Create: `client/e2e/permissions.spec.ts`

**Test coverage per spec requirements:**
- **Map creation:** DM creates map → configures grid → verifies canvas renders
- **Map image:** Upload via asset library → place on map → verify display
- **Token placement:** Create token → place → verify position
- **Token movement:** DM drags token → verify; player moves own → verify; player cannot move other's → verify
- **Token bars/status:** Set HP bar → verify render; toggle status → verify icon
- **Layer management:** Create layer → reorder → toggle visibility → verify canvas
- **Drawing tools:** Freehand draw → verify persist; rectangle → verify
- **AoE templates:** Place cone → verify highlighted squares
- **Measurement:** Ruler → verify distance; waypoint → verify total
- **Grid modes:** Toggle grid enabled/disabled → verify overlay
- **Permissions:** Player cannot access layer panel, map settings, DM tools

**Each test uses the existing Playwright test helpers** (register, login, create campaign) and adds SP-1 specific helpers (create map, place token).

- [ ] **Step 1: Create E2E test helpers** — `createMap()`, `placeToken()`, `selectTool()`
- [ ] **Step 2: Write map & layer tests** — Creation, grid toggle, layer management
- [ ] **Step 3: Write token tests** — Placement, movement, bars, permissions
- [ ] **Step 4: Write drawing & measurement tests** — Draw shapes, measure distances
- [ ] **Step 5: Write permission tests** — Player vs DM access controls
- [ ] **Step 6: Run E2E suite** — `cd client && npm run test:e2e`
- [ ] **Step 7: Commit**

---

### Task 40: Visual Regression Tests

**Files:**
- Create: `client/e2e/visual-regression.spec.ts`

**Test coverage:**
- Grid at 1x zoom, 2x zoom, 0.5x zoom
- Token with bars and status markers
- AoE template overlay on grid
- Multiple stacked map image layers

**Uses Playwright `toHaveScreenshot()`** to capture and compare canvas screenshots. First run establishes baselines.

- [ ] **Step 1: Write visual regression tests** — Grid, tokens, AoE, layers
- [ ] **Step 2: Generate baseline screenshots** — `npm run test:e2e -- --update-snapshots`
- [ ] **Step 3: Commit screenshots and tests**

---

### Task 41: Performance Benchmarks

**Files:**
- Create: `client/src/canvas/__tests__/performance.test.ts`

**What to build:**
- Vitest benchmarks that validate the spec's scale targets
- **100 token test:** Create 100 token objects in the store, measure render time — should complete initial render < 100ms
- **Grid render test:** Render a 50x50 grid, measure draw time — should be < 16ms (one frame)
- **Freehand simplification benchmark:** Simplify a 500-point stroke, measure time — should be < 5ms
- These are lightweight unit-level perf tests, not full visual benchmarks (those come from Playwright visual regression). They catch regressions in pure computation.

- [ ] **Step 1: Write performance benchmarks** — Token count, grid render, simplification
- [ ] **Step 2: Run and validate** — `cd client && npm run test -- --run src/canvas/__tests__/performance.test.ts`
- [ ] **Step 3: Commit**

---

## Chunk 7: Final Verification & Cleanup

### Task 41: Full Pre-Push Verification

Run every check from the CLAUDE.md Pre-Push Verification section:

- [ ] **Step 1: Backend formatting** — `cargo fmt --all -- --check`
- [ ] **Step 2: Backend lint** — `SQLX_OFFLINE=true cargo clippy --workspace -- -D warnings`
- [ ] **Step 3: Backend tests** — `SQLX_OFFLINE=true cargo test --workspace`
- [ ] **Step 4: Frontend lint** — `cd client && npm run lint`
- [ ] **Step 5: Frontend build** — `cd client && npm run build`
- [ ] **Step 6: Frontend unit tests** — `cd client && npm run test -- --run`
- [ ] **Step 7: Frontend E2E tests** — `cd client && npm run test:e2e`
- [ ] **Step 8: Fix any failures** — Address any issues found
- [ ] **Step 9: Final commit** — Clean up, ensure all changes committed

---

## Summary

| Chunk | Tasks | Description |
|-------|-------|-------------|
| 1 | 1–10 | Backend domain types, migrations, DB repositories |
| 2 | 11–16 | REST API routes with integration tests |
| 3 | 17–23 | Frontend API clients, grid math, Zustand stores |
| 4 | 24–31 | PixiJS canvas rendering + performance (viewport, grid, layers, tokens, drawing, measurement, throttling, texture management) |
| 5 | 32–38 | React UI panels (toolbar, layer panel, token inspector, map settings, context menu, integration) |
| 6 | 39–42 | Accessibility, Playwright E2E tests, visual regression, performance benchmarks |
| 7 | 43 | Final verification and cleanup |

**Total tasks:** 43
**Build order:** Chunks 1→2→3→4→5→6→7 (sequential — each chunk depends on the previous)
**Parallelism within chunks:** Tasks within each chunk are mostly sequential, but within Chunk 4, Tasks 25–29 can be parallelized after Task 24 (Viewport) is done.
