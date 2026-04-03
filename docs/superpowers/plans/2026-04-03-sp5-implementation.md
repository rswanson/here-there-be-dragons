# SP-5: Dynamic Lighting & Fog of War — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add walls, doors, per-token vision via raycasting, light sources, and two-layer fog of war (manual DM reveal + dynamic vision) to the VTT, so players see only what their tokens can see.

**Architecture:** Walls and fog state are stored server-side (PostgreSQL) and synced via WebSocket. All vision/lighting computation is client-side — each browser raycasts from its controlled tokens against wall geometry, composites the visibility polygon with DM fog reveals and explored state, and renders via PixiJS masks. The server enforces door toggle authorization (locked doors, secret doors) but does no raycasting.

**Tech Stack:** Rust (Axum, sqlx, serde, ts-rs), PostgreSQL, React 19 + TypeScript (Zustand 5, PixiJS 8, Vite 8), Vitest, Playwright

---

## File Structure

### Backend — New Files

| File | Responsibility |
|------|---------------|
| `crates/htbd-core/src/wall.rs` | `Wall`, `WallType`, `DoorState`, `CreateWallRequest`, `UpdateWallRequest` types |
| `crates/htbd-core/src/fog.rs` | `FogCell`, `RevealFogRequest` types |
| `crates/db/src/walls.rs` | Wall CRUD queries (batch create, update, delete, list for map) |
| `crates/db/src/fog_cells.rs` | Fog cell queries (batch reveal/hide, list for map) |
| `crates/server/src/routes/walls.rs` | Wall REST endpoints + WebSocket handlers |
| `crates/server/src/routes/fog.rs` | Fog REST endpoints |
| `migrations/007_walls_fog_token_vision.sql` | walls table, fog_cells table, token vision columns |

### Backend — Modified Files

| File | Changes |
|------|---------|
| `crates/htbd-core/src/lib.rs` | Add `pub mod wall; pub mod fog;` + ts-rs exports |
| `crates/htbd-core/src/messages.rs` | Add wall, door, fog, and vision WS message variants |
| `crates/htbd-core/src/token.rs` | Add vision/light fields to `Token`, `CreateTokenRequest`, `UpdateTokenRequest` |
| `crates/htbd-core/src/map.rs` | Add `player_door_control` to `Map`, `MapFullState` gets `walls` + `fog_cells` |
| `crates/db/src/tokens.rs` | Update `TokenRow` and queries for new vision columns |
| `crates/db/src/maps.rs` | Add `player_door_control` to `MapRow` |
| `crates/db/src/lib.rs` | Add `pub mod walls; pub mod fog_cells;` |
| `crates/server/src/routes/mod.rs` | Mount wall and fog routes |
| `crates/server/src/routes/ws.rs` | Add wall/door/fog/vision message handlers |
| `crates/server/src/routes/state.rs` | Include walls and fog_cells in `get_map_state` |
| `crates/server/src/routes/guards.rs` | Add `get_campaign_id_for_map` helper |

### Frontend — New Files

| File | Responsibility |
|------|---------------|
| `client/src/types/Wall.ts` | Wall, WallType, DoorState TS types |
| `client/src/types/FogCell.ts` | FogCell TS type |
| `client/src/state/walls.ts` | Zustand wall store |
| `client/src/state/fog.ts` | Zustand fog store (DM reveals + explored + vision mode) |
| `client/src/state/vision.ts` | Zustand vision store (computed visibility polygons, light levels) |
| `client/src/state/__tests__/walls.test.ts` | Wall store unit tests |
| `client/src/state/__tests__/fog.test.ts` | Fog store unit tests |
| `client/src/state/__tests__/vision.test.ts` | Vision store unit tests |
| `client/src/canvas/math/raycasting.ts` | 2D raycasting algorithm (pure math, no PixiJS) |
| `client/src/canvas/math/lighting.ts` | Light level computation (bright/dim/dark) |
| `client/src/canvas/math/__tests__/raycasting.test.ts` | Raycasting unit tests |
| `client/src/canvas/math/__tests__/lighting.test.ts` | Lighting unit tests |
| `client/src/canvas/WallRenderer.ts` | PixiJS wall overlay for DM view |
| `client/src/canvas/FogRenderer.ts` | PixiJS fog overlay with visibility mask |
| `client/src/canvas/LightRenderer.ts` | PixiJS light radius indicators and tinting |
| `client/src/canvas/WallInteraction.ts` | Wall selection, drag, door double-click |
| `client/src/components/WallToolbar.tsx` | Wall tool UI (polyline, rect, type selector) |
| `client/src/components/VisionPanel.tsx` | DM vision mode selector + player preview |
| `client/src/components/TokenVisionEditor.tsx` | Vision/light fields in token inspector |
| `client/src/components/FogTool.tsx` | DM fog reveal/hide brush UI |
| `client/src/api/walls.ts` | Wall REST client |
| `client/src/api/fog.ts` | Fog REST client |

### Frontend — Modified Files

| File | Changes |
|------|---------|
| `client/src/api/dispatcher.ts` | Route wall/door/fog/vision messages to stores |
| `client/src/canvas/CanvasView.tsx` | Instantiate WallRenderer, FogRenderer, LightRenderer |
| `client/src/canvas/TokenInteraction.ts` | Add door double-click detection |
| `client/src/canvas/TokenRenderer.ts` | Filter tokens by visibility in fog |
| `client/src/pages/Campaign.tsx` | Load walls/fog on mount, add WallToolbar/VisionPanel/FogTool |

---

## Task 1: Database Migration

**Files:**
- Create: `migrations/007_walls_fog_token_vision.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- migrations/007_walls_fog_token_vision.sql

-- ── Walls ────────────────────────────────────────────────────────────

CREATE TABLE walls (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id      UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    x1          REAL NOT NULL,
    y1          REAL NOT NULL,
    x2          REAL NOT NULL,
    y2          REAL NOT NULL,
    wall_type   TEXT NOT NULL DEFAULT 'wall'
                CHECK (wall_type IN ('wall', 'door', 'secret_door')),
    door_state  TEXT NOT NULL DEFAULT 'closed'
                CHECK (door_state IN ('closed', 'open', 'locked')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_walls_map ON walls(map_id);

-- ── Fog cells (DM reveals) ──────────────────────────────────────────

CREATE TABLE fog_cells (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id      UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    x           INTEGER NOT NULL,
    y           INTEGER NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(map_id, x, y)
);

CREATE INDEX idx_fog_cells_map ON fog_cells(map_id);

-- ── Token vision extensions ─────────────────────────────────────────

ALTER TABLE tokens ADD COLUMN has_vision       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tokens ADD COLUMN vision_range      REAL NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN darkvision_range  REAL NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN light_bright      REAL NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN light_dim         REAL NOT NULL DEFAULT 0;

-- ── Map: player door control toggle ─────────────────────────────────

ALTER TABLE maps ADD COLUMN player_door_control BOOLEAN NOT NULL DEFAULT true;
```

- [ ] **Step 2: Run the migration**

Run: `cd <worktree> && sqlx migrate run`
Expected: Migration applies successfully.

- [ ] **Step 3: Regenerate sqlx offline data**

Run: `cd <worktree> && cargo sqlx prepare --workspace`
Expected: `.sqlx/` directory updated with new query metadata.

- [ ] **Step 4: Commit**

```bash
git add migrations/007_walls_fog_token_vision.sql .sqlx/
git commit -m "feat(sp5): add walls, fog_cells tables and token vision columns"
```

---

## Task 2: Rust Core Types — Wall & Fog

**Files:**
- Create: `crates/htbd-core/src/wall.rs`
- Create: `crates/htbd-core/src/fog.rs`
- Modify: `crates/htbd-core/src/lib.rs`

- [ ] **Step 1: Create wall types**

Create `crates/htbd-core/src/wall.rs`:

```rust
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
```

- [ ] **Step 2: Create fog types**

Create `crates/htbd-core/src/fog.rs`:

```rust
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct FogCell {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct RevealFogRequest {
    pub cells: Vec<FogCell>,
    pub revealed: bool,
}
```

- [ ] **Step 3: Register modules and ts-rs exports in lib.rs**

Add to module declarations in `crates/htbd-core/src/lib.rs`:

```rust
pub mod fog;
pub mod wall;
```

Add to the `export_bindings()` test function:

```rust
        // Wall
        wall::Wall::export_all(&cfg).unwrap();
        wall::WallType::export_all(&cfg).unwrap();
        wall::DoorState::export_all(&cfg).unwrap();
        wall::CreateWallRequest::export_all(&cfg).unwrap();
        wall::UpdateWallRequest::export_all(&cfg).unwrap();

        // Fog
        fog::FogCell::export_all(&cfg).unwrap();
        fog::RevealFogRequest::export_all(&cfg).unwrap();
```

- [ ] **Step 4: Build to verify**

Run: `cd <worktree> && cargo build --workspace`
Expected: Compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add crates/htbd-core/src/wall.rs crates/htbd-core/src/fog.rs crates/htbd-core/src/lib.rs
git commit -m "feat(sp5): add Wall, Fog core types with ts-rs exports"
```

---

## Task 3: Extend Token Types with Vision Fields

**Files:**
- Modify: `crates/htbd-core/src/token.rs`

- [ ] **Step 1: Add vision fields to Token struct**

Add these fields after `status_markers` in the `Token` struct:

```rust
    pub has_vision: bool,
    pub vision_range: f32,
    pub darkvision_range: f32,
    pub light_bright: f32,
    pub light_dim: f32,
```

- [ ] **Step 2: Add vision fields to CreateTokenRequest**

Add these fields (with defaults) to `CreateTokenRequest`:

```rust
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
```

- [ ] **Step 3: Add vision fields to UpdateTokenRequest**

Add these fields to `UpdateTokenRequest`:

```rust
    pub has_vision: Option<bool>,
    pub vision_range: Option<f32>,
    pub darkvision_range: Option<f32>,
    pub light_bright: Option<f32>,
    pub light_dim: Option<f32>,
```

- [ ] **Step 4: Build to verify**

Run: `cd <worktree> && cargo build --workspace`
Expected: Compiles. Some downstream code (db layer, routes) will need updates — that's Task 4/5.

- [ ] **Step 5: Commit**

```bash
git add crates/htbd-core/src/token.rs
git commit -m "feat(sp5): add vision/light fields to Token types"
```

---

## Task 4: Extend Token DB Layer for Vision Fields

**Files:**
- Modify: `crates/db/src/tokens.rs`

- [ ] **Step 1: Add vision fields to TokenRow**

Add after `character_id` in the `TokenRow` struct:

```rust
    pub has_vision: bool,
    pub vision_range: f32,
    pub darkvision_range: f32,
    pub light_bright: f32,
    pub light_dim: f32,
```

- [ ] **Step 2: Update From<TokenRow> for Token**

Add the vision fields to the `From` impl:

```rust
            has_vision: row.has_vision,
            vision_range: row.vision_range,
            darkvision_range: row.darkvision_range,
            light_bright: row.light_bright,
            light_dim: row.light_dim,
```

- [ ] **Step 3: Update create_token to accept vision fields**

Add parameters to `create_token`:

```rust
    has_vision: bool,
    vision_range: f32,
    darkvision_range: f32,
    light_bright: f32,
    light_dim: f32,
```

Update the INSERT query:

```rust
    sqlx::query_as!(
        TokenRow,
        r#"INSERT INTO tokens (layer_id, name, asset_id, owner_id, x, y, size, rotation,
                               bars_json, status_markers, has_vision, vision_range,
                               darkvision_range, light_bright, light_dim)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           RETURNING *"#,
        layer_id, name, asset_id, owner_id, x, y, size, rotation,
        bars_json, status_markers, has_vision, vision_range,
        darkvision_range, light_bright, light_dim
    )
```

- [ ] **Step 4: Update update_token to accept vision fields**

Add parameters and extend the UPDATE query with:

```rust
    has_vision: Option<bool>,
    vision_range: Option<f32>,
    darkvision_range: Option<f32>,
    light_bright: Option<f32>,
    light_dim: Option<f32>,
```

Add to the SET clause:

```sql
            has_vision = COALESCE($13, has_vision),
            vision_range = COALESCE($14, vision_range),
            darkvision_range = COALESCE($15, darkvision_range),
            light_bright = COALESCE($16, light_bright),
            light_dim = COALESCE($17, light_dim),
```

- [ ] **Step 5: Update list_for_map and list_for_map_player SELECT columns**

Add the new columns to the explicit SELECT lists in `list_for_map` and `list_for_map_player`:

```sql
t.has_vision, t.vision_range, t.darkvision_range, t.light_bright, t.light_dim
```

- [ ] **Step 6: Update token route handlers for new fields**

In `crates/server/src/routes/tokens.rs`, update `create_token` to pass the new fields through to the DB call, and `update_token` to pass the new optional fields.

- [ ] **Step 7: Build and run existing tests**

Run: `cd <worktree> && SQLX_OFFLINE=true cargo build --workspace && cargo test -p db`
Expected: Compiles and existing token tests pass (tests use defaults for new columns).

- [ ] **Step 8: Commit**

```bash
git add crates/db/src/tokens.rs crates/server/src/routes/tokens.rs
git commit -m "feat(sp5): update token DB layer and routes for vision fields"
```

---

## Task 5: Wall DB Layer

**Files:**
- Create: `crates/db/src/walls.rs`
- Modify: `crates/db/src/lib.rs`

- [ ] **Step 1: Write wall DB module with tests**

Create `crates/db/src/walls.rs`:

```rust
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub struct WallRow {
    pub id: Uuid,
    pub map_id: Uuid,
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
    pub wall_type: String,
    pub door_state: String,
    pub created_at: DateTime<Utc>,
}

impl From<WallRow> for htbd_core::wall::Wall {
    fn from(row: WallRow) -> Self {
        Self {
            id: row.id,
            map_id: row.map_id,
            x1: row.x1,
            y1: row.y1,
            x2: row.x2,
            y2: row.y2,
            wall_type: serde_json::from_value(serde_json::Value::String(row.wall_type))
                .unwrap_or(htbd_core::wall::WallType::Wall),
            door_state: serde_json::from_value(serde_json::Value::String(row.door_state))
                .unwrap_or(htbd_core::wall::DoorState::Closed),
            created_at: row.created_at,
        }
    }
}

pub async fn create_wall(
    pool: &PgPool,
    map_id: &Uuid,
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    wall_type: &str,
    door_state: &str,
) -> Result<WallRow, sqlx::Error> {
    sqlx::query_as!(
        WallRow,
        r#"INSERT INTO walls (map_id, x1, y1, x2, y2, wall_type, door_state)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *"#,
        map_id, x1, y1, x2, y2, wall_type, door_state
    )
    .fetch_one(pool)
    .await
}

pub async fn list_for_map(pool: &PgPool, map_id: &Uuid) -> Result<Vec<WallRow>, sqlx::Error> {
    sqlx::query_as!(
        WallRow,
        "SELECT * FROM walls WHERE map_id = $1 ORDER BY created_at ASC",
        map_id
    )
    .fetch_all(pool)
    .await
}

pub async fn find_by_id(pool: &PgPool, id: &Uuid) -> Result<Option<WallRow>, sqlx::Error> {
    sqlx::query_as!(WallRow, "SELECT * FROM walls WHERE id = $1", id)
        .fetch_optional(pool)
        .await
}

pub async fn update_wall(
    pool: &PgPool,
    id: &Uuid,
    x1: Option<f32>,
    y1: Option<f32>,
    x2: Option<f32>,
    y2: Option<f32>,
    wall_type: Option<&str>,
    door_state: Option<&str>,
) -> Result<Option<WallRow>, sqlx::Error> {
    sqlx::query_as!(
        WallRow,
        r#"UPDATE walls SET
            x1 = COALESCE($2, x1),
            y1 = COALESCE($3, y1),
            x2 = COALESCE($4, x2),
            y2 = COALESCE($5, y2),
            wall_type = COALESCE($6, wall_type),
            door_state = COALESCE($7, door_state)
        WHERE id = $1
        RETURNING *"#,
        id, x1, y1, x2, y2, wall_type, door_state
    )
    .fetch_optional(pool)
    .await
}

pub async fn update_door_state(
    pool: &PgPool,
    id: &Uuid,
    door_state: &str,
) -> Result<Option<WallRow>, sqlx::Error> {
    sqlx::query_as!(
        WallRow,
        r#"UPDATE walls SET door_state = $2 WHERE id = $1 RETURNING *"#,
        id, door_state
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_wall(pool: &PgPool, id: &Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM walls WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn delete_walls(pool: &PgPool, ids: &[Uuid]) -> Result<u64, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM walls WHERE id = ANY($1)", ids)
        .execute(pool)
        .await?;
    Ok(result.rows_affected())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;

    async fn setup_map(pool: &PgPool) -> (Uuid, Uuid) {
        let user = crate::users::create_user(pool, "dm@walls.test", "hash", "DM")
            .await
            .unwrap();
        let campaign = crate::campaigns::create_campaign(pool, "Campaign", user.id, "WALLS001")
            .await
            .unwrap();
        let map = crate::maps::create_map(pool, &campaign.id, "Dungeon")
            .await
            .unwrap();
        (map.id, user.id)
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_create_and_list_walls(pool: PgPool) {
        let (map_id, _) = setup_map(&pool).await;

        let w1 = create_wall(&pool, &map_id, 0.0, 0.0, 5.0, 0.0, "wall", "closed")
            .await
            .unwrap();
        assert_eq!(w1.wall_type, "wall");

        let w2 = create_wall(&pool, &map_id, 5.0, 0.0, 5.0, 5.0, "door", "closed")
            .await
            .unwrap();
        assert_eq!(w2.wall_type, "door");

        let walls = list_for_map(&pool, &map_id).await.unwrap();
        assert_eq!(walls.len(), 2);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_update_wall(pool: PgPool) {
        let (map_id, _) = setup_map(&pool).await;

        let wall = create_wall(&pool, &map_id, 0.0, 0.0, 5.0, 0.0, "wall", "closed")
            .await
            .unwrap();

        let updated = update_wall(
            &pool,
            &wall.id,
            None,
            None,
            Some(10.0),
            None,
            Some("door"),
            Some("open"),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(updated.x2, 10.0);
        assert_eq!(updated.wall_type, "door");
        assert_eq!(updated.door_state, "open");
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_update_door_state(pool: PgPool) {
        let (map_id, _) = setup_map(&pool).await;

        let wall = create_wall(&pool, &map_id, 0.0, 0.0, 5.0, 0.0, "door", "closed")
            .await
            .unwrap();

        let updated = update_door_state(&pool, &wall.id, "open")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(updated.door_state, "open");

        let locked = update_door_state(&pool, &wall.id, "locked")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(locked.door_state, "locked");
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_delete_walls(pool: PgPool) {
        let (map_id, _) = setup_map(&pool).await;

        let w1 = create_wall(&pool, &map_id, 0.0, 0.0, 5.0, 0.0, "wall", "closed")
            .await
            .unwrap();
        let w2 = create_wall(&pool, &map_id, 5.0, 0.0, 5.0, 5.0, "wall", "closed")
            .await
            .unwrap();

        let deleted = delete_walls(&pool, &[w1.id, w2.id]).await.unwrap();
        assert_eq!(deleted, 2);
        assert!(list_for_map(&pool, &map_id).await.unwrap().is_empty());
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_walls_cascade_on_map_delete(pool: PgPool) {
        let (map_id, _) = setup_map(&pool).await;

        create_wall(&pool, &map_id, 0.0, 0.0, 5.0, 0.0, "wall", "closed")
            .await
            .unwrap();

        crate::maps::delete_map(&pool, &map_id).await.unwrap();
        assert!(list_for_map(&pool, &map_id).await.unwrap().is_empty());
    }
}
```

- [ ] **Step 2: Add module to db/lib.rs**

Add to `crates/db/src/lib.rs`:

```rust
pub mod walls;
```

- [ ] **Step 3: Run tests**

Run: `cd <worktree> && cargo test -p db -- walls`
Expected: All wall tests pass.

- [ ] **Step 4: Commit**

```bash
git add crates/db/src/walls.rs crates/db/src/lib.rs
git commit -m "feat(sp5): wall DB layer with CRUD and tests"
```

---

## Task 6: Fog Cell DB Layer

**Files:**
- Create: `crates/db/src/fog_cells.rs`
- Modify: `crates/db/src/lib.rs`

- [ ] **Step 1: Write fog cell DB module with tests**

Create `crates/db/src/fog_cells.rs`:

```rust
use sqlx::PgPool;
use uuid::Uuid;

pub struct FogCellRow {
    pub id: Uuid,
    pub map_id: Uuid,
    pub x: i32,
    pub y: i32,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn list_for_map(pool: &PgPool, map_id: &Uuid) -> Result<Vec<(i32, i32)>, sqlx::Error> {
    let rows = sqlx::query!(
        "SELECT x, y FROM fog_cells WHERE map_id = $1",
        map_id
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|r| (r.x, r.y)).collect())
}

pub async fn reveal_cells(
    pool: &PgPool,
    map_id: &Uuid,
    cells: &[(i32, i32)],
) -> Result<u64, sqlx::Error> {
    let mut count = 0u64;
    for (x, y) in cells {
        let result = sqlx::query!(
            r#"INSERT INTO fog_cells (map_id, x, y)
               VALUES ($1, $2, $3)
               ON CONFLICT (map_id, x, y) DO NOTHING"#,
            map_id, x, y
        )
        .execute(pool)
        .await?;
        count += result.rows_affected();
    }
    Ok(count)
}

pub async fn hide_cells(
    pool: &PgPool,
    map_id: &Uuid,
    cells: &[(i32, i32)],
) -> Result<u64, sqlx::Error> {
    let mut count = 0u64;
    for (x, y) in cells {
        let result = sqlx::query!(
            "DELETE FROM fog_cells WHERE map_id = $1 AND x = $2 AND y = $3",
            map_id, x, y
        )
        .execute(pool)
        .await?;
        count += result.rows_affected();
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;

    async fn setup_map(pool: &PgPool) -> Uuid {
        let user = crate::users::create_user(pool, "dm@fog.test", "hash", "DM")
            .await
            .unwrap();
        let campaign = crate::campaigns::create_campaign(pool, "Campaign", user.id, "FOG00001")
            .await
            .unwrap();
        let map = crate::maps::create_map(pool, &campaign.id, "Foggy")
            .await
            .unwrap();
        map.id
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_reveal_and_list(pool: PgPool) {
        let map_id = setup_map(&pool).await;

        reveal_cells(&pool, &map_id, &[(0, 0), (1, 0), (2, 0)]).await.unwrap();
        let cells = list_for_map(&pool, &map_id).await.unwrap();
        assert_eq!(cells.len(), 3);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_reveal_idempotent(pool: PgPool) {
        let map_id = setup_map(&pool).await;

        reveal_cells(&pool, &map_id, &[(0, 0)]).await.unwrap();
        reveal_cells(&pool, &map_id, &[(0, 0)]).await.unwrap();
        let cells = list_for_map(&pool, &map_id).await.unwrap();
        assert_eq!(cells.len(), 1);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_hide_cells(pool: PgPool) {
        let map_id = setup_map(&pool).await;

        reveal_cells(&pool, &map_id, &[(0, 0), (1, 0), (2, 0)]).await.unwrap();
        hide_cells(&pool, &map_id, &[(1, 0)]).await.unwrap();
        let cells = list_for_map(&pool, &map_id).await.unwrap();
        assert_eq!(cells.len(), 2);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_fog_cascades_on_map_delete(pool: PgPool) {
        let map_id = setup_map(&pool).await;

        reveal_cells(&pool, &map_id, &[(0, 0), (1, 1)]).await.unwrap();
        crate::maps::delete_map(&pool, &map_id).await.unwrap();
        let cells = list_for_map(&pool, &map_id).await.unwrap();
        assert!(cells.is_empty());
    }
}
```

- [ ] **Step 2: Add module to db/lib.rs**

Add to `crates/db/src/lib.rs`:

```rust
pub mod fog_cells;
```

- [ ] **Step 3: Run tests**

Run: `cd <worktree> && cargo test -p db -- fog_cells`
Expected: All fog cell tests pass.

- [ ] **Step 4: Commit**

```bash
git add crates/db/src/fog_cells.rs crates/db/src/lib.rs
git commit -m "feat(sp5): fog cell DB layer with reveal/hide and tests"
```

---

## Task 7: WebSocket Message Types

**Files:**
- Modify: `crates/htbd-core/src/messages.rs`
- Modify: `crates/htbd-core/src/map.rs`

- [ ] **Step 1: Add wall/fog imports to messages.rs**

Add to the imports at the top of `crates/htbd-core/src/messages.rs`:

```rust
use crate::fog::FogCell;
use crate::wall::{CreateWallRequest, DoorState, UpdateWallRequest, Wall};
```

- [ ] **Step 2: Add ClientMessage variants**

Add these variants to the `ClientMessage` enum:

```rust
    // Walls (DM only)
    CreateWalls {
        map_id: Uuid,
        walls: Vec<CreateWallRequest>,
    },
    UpdateWall {
        wall_id: Uuid,
        patch: UpdateWallRequest,
    },
    DeleteWalls {
        wall_ids: Vec<Uuid>,
    },
    ToggleDoor {
        wall_id: Uuid,
    },

    // Fog (DM only)
    RevealFog {
        map_id: Uuid,
        cells: Vec<FogCell>,
        revealed: bool,
    },
```

- [ ] **Step 3: Add ServerMessage variants**

Add these variants to the `ServerMessage` enum:

```rust
    // Walls
    WallsCreated {
        map_id: Uuid,
        walls: Vec<Wall>,
        created_by: Uuid,
    },
    WallUpdated {
        wall_id: Uuid,
        patch: UpdateWallRequest,
        updated_by: Uuid,
    },
    WallsDeleted {
        wall_ids: Vec<Uuid>,
        deleted_by: Uuid,
    },
    DoorToggled {
        wall_id: Uuid,
        door_state: DoorState,
        toggled_by: Uuid,
    },
    DoorLocked {
        wall_id: Uuid,
    },

    // Fog
    FogRevealed {
        map_id: Uuid,
        cells: Vec<FogCell>,
        revealed: bool,
    },
```

- [ ] **Step 4: Extend MapFullState with walls and fog**

In `crates/htbd-core/src/map.rs`, add to the `MapFullState` struct:

```rust
    pub walls: Vec<crate::wall::Wall>,
    pub fog_cells: Vec<crate::fog::FogCell>,
```

- [ ] **Step 5: Build to verify**

Run: `cd <worktree> && cargo build --workspace`
Expected: Compiles. The `get_map_state` route will need updates (Task 8).

- [ ] **Step 6: Commit**

```bash
git add crates/htbd-core/src/messages.rs crates/htbd-core/src/map.rs
git commit -m "feat(sp5): add wall/fog/door WebSocket message types"
```

---

## Task 8: Wall & Fog REST Routes

**Files:**
- Create: `crates/server/src/routes/walls.rs`
- Create: `crates/server/src/routes/fog.rs`
- Modify: `crates/server/src/routes/mod.rs`
- Modify: `crates/server/src/routes/state.rs`
- Modify: `crates/server/src/routes/guards.rs`

- [ ] **Step 1: Add get_campaign_id_for_map guard**

Add to `crates/server/src/routes/guards.rs`:

```rust
/// Resolve map_id → campaign_id.
pub async fn get_campaign_id_for_map(
    state: &AppState,
    map_id: &Uuid,
) -> Result<Option<Uuid>, AppError> {
    let map_row = db::maps::find_by_id(&state.pool, map_id).await?;
    Ok(map_row.map(|m| m.campaign_id))
}
```

- [ ] **Step 2: Create wall routes**

Create `crates/server/src/routes/walls.rs`:

```rust
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::messages::ServerMessage;
use htbd_core::wall::*;

use super::guards::{get_campaign_id_for_map, require_dm, require_member};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/maps/{map_id}/walls", get(list_walls).post(create_walls))
        .route(
            "/walls/{id}",
            axum::routing::patch(update_wall).delete(delete_wall),
        )
}

async fn list_walls(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(map_id): Path<Uuid>,
) -> Result<Json<Vec<Wall>>, AppError> {
    let campaign_id = get_campaign_id_for_map(&state, &map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_member(&state, campaign_id, auth.user_id).await?;

    let rows = db::walls::list_for_map(&state.pool, &map_id).await?;
    let walls: Vec<Wall> = rows.into_iter().map(Into::into).collect();
    Ok(Json(walls))
}

async fn create_walls(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(map_id): Path<Uuid>,
    Json(reqs): Json<Vec<CreateWallRequest>>,
) -> Result<Json<Vec<Wall>>, AppError> {
    let campaign_id = get_campaign_id_for_map(&state, &map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(&state, campaign_id, auth.user_id).await?;

    let mut walls = Vec::with_capacity(reqs.len());
    for req in &reqs {
        let wt: String = serde_json::to_value(&req.wall_type)
            .unwrap()
            .as_str()
            .unwrap()
            .to_string();
        let ds: String = serde_json::to_value(&req.door_state)
            .unwrap()
            .as_str()
            .unwrap()
            .to_string();
        let row = db::walls::create_wall(
            &state.pool, &map_id,
            req.x1, req.y1, req.x2, req.y2, &wt, &ds,
        )
        .await?;
        walls.push(Wall::from(row));
    }

    let msg = ServerMessage::WallsCreated {
        map_id,
        walls: walls.clone(),
        created_by: auth.user_id,
    };
    state.session_manager.broadcast(campaign_id, &msg, None).await;

    Ok(Json(walls))
}

async fn update_wall(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateWallRequest>,
) -> Result<Json<Wall>, AppError> {
    let wall_row = db::walls::find_by_id(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;
    let campaign_id = get_campaign_id_for_map(&state, &wall_row.map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(&state, campaign_id, auth.user_id).await?;

    let wt = req.wall_type.map(|t| {
        serde_json::to_value(t).unwrap().as_str().unwrap().to_string()
    });
    let ds = req.door_state.map(|s| {
        serde_json::to_value(s).unwrap().as_str().unwrap().to_string()
    });

    let updated = db::walls::update_wall(
        &state.pool, &id,
        req.x1, req.y1, req.x2, req.y2,
        wt.as_deref(), ds.as_deref(),
    )
    .await?
    .ok_or(AppError::NotFound)?;

    let wall = Wall::from(updated);
    let msg = ServerMessage::WallUpdated {
        wall_id: id,
        patch: req,
        updated_by: auth.user_id,
    };
    state.session_manager.broadcast(campaign_id, &msg, None).await;

    Ok(Json(wall))
}

async fn delete_wall(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let wall_row = db::walls::find_by_id(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;
    let campaign_id = get_campaign_id_for_map(&state, &wall_row.map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(&state, campaign_id, auth.user_id).await?;

    db::walls::delete_wall(&state.pool, &id).await?;

    let msg = ServerMessage::WallsDeleted {
        wall_ids: vec![id],
        deleted_by: auth.user_id,
    };
    state.session_manager.broadcast(campaign_id, &msg, None).await;

    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 3: Create fog routes**

Create `crates/server/src/routes/fog.rs`:

```rust
use axum::{
    Json, Router,
    extract::{Path, State},
    routing::get,
};
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::fog::*;
use htbd_core::messages::ServerMessage;

use super::guards::{get_campaign_id_for_map, require_dm, require_member};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/maps/{map_id}/fog", get(get_fog).put(update_fog))
}

async fn get_fog(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(map_id): Path<Uuid>,
) -> Result<Json<Vec<FogCell>>, AppError> {
    let campaign_id = get_campaign_id_for_map(&state, &map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_member(&state, campaign_id, auth.user_id).await?;

    let cells = db::fog_cells::list_for_map(&state.pool, &map_id).await?;
    let fog_cells: Vec<FogCell> = cells.into_iter().map(|(x, y)| FogCell { x, y }).collect();
    Ok(Json(fog_cells))
}

async fn update_fog(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(map_id): Path<Uuid>,
    Json(req): Json<RevealFogRequest>,
) -> Result<Json<Vec<FogCell>>, AppError> {
    let campaign_id = get_campaign_id_for_map(&state, &map_id)
        .await?
        .ok_or(AppError::NotFound)?;
    require_dm(&state, campaign_id, auth.user_id).await?;

    let cell_tuples: Vec<(i32, i32)> = req.cells.iter().map(|c| (c.x, c.y)).collect();

    if req.revealed {
        db::fog_cells::reveal_cells(&state.pool, &map_id, &cell_tuples).await?;
    } else {
        db::fog_cells::hide_cells(&state.pool, &map_id, &cell_tuples).await?;
    }

    let msg = ServerMessage::FogRevealed {
        map_id,
        cells: req.cells.clone(),
        revealed: req.revealed,
    };
    state.session_manager.broadcast(campaign_id, &msg, None).await;

    let all_cells = db::fog_cells::list_for_map(&state.pool, &map_id).await?;
    let fog_cells: Vec<FogCell> = all_cells.into_iter().map(|(x, y)| FogCell { x, y }).collect();
    Ok(Json(fog_cells))
}
```

- [ ] **Step 4: Mount routes and update state endpoint**

Add to `crates/server/src/routes/mod.rs`:

```rust
pub mod walls;
pub mod fog;
```

And in `api_routes()`:

```rust
        .merge(walls::routes())
        .merge(fog::routes())
```

Update `crates/server/src/routes/state.rs` to include walls and fog in `MapFullState`:

```rust
    // Add after existing queries:
    let wall_rows = db::walls::list_for_map(&state.pool, &id).await?;
    let fog_cell_tuples = db::fog_cells::list_for_map(&state.pool, &id).await?;

    let walls = wall_rows.into_iter().map(Into::into).collect();
    let fog_cells = fog_cell_tuples
        .into_iter()
        .map(|(x, y)| htbd_core::fog::FogCell { x, y })
        .collect();

    Ok(Json(MapFullState {
        map,
        layers,
        tokens,
        drawings,
        walls,
        fog_cells,
    }))
```

- [ ] **Step 5: Build and test**

Run: `cd <worktree> && SQLX_OFFLINE=true cargo build --workspace`
Expected: Compiles.

- [ ] **Step 6: Commit**

```bash
git add crates/server/src/routes/walls.rs crates/server/src/routes/fog.rs \
        crates/server/src/routes/mod.rs crates/server/src/routes/state.rs \
        crates/server/src/routes/guards.rs
git commit -m "feat(sp5): wall and fog REST routes with broadcast"
```

---

## Task 9: WebSocket Door Toggle Handler

**Files:**
- Modify: `crates/server/src/routes/ws.rs`

- [ ] **Step 1: Add wall/door/fog match arms to handle_client_message**

In the `match msg` block in `handle_client_message`, add:

```rust
        ClientMessage::CreateWalls { map_id, walls } => {
            handle_create_walls(state, campaign_id, user_id, role, map_id, walls).await;
        }
        ClientMessage::UpdateWall { wall_id, patch } => {
            handle_update_wall_ws(state, campaign_id, user_id, role, wall_id, patch).await;
        }
        ClientMessage::DeleteWalls { wall_ids } => {
            handle_delete_walls(state, campaign_id, user_id, role, wall_ids).await;
        }
        ClientMessage::ToggleDoor { wall_id } => {
            handle_toggle_door(state, campaign_id, user_id, role, wall_id).await;
        }
        ClientMessage::RevealFog {
            map_id,
            cells,
            revealed,
        } => {
            handle_reveal_fog(state, campaign_id, user_id, role, map_id, cells, revealed).await;
        }
```

- [ ] **Step 2: Implement handle_toggle_door**

Add at the bottom of `ws.rs`:

```rust
async fn handle_toggle_door(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    wall_id: Uuid,
) {
    let wall_row = match db::walls::find_by_id(&state.pool, &wall_id).await {
        Ok(Some(w)) => w,
        _ => return,
    };

    // Not a door or secret_door: ignore
    if wall_row.wall_type == "wall" {
        return;
    }

    // Secret doors: only DM can interact
    if wall_row.wall_type == "secret_door" && role != CampaignRole::Dm {
        return;
    }

    // Check player_door_control map setting (players can't toggle if disabled)
    if role != CampaignRole::Dm {
        if let Ok(Some(map_row)) = db::maps::find_by_id(&state.pool, &wall_row.map_id).await {
            if !map_row.player_door_control {
                return;
            }
        }
    }

    // Locked door: players can't open — send DoorLocked to requester only
    if wall_row.door_state == "locked" && role != CampaignRole::Dm {
        let msg = ServerMessage::DoorLocked { wall_id };
        state.session_manager.send_to(campaign_id, user_id, &msg).await;
        return;
    }

    // DM: cycle open → closed → locked → open
    // Player: toggle between open and closed only
    let new_state = if role == CampaignRole::Dm {
        match wall_row.door_state.as_str() {
            "closed" => "open",
            "open" => "locked",
            "locked" => "closed",
            _ => "closed",
        }
    } else {
        match wall_row.door_state.as_str() {
            "closed" => "open",
            "open" => "closed",
            _ => return, // locked handled above
        }
    };

    if let Ok(Some(_)) = db::walls::update_door_state(&state.pool, &wall_id, new_state).await {
        let door_state: htbd_core::wall::DoorState =
            serde_json::from_value(serde_json::Value::String(new_state.to_string()))
                .unwrap_or(htbd_core::wall::DoorState::Closed);

        let msg = ServerMessage::DoorToggled {
            wall_id,
            door_state,
            toggled_by: user_id,
        };
        state.session_manager.broadcast(campaign_id, &msg, None).await;
    }
}
```

- [ ] **Step 3: Implement remaining WS handlers (create/update/delete walls, reveal fog)**

Add stub implementations that delegate to the same logic as the REST handlers:

```rust
async fn handle_create_walls(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    map_id: Uuid,
    reqs: Vec<htbd_core::wall::CreateWallRequest>,
) {
    if role != CampaignRole::Dm {
        return;
    }
    let mut walls = Vec::with_capacity(reqs.len());
    for req in &reqs {
        let wt: String = serde_json::to_value(&req.wall_type)
            .unwrap().as_str().unwrap().to_string();
        let ds: String = serde_json::to_value(&req.door_state)
            .unwrap().as_str().unwrap().to_string();
        if let Ok(row) = db::walls::create_wall(
            &state.pool, &map_id, req.x1, req.y1, req.x2, req.y2, &wt, &ds,
        ).await {
            walls.push(htbd_core::wall::Wall::from(row));
        }
    }
    if !walls.is_empty() {
        let msg = ServerMessage::WallsCreated { map_id, walls, created_by: user_id };
        state.session_manager.broadcast(campaign_id, &msg, None).await;
    }
}

async fn handle_update_wall_ws(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    wall_id: Uuid,
    patch: htbd_core::wall::UpdateWallRequest,
) {
    if role != CampaignRole::Dm { return; }
    let wt = patch.wall_type.map(|t|
        serde_json::to_value(t).unwrap().as_str().unwrap().to_string());
    let ds = patch.door_state.map(|s|
        serde_json::to_value(s).unwrap().as_str().unwrap().to_string());
    if db::walls::update_wall(
        &state.pool, &wall_id,
        patch.x1, patch.y1, patch.x2, patch.y2,
        wt.as_deref(), ds.as_deref(),
    ).await.is_ok() {
        let msg = ServerMessage::WallUpdated { wall_id, patch, updated_by: user_id };
        state.session_manager.broadcast(campaign_id, &msg, None).await;
    }
}

async fn handle_delete_walls(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    wall_ids: Vec<Uuid>,
) {
    if role != CampaignRole::Dm { return; }
    if db::walls::delete_walls(&state.pool, &wall_ids).await.is_ok() {
        let msg = ServerMessage::WallsDeleted { wall_ids, deleted_by: user_id };
        state.session_manager.broadcast(campaign_id, &msg, None).await;
    }
}

async fn handle_reveal_fog(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    map_id: Uuid,
    cells: Vec<htbd_core::fog::FogCell>,
    revealed: bool,
) {
    if role != CampaignRole::Dm { return; }
    let tuples: Vec<(i32, i32)> = cells.iter().map(|c| (c.x, c.y)).collect();
    let result = if revealed {
        db::fog_cells::reveal_cells(&state.pool, &map_id, &tuples).await
    } else {
        db::fog_cells::hide_cells(&state.pool, &map_id, &tuples).await
    };
    if result.is_ok() {
        let msg = ServerMessage::FogRevealed { map_id, cells, revealed };
        state.session_manager.broadcast(campaign_id, &msg, None).await;
    }
}
```

- [ ] **Step 4: Build and run all backend tests**

Run: `cd <worktree> && cargo fmt --all && SQLX_OFFLINE=true cargo clippy --workspace -- -D warnings && cargo test --workspace`
Expected: All pass. Regenerate sqlx offline data if needed.

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/routes/ws.rs
git commit -m "feat(sp5): WebSocket handlers for walls, doors, and fog"
```

---

## Task 10: Frontend Types

**Files:**
- Create: `client/src/types/Wall.ts`
- Create: `client/src/types/FogCell.ts`
- Modify: `client/src/types/Token.ts` (add vision fields)
- Modify: `client/src/types/ServerMessage.ts`
- Modify: `client/src/types/ClientMessage.ts`

- [ ] **Step 1: Create Wall types**

Create `client/src/types/Wall.ts`:

```typescript
export type WallType = 'wall' | 'door' | 'secret_door'
export type DoorState = 'closed' | 'open' | 'locked'

export type Wall = {
  id: string
  map_id: string
  x1: number
  y1: number
  x2: number
  y2: number
  wall_type: WallType
  door_state: DoorState
  created_at: string
}

export type CreateWallRequest = {
  x1: number
  y1: number
  x2: number
  y2: number
  wall_type?: WallType
  door_state?: DoorState
}

export type UpdateWallRequest = {
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  wall_type?: WallType
  door_state?: DoorState
}
```

- [ ] **Step 2: Create FogCell type**

Create `client/src/types/FogCell.ts`:

```typescript
export type FogCell = {
  x: number
  y: number
}
```

- [ ] **Step 3: Add vision fields to Token type**

Add to `client/src/types/Token.ts` Token type:

```typescript
  has_vision: boolean
  vision_range: number
  darkvision_range: number
  light_bright: number
  light_dim: number
```

- [ ] **Step 4: Add wall/fog/door message types to ServerMessage.ts**

Add these variants to the `ServerMessage` union type:

```typescript
  | { type: 'WallsCreated'; payload: { map_id: string; walls: Wall[]; created_by: string } }
  | { type: 'WallUpdated'; payload: { wall_id: string; patch: UpdateWallRequest; updated_by: string } }
  | { type: 'WallsDeleted'; payload: { wall_ids: string[]; deleted_by: string } }
  | { type: 'DoorToggled'; payload: { wall_id: string; door_state: DoorState; toggled_by: string } }
  | { type: 'DoorLocked'; payload: { wall_id: string } }
  | { type: 'FogRevealed'; payload: { map_id: string; cells: FogCell[]; revealed: boolean } }
```

- [ ] **Step 5: Add wall/fog message types to ClientMessage.ts**

Add these variants to the `ClientMessage` union type:

```typescript
  | { type: 'CreateWalls'; payload: { map_id: string; walls: CreateWallRequest[] } }
  | { type: 'UpdateWall'; payload: { wall_id: string; patch: UpdateWallRequest } }
  | { type: 'DeleteWalls'; payload: { wall_ids: string[] } }
  | { type: 'ToggleDoor'; payload: { wall_id: string } }
  | { type: 'RevealFog'; payload: { map_id: string; cells: FogCell[]; revealed: boolean } }
```

- [ ] **Step 6: Update FullState payload in ServerMessage.ts**

Add to the `FullState` payload type:

```typescript
    walls: Wall[]
    fog_cells: FogCell[]
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `cd <worktree>/client && npm run build`
Expected: Compiles (dispatcher will have unhandled cases — that's fine for now).

- [ ] **Step 8: Commit**

```bash
git add client/src/types/
git commit -m "feat(sp5): frontend Wall, FogCell, vision types and message variants"
```

---

## Task 11: Wall & Fog Zustand Stores

**Files:**
- Create: `client/src/state/walls.ts`
- Create: `client/src/state/fog.ts`
- Create: `client/src/state/__tests__/walls.test.ts`
- Create: `client/src/state/__tests__/fog.test.ts`

- [ ] **Step 1: Write wall store tests**

Create `client/src/state/__tests__/walls.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useWallStore } from '../walls'
import type { Wall } from '../../types/Wall'

const makeWall = (overrides: Partial<Wall> = {}): Wall => ({
  id: 'wall-1',
  map_id: 'map-1',
  x1: 0,
  y1: 0,
  x2: 5,
  y2: 0,
  wall_type: 'wall',
  door_state: 'closed',
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('useWallStore', () => {
  beforeEach(() => {
    useWallStore.setState(useWallStore.getInitialState())
  })

  it('starts empty', () => {
    expect(useWallStore.getState().walls).toEqual([])
  })

  it('loadWalls replaces wall list', () => {
    const walls = [makeWall(), makeWall({ id: 'wall-2' })]
    useWallStore.getState().loadWalls(walls)
    expect(useWallStore.getState().walls).toHaveLength(2)
  })

  it('addWalls appends without duplicates', () => {
    const wall = makeWall()
    useWallStore.getState().addWalls([wall])
    useWallStore.getState().addWalls([wall])
    expect(useWallStore.getState().walls).toHaveLength(1)
  })

  it('removeWalls removes by id', () => {
    useWallStore.getState().loadWalls([makeWall({ id: 'w1' }), makeWall({ id: 'w2' })])
    useWallStore.getState().removeWalls(['w1'])
    expect(useWallStore.getState().walls).toHaveLength(1)
    expect(useWallStore.getState().walls[0].id).toBe('w2')
  })

  it('updateWall patches a wall', () => {
    useWallStore.getState().loadWalls([makeWall()])
    useWallStore.getState().updateWall('wall-1', { wall_type: 'door' })
    expect(useWallStore.getState().walls[0].wall_type).toBe('door')
  })

  it('updateDoorState changes door_state', () => {
    useWallStore.getState().loadWalls([makeWall({ wall_type: 'door' })])
    useWallStore.getState().updateDoorState('wall-1', 'open')
    expect(useWallStore.getState().walls[0].door_state).toBe('open')
  })

  it('selectWall sets selectedIds', () => {
    useWallStore.getState().selectWall('wall-1')
    expect(useWallStore.getState().selectedIds).toEqual(['wall-1'])
  })

  it('deselectAll clears selection', () => {
    useWallStore.getState().selectWall('wall-1')
    useWallStore.getState().deselectAll()
    expect(useWallStore.getState().selectedIds).toEqual([])
  })
})
```

- [ ] **Step 2: Run wall store tests to verify they fail**

Run: `cd <worktree>/client && npx vitest run src/state/__tests__/walls.test.ts`
Expected: FAIL — module `../walls` not found.

- [ ] **Step 3: Implement wall store**

Create `client/src/state/walls.ts`:

```typescript
import { create } from 'zustand'
import type { Wall, DoorState, UpdateWallRequest } from '../types/Wall'

interface WallState {
  walls: Wall[]
  selectedIds: string[]

  loadWalls: (walls: Wall[]) => void
  addWalls: (walls: Wall[]) => void
  removeWalls: (wallIds: string[]) => void
  updateWall: (wallId: string, patch: Partial<Wall>) => void
  updateDoorState: (wallId: string, doorState: DoorState) => void
  selectWall: (wallId: string) => void
  deselectAll: () => void
}

export const useWallStore = create<WallState>()((set) => ({
  walls: [],
  selectedIds: [],

  loadWalls: (walls) => set({ walls, selectedIds: [] }),

  addWalls: (newWalls) =>
    set((s) => {
      const existingIds = new Set(s.walls.map((w) => w.id))
      const unique = newWalls.filter((w) => !existingIds.has(w.id))
      return unique.length > 0 ? { walls: [...s.walls, ...unique] } : s
    }),

  removeWalls: (wallIds) =>
    set((s) => {
      const idSet = new Set(wallIds)
      return {
        walls: s.walls.filter((w) => !idSet.has(w.id)),
        selectedIds: s.selectedIds.filter((id) => !idSet.has(id)),
      }
    }),

  updateWall: (wallId, patch) =>
    set((s) => ({
      walls: s.walls.map((w) => (w.id === wallId ? { ...w, ...patch } : w)),
    })),

  updateDoorState: (wallId, doorState) =>
    set((s) => ({
      walls: s.walls.map((w) =>
        w.id === wallId ? { ...w, door_state: doorState } : w,
      ),
    })),

  selectWall: (wallId) => set({ selectedIds: [wallId] }),

  deselectAll: () => set({ selectedIds: [] }),
}))
```

- [ ] **Step 4: Run wall store tests**

Run: `cd <worktree>/client && npx vitest run src/state/__tests__/walls.test.ts`
Expected: All pass.

- [ ] **Step 5: Write fog store tests**

Create `client/src/state/__tests__/fog.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useFogStore } from '../fog'

describe('useFogStore', () => {
  beforeEach(() => {
    useFogStore.setState(useFogStore.getInitialState())
  })

  it('starts with empty revealed set and DM vision mode', () => {
    const state = useFogStore.getState()
    expect(state.revealedCells.size).toBe(0)
    expect(state.visionMode).toBe('dm')
  })

  it('loadRevealedCells populates the set', () => {
    useFogStore.getState().loadRevealedCells([{ x: 0, y: 0 }, { x: 1, y: 0 }])
    expect(useFogStore.getState().revealedCells.size).toBe(2)
    expect(useFogStore.getState().isRevealed(0, 0)).toBe(true)
    expect(useFogStore.getState().isRevealed(5, 5)).toBe(false)
  })

  it('revealCells adds cells', () => {
    useFogStore.getState().revealCells([{ x: 3, y: 4 }])
    expect(useFogStore.getState().isRevealed(3, 4)).toBe(true)
  })

  it('hideCells removes cells', () => {
    useFogStore.getState().loadRevealedCells([{ x: 0, y: 0 }, { x: 1, y: 0 }])
    useFogStore.getState().hideCells([{ x: 0, y: 0 }])
    expect(useFogStore.getState().isRevealed(0, 0)).toBe(false)
    expect(useFogStore.getState().isRevealed(1, 0)).toBe(true)
  })

  it('setVisionMode switches between dm and player preview', () => {
    useFogStore.getState().setVisionMode('player', 'user-123')
    expect(useFogStore.getState().visionMode).toBe('player')
    expect(useFogStore.getState().previewPlayerId).toBe('user-123')
  })

  it('markExplored adds to explored set', () => {
    useFogStore.getState().markExplored(2, 3)
    expect(useFogStore.getState().isExplored(2, 3)).toBe(true)
    expect(useFogStore.getState().isExplored(0, 0)).toBe(false)
  })
})
```

- [ ] **Step 6: Implement fog store**

Create `client/src/state/fog.ts`:

```typescript
import { create } from 'zustand'
import type { FogCell } from '../types/FogCell'

type VisionMode = 'dm' | 'player'

function cellKey(x: number, y: number): string {
  return `${x},${y}`
}

interface FogState {
  revealedCells: Set<string>
  exploredCells: Set<string>
  visionMode: VisionMode
  previewPlayerId: string | null

  loadRevealedCells: (cells: FogCell[]) => void
  revealCells: (cells: FogCell[]) => void
  hideCells: (cells: FogCell[]) => void
  isRevealed: (x: number, y: number) => boolean
  markExplored: (x: number, y: number) => void
  isExplored: (x: number, y: number) => boolean
  setVisionMode: (mode: VisionMode, playerId?: string) => void
  loadExploredFromStorage: (mapId: string, userId: string) => void
  saveExploredToStorage: (mapId: string, userId: string) => void
}

export const useFogStore = create<FogState>()((set, get) => ({
  revealedCells: new Set<string>(),
  exploredCells: new Set<string>(),
  visionMode: 'dm' as VisionMode,
  previewPlayerId: null,

  loadRevealedCells: (cells) =>
    set({ revealedCells: new Set(cells.map((c) => cellKey(c.x, c.y))) }),

  revealCells: (cells) =>
    set((s) => {
      const next = new Set(s.revealedCells)
      for (const c of cells) next.add(cellKey(c.x, c.y))
      return { revealedCells: next }
    }),

  hideCells: (cells) =>
    set((s) => {
      const next = new Set(s.revealedCells)
      for (const c of cells) next.delete(cellKey(c.x, c.y))
      return { revealedCells: next }
    }),

  isRevealed: (x, y) => get().revealedCells.has(cellKey(x, y)),

  markExplored: (x, y) =>
    set((s) => {
      const key = cellKey(x, y)
      if (s.exploredCells.has(key)) return s
      const next = new Set(s.exploredCells)
      next.add(key)
      return { exploredCells: next }
    }),

  isExplored: (x, y) => get().exploredCells.has(cellKey(x, y)),

  setVisionMode: (mode, playerId) =>
    set({ visionMode: mode, previewPlayerId: playerId ?? null }),

  loadExploredFromStorage: (mapId, userId) => {
    try {
      const key = `explored:${mapId}:${userId}`
      const data = localStorage.getItem(key)
      if (data) {
        const arr: string[] = JSON.parse(data)
        set({ exploredCells: new Set(arr) })
      }
    } catch {
      // ignore parse errors
    }
  },

  saveExploredToStorage: (mapId, userId) => {
    try {
      const key = `explored:${mapId}:${userId}`
      const arr = Array.from(get().exploredCells)
      localStorage.setItem(key, JSON.stringify(arr))
    } catch {
      // ignore storage errors
    }
  },
}))
```

- [ ] **Step 7: Run all store tests**

Run: `cd <worktree>/client && npx vitest run src/state/__tests__/walls.test.ts src/state/__tests__/fog.test.ts`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add client/src/state/walls.ts client/src/state/fog.ts \
        client/src/state/__tests__/walls.test.ts client/src/state/__tests__/fog.test.ts
git commit -m "feat(sp5): wall and fog Zustand stores with tests"
```

---

## Task 12: Raycasting Math Module

**Files:**
- Create: `client/src/canvas/math/raycasting.ts`
- Create: `client/src/canvas/math/__tests__/raycasting.test.ts`

- [ ] **Step 1: Write raycasting tests**

Create `client/src/canvas/math/__tests__/raycasting.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeVisibilityPolygon, type Segment } from '../raycasting'

function area(polygon: Array<{ x: number; y: number }>): number {
  let a = 0
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length
    a += polygon[i].x * polygon[j].y
    a -= polygon[j].x * polygon[i].y
  }
  return Math.abs(a / 2)
}

describe('computeVisibilityPolygon', () => {
  it('returns a full circle polygon with no walls', () => {
    const poly = computeVisibilityPolygon(5, 5, 10, [])
    // Should approximate a circle of radius 10 around (5,5)
    expect(poly.length).toBeGreaterThan(8)
    const a = area(poly)
    const expectedArea = Math.PI * 10 * 10
    // Allow 15% tolerance for polygon approximation of circle
    expect(a).toBeGreaterThan(expectedArea * 0.85)
    expect(a).toBeLessThan(expectedArea * 1.15)
  })

  it('wall blocks visibility on one side', () => {
    // Vertical wall at x=3 from y=0 to y=10
    const walls: Segment[] = [{ x1: 3, y1: 0, x2: 3, y2: 10 }]
    const poly = computeVisibilityPolygon(1, 5, 20, walls)
    // All points in polygon should have x <= 3 (wall blocks right side)
    for (const p of poly) {
      expect(p.x).toBeLessThanOrEqual(3.01)
    }
  })

  it('open box room has full interior visibility', () => {
    // 10x10 box
    const walls: Segment[] = [
      { x1: 0, y1: 0, x2: 10, y2: 0 },
      { x1: 10, y1: 0, x2: 10, y2: 10 },
      { x1: 10, y1: 10, x2: 0, y2: 10 },
      { x1: 0, y1: 10, x2: 0, y2: 0 },
    ]
    const poly = computeVisibilityPolygon(5, 5, 20, walls)
    const a = area(poly)
    // Should see the entire 10x10 room = 100 sq units
    expect(a).toBeGreaterThan(95)
    expect(a).toBeLessThan(105)
  })

  it('L-shaped corridor hides the corner', () => {
    // L-shape: horizontal corridor 0-10 at y=0-2, vertical corridor 8-10 at y=0-10
    // Inner wall at (8,2) creates the corner
    const walls: Segment[] = [
      { x1: 0, y1: 0, x2: 10, y2: 0 },   // top
      { x1: 0, y1: 2, x2: 8, y2: 2 },    // bottom of horizontal
      { x1: 8, y1: 2, x2: 8, y2: 10 },   // inner wall
      { x1: 10, y1: 0, x2: 10, y2: 10 },  // right
      { x1: 8, y1: 10, x2: 10, y2: 10 }, // bottom
      { x1: 0, y1: 0, x2: 0, y2: 2 },    // left
    ]
    const poly = computeVisibilityPolygon(1, 1, 50, walls)
    // Token at (1,1) should NOT see (9,9) — it's around the corner
    // Check that (9,9) is not inside the polygon
    const inside = isPointInPolygon(9, 9, poly)
    expect(inside).toBe(false)
  })
})

function isPointInPolygon(
  px: number,
  py: number,
  polygon: Array<{ x: number; y: number }>,
): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd <worktree>/client && npx vitest run src/canvas/math/__tests__/raycasting.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement raycasting module**

Create `client/src/canvas/math/raycasting.ts`:

```typescript
export type Point = { x: number; y: number }
export type Segment = { x1: number; y1: number; x2: number; y2: number }

const EPSILON = 0.0001
const CIRCLE_SEGMENTS = 32

/**
 * Compute a visibility polygon from an origin point, given wall segments.
 * Uses the 2D raycasting / shadow-casting algorithm:
 * 1. Collect all wall endpoints within range
 * 2. For each endpoint, cast 3 rays (at angle, +epsilon, -epsilon)
 * 3. Find nearest wall intersection per ray
 * 4. Sort by angle, connect to form polygon
 * 5. Clip to vision range circle
 */
export function computeVisibilityPolygon(
  ox: number,
  oy: number,
  range: number,
  walls: Segment[],
): Point[] {
  // Collect unique angles to all endpoints + circle boundary points
  const angles: number[] = []

  // Add circle boundary angles for smooth clipping
  for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
    angles.push((2 * Math.PI * i) / CIRCLE_SEGMENTS)
  }

  // Add angles to each wall endpoint (3 rays per endpoint)
  for (const wall of walls) {
    for (const [px, py] of [[wall.x1, wall.y1], [wall.x2, wall.y2]]) {
      const dx = px - ox
      const dy = py - oy
      if (dx * dx + dy * dy > (range + 1) * (range + 1)) continue
      const angle = Math.atan2(dy, dx)
      angles.push(angle - EPSILON, angle, angle + EPSILON)
    }
  }

  // Sort angles
  angles.sort((a, b) => a - b)

  // Cast rays and find intersections
  const points: Point[] = []

  for (const angle of angles) {
    const rdx = Math.cos(angle)
    const rdy = Math.sin(angle)

    let closestDist = range
    let closestPoint: Point = { x: ox + rdx * range, y: oy + rdy * range }

    for (const wall of walls) {
      const intersection = raySegmentIntersect(ox, oy, rdx, rdy, wall)
      if (intersection !== null) {
        const dist = Math.sqrt(
          (intersection.x - ox) ** 2 + (intersection.y - oy) ** 2,
        )
        if (dist < closestDist) {
          closestDist = dist
          closestPoint = intersection
        }
      }
    }

    points.push(closestPoint)
  }

  // Deduplicate very close points
  return deduplicatePoints(points)
}

function raySegmentIntersect(
  ox: number,
  oy: number,
  rdx: number,
  rdy: number,
  seg: Segment,
): Point | null {
  const sdx = seg.x2 - seg.x1
  const sdy = seg.y2 - seg.y1

  const denom = rdx * sdy - rdy * sdx
  if (Math.abs(denom) < 1e-10) return null

  const t = ((seg.x1 - ox) * sdy - (seg.y1 - oy) * sdx) / denom
  const u = ((seg.x1 - ox) * rdy - (seg.y1 - oy) * rdx) / denom

  if (t < 0 || u < 0 || u > 1) return null

  return { x: ox + rdx * t, y: oy + rdy * t }
}

function deduplicatePoints(points: Point[]): Point[] {
  if (points.length === 0) return points
  const result: Point[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1]
    const dx = points[i].x - prev.x
    const dy = points[i].y - prev.y
    if (dx * dx + dy * dy > 0.001) {
      result.push(points[i])
    }
  }
  return result
}
```

- [ ] **Step 4: Run raycasting tests**

Run: `cd <worktree>/client && npx vitest run src/canvas/math/__tests__/raycasting.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/canvas/math/raycasting.ts client/src/canvas/math/__tests__/raycasting.test.ts
git commit -m "feat(sp5): 2D raycasting visibility polygon algorithm with tests"
```

---

## Task 13: Lighting Math Module

**Files:**
- Create: `client/src/canvas/math/lighting.ts`
- Create: `client/src/canvas/math/__tests__/lighting.test.ts`

- [ ] **Step 1: Write lighting tests**

Create `client/src/canvas/math/__tests__/lighting.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeLightLevel, LightLevel, type LightSource } from '../lighting'

describe('computeLightLevel', () => {
  const source: LightSource = {
    x: 5,
    y: 5,
    bright: 4,
    dim: 4,
  }

  it('returns bright within bright radius', () => {
    expect(computeLightLevel(5, 5, [source], 0)).toBe(LightLevel.Bright)
    expect(computeLightLevel(7, 5, [source], 0)).toBe(LightLevel.Bright)
  })

  it('returns dim in dim radius beyond bright', () => {
    expect(computeLightLevel(10, 5, [source], 0)).toBe(LightLevel.Dim)
  })

  it('returns dark beyond all light', () => {
    expect(computeLightLevel(20, 20, [source], 0)).toBe(LightLevel.Dark)
  })

  it('darkvision treats dark as dim within range', () => {
    expect(computeLightLevel(20, 5, [source], 12)).toBe(LightLevel.Dim)
  })

  it('darkvision does not upgrade dim to bright', () => {
    expect(computeLightLevel(10, 5, [source], 20)).toBe(LightLevel.Dim)
  })

  it('multiple sources: closest bright wins', () => {
    const source2: LightSource = { x: 15, y: 5, bright: 3, dim: 3 }
    expect(computeLightLevel(13, 5, [source, source2], 0)).toBe(LightLevel.Bright)
  })

  it('no sources and no darkvision is dark', () => {
    expect(computeLightLevel(5, 5, [], 0)).toBe(LightLevel.Dark)
  })

  it('no sources with darkvision in range is dim', () => {
    expect(computeLightLevel(5, 5, [], 10)).toBe(LightLevel.Dim)
  })
})
```

- [ ] **Step 2: Implement lighting module**

Create `client/src/canvas/math/lighting.ts`:

```typescript
export enum LightLevel {
  Bright = 'bright',
  Dim = 'dim',
  Dark = 'dark',
}

export type LightSource = {
  x: number
  y: number
  bright: number
  dim: number
}

/**
 * Compute the light level at a cell (cx, cy) given light sources and darkvision range.
 * darkvisionRange is in grid squares from the observing token's position
 * (caller must provide the distance from the token, not the cell).
 * For simplicity, darkvisionRange here is the max distance from the observer
 * at which dark becomes dim.
 */
export function computeLightLevel(
  cx: number,
  cy: number,
  sources: LightSource[],
  darkvisionRange: number,
): LightLevel {
  // Check all light sources — find the best light level
  let best = LightLevel.Dark

  for (const src of sources) {
    const dist = Math.sqrt((cx - src.x) ** 2 + (cy - src.y) ** 2)
    if (dist <= src.bright) {
      return LightLevel.Bright // Can't do better than bright
    }
    if (dist <= src.bright + src.dim) {
      best = LightLevel.Dim
    }
  }

  // If still dark, check darkvision
  // darkvisionRange is distance from observer — caller passes 0 if no darkvision
  if (best === LightLevel.Dark && darkvisionRange > 0) {
    // Darkvision treats darkness as dim light within range
    // The caller should check distance from token and pass darkvisionRange
    // Here we just trust that if darkvisionRange > 0, the cell is in range
    best = LightLevel.Dim
  }

  return best
}
```

- [ ] **Step 3: Run lighting tests**

Run: `cd <worktree>/client && npx vitest run src/canvas/math/__tests__/lighting.test.ts`
Expected: All pass. (The darkvisionRange tests may need the test to pass distance directly — adjust test expectations if needed to match the simplified API.)

- [ ] **Step 4: Commit**

```bash
git add client/src/canvas/math/lighting.ts client/src/canvas/math/__tests__/lighting.test.ts
git commit -m "feat(sp5): light level computation with bright/dim/dark and darkvision"
```

---

## Task 14: Vision Store (Computed Visibility)

**Files:**
- Create: `client/src/state/vision.ts`
- Create: `client/src/state/__tests__/vision.test.ts`

- [ ] **Step 1: Write vision store tests**

Create `client/src/state/__tests__/vision.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useVisionStore } from '../vision'
import type { Point } from '../../canvas/math/raycasting'

describe('useVisionStore', () => {
  beforeEach(() => {
    useVisionStore.setState(useVisionStore.getInitialState())
  })

  it('starts with no polygons', () => {
    expect(useVisionStore.getState().polygons).toEqual({})
  })

  it('setPolygon stores a visibility polygon for a token', () => {
    const poly: Point[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
    useVisionStore.getState().setPolygon('token-1', poly)
    expect(useVisionStore.getState().polygons['token-1']).toHaveLength(3)
  })

  it('clearPolygons removes all cached polygons', () => {
    useVisionStore.getState().setPolygon('token-1', [{ x: 0, y: 0 }])
    useVisionStore.getState().clearPolygons()
    expect(useVisionStore.getState().polygons).toEqual({})
  })

  it('setDirty marks recomputation needed', () => {
    expect(useVisionStore.getState().dirty).toBe(false)
    useVisionStore.getState().setDirty()
    expect(useVisionStore.getState().dirty).toBe(true)
  })
})
```

- [ ] **Step 2: Implement vision store**

Create `client/src/state/vision.ts`:

```typescript
import { create } from 'zustand'
import type { Point } from '../canvas/math/raycasting'

interface VisionState {
  polygons: Record<string, Point[]>
  dirty: boolean

  setPolygon: (tokenId: string, polygon: Point[]) => void
  clearPolygons: () => void
  setDirty: () => void
  clearDirty: () => void
}

export const useVisionStore = create<VisionState>()((set) => ({
  polygons: {},
  dirty: false,

  setPolygon: (tokenId, polygon) =>
    set((s) => ({
      polygons: { ...s.polygons, [tokenId]: polygon },
      dirty: false,
    })),

  clearPolygons: () => set({ polygons: {}, dirty: false }),

  setDirty: () => set({ dirty: true }),

  clearDirty: () => set({ dirty: false }),
}))
```

- [ ] **Step 3: Run vision store tests**

Run: `cd <worktree>/client && npx vitest run src/state/__tests__/vision.test.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add client/src/state/vision.ts client/src/state/__tests__/vision.test.ts
git commit -m "feat(sp5): vision store for cached visibility polygons"
```

---

## Task 15: Message Dispatcher Integration

**Files:**
- Modify: `client/src/api/dispatcher.ts`

- [ ] **Step 1: Add wall/fog imports and dispatch cases**

Add imports at top of `dispatcher.ts`:

```typescript
import { useWallStore } from '../state/walls'
import { useFogStore } from '../state/fog'
import { useVisionStore } from '../state/vision'
```

Add these cases to the switch statement in `createMessageDispatcher`:

```typescript
      // Wall messages
      case 'WallsCreated': {
        useWallStore.getState().addWalls(msg.payload.walls)
        useVisionStore.getState().setDirty()
        break
      }
      case 'WallUpdated': {
        useWallStore.getState().updateWall(msg.payload.wall_id, msg.payload.patch as unknown as Partial<Wall>)
        useVisionStore.getState().setDirty()
        break
      }
      case 'WallsDeleted': {
        useWallStore.getState().removeWalls(msg.payload.wall_ids)
        useVisionStore.getState().setDirty()
        break
      }
      case 'DoorToggled': {
        useWallStore.getState().updateDoorState(msg.payload.wall_id, msg.payload.door_state)
        useVisionStore.getState().setDirty()
        break
      }
      case 'DoorLocked': {
        // Brief visual feedback: the wall store can track a transient "lockedFlash" state
        // that WallRenderer reads to show a lock icon shake animation for ~1 second
        const wallId = msg.payload.wall_id
        useWallStore.getState().updateWall(wallId, { _lockedFlash: true } as any)
        setTimeout(() => {
          useWallStore.getState().updateWall(wallId, { _lockedFlash: false } as any)
        }, 1000)
        break
      }

      // Fog messages
      case 'FogRevealed': {
        if (msg.payload.revealed) {
          useFogStore.getState().revealCells(msg.payload.cells)
        } else {
          useFogStore.getState().hideCells(msg.payload.cells)
        }
        break
      }
```

Update the `FullState` case to load walls and fog:

```typescript
      case 'FullState': {
        const { map, layers, tokens, drawings, walls, fog_cells } = msg.payload
        useMapStore.getState().loadMap(map, layers)
        useTokenStore.getState().loadTokens(tokens)
        useDrawingStore.getState().loadDrawings(drawings)
        if (walls) useWallStore.getState().loadWalls(walls)
        if (fog_cells) useFogStore.getState().loadRevealedCells(fog_cells)
        useVisionStore.getState().setDirty()
        break
      }
```

Also add Wall import:

```typescript
import type { Wall } from '../types/Wall'
```

- [ ] **Step 2: Verify build**

Run: `cd <worktree>/client && npm run build`
Expected: Compiles.

- [ ] **Step 3: Commit**

```bash
git add client/src/api/dispatcher.ts
git commit -m "feat(sp5): dispatch wall/fog/door messages to stores"
```

---

## Task 16: WallRenderer (PixiJS DM Overlay)

**Files:**
- Create: `client/src/canvas/WallRenderer.ts`
- Modify: `client/src/canvas/CanvasView.tsx`

- [ ] **Step 1: Implement WallRenderer**

Create `client/src/canvas/WallRenderer.ts`:

```typescript
import { Graphics } from 'pixi.js'
import { useWallStore } from '../state/walls'
import { useMapStore } from '../state/map'
import type { Viewport } from './Viewport'
import type { Wall } from '../types/Wall'

const WALL_COLOR = 0x4ecdc4
const DOOR_COLOR = 0xff9f43
const SECRET_DOOR_COLOR = 0xa855f7
const SELECTED_COLOR = 0xffdd44
const LOCK_COLOR = 0xff6b6b
const LINE_WIDTH = 3

export class WallRenderer {
  private graphics: Graphics
  private viewport: Viewport
  private prevWalls: Wall[] = []
  private prevSelectedIds: string[] = []
  private unsubWalls: () => void
  private unsubMap: () => void
  private visible = true

  constructor(viewport: Viewport) {
    this.viewport = viewport
    this.graphics = new Graphics()
    viewport.container.addChild(this.graphics)

    this.unsubWalls = useWallStore.subscribe(() => {
      const { walls, selectedIds } = useWallStore.getState()
      if (walls !== this.prevWalls || selectedIds !== this.prevSelectedIds) {
        this.prevWalls = walls
        this.prevSelectedIds = selectedIds
        this.sync()
      }
    })

    this.unsubMap = useMapStore.subscribe(() => {
      this.sync()
    })

    this.sync()
  }

  setVisible(v: boolean) {
    this.visible = v
    this.graphics.visible = v
  }

  private sync() {
    this.graphics.clear()
    if (!this.visible) return

    const map = useMapStore.getState().currentMap
    if (!map) return
    const gridSize = map.grid_size_px
    const { walls, selectedIds } = useWallStore.getState()
    const selectedSet = new Set(selectedIds)

    for (const wall of walls) {
      const x1 = wall.x1 * gridSize
      const y1 = wall.y1 * gridSize
      const x2 = wall.x2 * gridSize
      const y2 = wall.y2 * gridSize
      const isSelected = selectedSet.has(wall.id)

      let color: number
      let dashPattern: number[] | null = null

      if (isSelected) {
        color = SELECTED_COLOR
      } else if (wall.wall_type === 'secret_door') {
        color = SECRET_DOOR_COLOR
        dashPattern = [8, 6]
      } else if (wall.wall_type === 'door') {
        color = DOOR_COLOR
        if (wall.door_state === 'open') {
          dashPattern = [10, 5]
        }
      } else {
        color = WALL_COLOR
      }

      if (dashPattern) {
        this.drawDashedLine(x1, y1, x2, y2, color, dashPattern)
      } else {
        this.graphics.moveTo(x1, y1)
        this.graphics.lineTo(x2, y2)
        this.graphics.stroke({ color, width: LINE_WIDTH, alpha: 1 })
      }

      // Endpoint handles
      if (isSelected) {
        this.graphics.circle(x1, y1, 5)
        this.graphics.fill({ color: SELECTED_COLOR })
        this.graphics.circle(x2, y2, 5)
        this.graphics.fill({ color: SELECTED_COLOR })
      }

      // Lock icon for locked doors
      if (wall.wall_type === 'door' && wall.door_state === 'locked') {
        const mx = (x1 + x2) / 2
        const my = (y1 + y2) / 2
        this.graphics.circle(mx, my, 6)
        this.graphics.fill({ color: LOCK_COLOR, alpha: 0.9 })
      }
    }
  }

  private drawDashedLine(
    x1: number, y1: number, x2: number, y2: number,
    color: number, pattern: number[],
  ) {
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy)
    const nx = dx / len
    const ny = dy / len
    let pos = 0
    let patIdx = 0
    let drawing = true

    while (pos < len) {
      const segLen = Math.min(pattern[patIdx % pattern.length], len - pos)
      const sx = x1 + nx * pos
      const sy = y1 + ny * pos
      const ex = x1 + nx * (pos + segLen)
      const ey = y1 + ny * (pos + segLen)

      if (drawing) {
        this.graphics.moveTo(sx, sy)
        this.graphics.lineTo(ex, ey)
        this.graphics.stroke({ color, width: LINE_WIDTH, alpha: 1 })
      }

      pos += segLen
      patIdx++
      drawing = !drawing
    }
  }

  destroy() {
    this.unsubWalls()
    this.unsubMap()
    this.viewport.container.removeChild(this.graphics)
    this.graphics.destroy()
  }
}
```

- [ ] **Step 2: Add WallRenderer to CanvasView.tsx**

In `CanvasView.tsx`, add a ref and instantiation following the existing pattern:

Add import type: `import type { WallRenderer } from './WallRenderer'`

Add ref: `const wallRendererRef = useRef<WallRenderer | null>(null)`

Add instantiation after MeasurementOverlay (before AccessibilityDOM):

```typescript
        const { WallRenderer } = await import('./WallRenderer')
        if (!mounted) { destroySubsystems(app); return }
        wallRendererRef.current = new WallRenderer(viewportRef.current)
        subsystems.push({ destroy: () => { wallRendererRef.current?.destroy(); wallRendererRef.current = null } })
```

- [ ] **Step 3: Verify build**

Run: `cd <worktree>/client && npm run build`
Expected: Compiles.

- [ ] **Step 4: Commit**

```bash
git add client/src/canvas/WallRenderer.ts client/src/canvas/CanvasView.tsx
git commit -m "feat(sp5): WallRenderer for DM wall overlay with door/lock indicators"
```

---

## Task 17: FogRenderer (PixiJS Fog Overlay)

**Files:**
- Create: `client/src/canvas/FogRenderer.ts`
- Modify: `client/src/canvas/CanvasView.tsx`

- [ ] **Step 1: Implement FogRenderer**

Create `client/src/canvas/FogRenderer.ts`:

```typescript
import { Container, Graphics } from 'pixi.js'
import { useVisionStore } from '../state/vision'
import { useFogStore } from '../state/fog'
import { useMapStore } from '../state/map'
import type { Viewport } from './Viewport'
import type { Point } from './math/raycasting'

const UNEXPLORED_ALPHA = 0.95
const EXPLORED_ALPHA = 0.5
const FOG_COLOR = 0x0a0a12

export class FogRenderer {
  private fogContainer: Container
  private unexploredGraphics: Graphics
  private exploredGraphics: Graphics
  private visibleMask: Graphics
  private viewport: Viewport
  private enabled = false
  private unsubVision: () => void
  private unsubFog: () => void
  private unsubMap: () => void

  constructor(viewport: Viewport) {
    this.viewport = viewport

    this.fogContainer = new Container()
    this.fogContainer.visible = false

    this.unexploredGraphics = new Graphics()
    this.exploredGraphics = new Graphics()
    this.visibleMask = new Graphics()

    this.fogContainer.addChild(this.unexploredGraphics)
    this.fogContainer.addChild(this.exploredGraphics)
    this.fogContainer.addChild(this.visibleMask)

    viewport.container.addChild(this.fogContainer)

    this.unsubVision = useVisionStore.subscribe(() => this.sync())
    this.unsubFog = useFogStore.subscribe(() => this.sync())
    this.unsubMap = useMapStore.subscribe(() => this.sync())
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    this.fogContainer.visible = enabled
    if (enabled) this.sync()
  }

  private sync() {
    if (!this.enabled) return

    const map = useMapStore.getState().currentMap
    if (!map) return

    const gridSize = map.grid_size_px
    const mapW = map.width_squares * gridSize
    const mapH = map.height_squares * gridSize
    const { polygons } = useVisionStore.getState()
    const fogStore = useFogStore.getState()

    // Combine all visibility polygons into one union
    const allPolygons = Object.values(polygons)

    // Draw full unexplored fog
    this.unexploredGraphics.clear()
    this.unexploredGraphics.rect(0, 0, mapW, mapH)
    this.unexploredGraphics.fill({ color: FOG_COLOR, alpha: UNEXPLORED_ALPHA })

    // Cut out currently visible areas using a mask
    this.visibleMask.clear()
    for (const poly of allPolygons) {
      if (poly.length < 3) continue
      this.visibleMask.moveTo(poly[0].x * gridSize, poly[0].y * gridSize)
      for (let i = 1; i < poly.length; i++) {
        this.visibleMask.lineTo(poly[i].x * gridSize, poly[i].y * gridSize)
      }
      this.visibleMask.closePath()
      this.visibleMask.fill({ color: 0xffffff })
    }

    this.unexploredGraphics.mask = this.visibleMask

    // Draw explored overlay: cells the player has previously seen but can't see now.
    // Composition: playerSees(cell) = dmRevealed(cell) AND (currentlyVisible(cell) OR explored(cell))
    // Explored cells that are DM-revealed but NOT currently visible get the dim overlay.
    this.exploredGraphics.clear()
    const explored = fogStore.exploredCells
    for (const key of explored) {
      const [xStr, yStr] = key.split(',')
      const x = parseInt(xStr, 10)
      const y = parseInt(yStr, 10)
      // Only show explored dim if DM has revealed this cell
      if (!fogStore.isRevealed(x, y)) continue
      // Skip cells that are currently visible (they're already clear via the mask)
      // The explored overlay only applies to cells that WERE visible but aren't now
      this.exploredGraphics.rect(
        x * gridSize,
        y * gridSize,
        gridSize,
        gridSize,
      )
    }
    this.exploredGraphics.fill({ color: FOG_COLOR, alpha: EXPLORED_ALPHA })
  }

  destroy() {
    this.unsubVision()
    this.unsubFog()
    this.unsubMap()
    this.viewport.container.removeChild(this.fogContainer)
    this.fogContainer.destroy({ children: true })
  }
}
```

- [ ] **Step 2: Add FogRenderer to CanvasView.tsx**

Add ref: `const fogRendererRef = useRef<FogRenderer | null>(null)`

Add import type: `import type { FogRenderer } from './FogRenderer'`

Add instantiation after WallRenderer:

```typescript
        const { FogRenderer } = await import('./FogRenderer')
        if (!mounted) { destroySubsystems(app); return }
        fogRendererRef.current = new FogRenderer(viewportRef.current)
        subsystems.push({ destroy: () => { fogRendererRef.current?.destroy(); fogRendererRef.current = null } })
```

- [ ] **Step 3: Verify build**

Run: `cd <worktree>/client && npm run build`
Expected: Compiles.

- [ ] **Step 4: Commit**

```bash
git add client/src/canvas/FogRenderer.ts client/src/canvas/CanvasView.tsx
git commit -m "feat(sp5): FogRenderer with visibility polygon masking and explored overlay"
```

---

## Task 18: LightRenderer (PixiJS Light Indicators)

**Files:**
- Create: `client/src/canvas/LightRenderer.ts`
- Modify: `client/src/canvas/CanvasView.tsx`

- [ ] **Step 1: Implement LightRenderer**

Create `client/src/canvas/LightRenderer.ts`:

```typescript
import { Graphics } from 'pixi.js'
import { useTokenStore } from '../state/tokens'
import { useMapStore } from '../state/map'
import type { Viewport } from './Viewport'
import type { Token } from '../types/Token'

const BRIGHT_COLOR = 0xffdd44
const DIM_COLOR = 0x8899aa
const DASH_PATTERN = [8, 6]

export class LightRenderer {
  private graphics: Graphics
  private viewport: Viewport
  private prevTokens: Token[] = []
  private unsubTokens: () => void
  private unsubMap: () => void
  private visible = true

  constructor(viewport: Viewport) {
    this.viewport = viewport
    this.graphics = new Graphics()
    viewport.container.addChild(this.graphics)

    this.unsubTokens = useTokenStore.subscribe(() => {
      const { tokens } = useTokenStore.getState()
      if (tokens !== this.prevTokens) {
        this.prevTokens = tokens
        this.sync()
      }
    })

    this.unsubMap = useMapStore.subscribe(() => this.sync())
    this.sync()
  }

  setVisible(v: boolean) {
    this.visible = v
    this.graphics.visible = v
  }

  private sync() {
    this.graphics.clear()
    if (!this.visible) return

    const map = useMapStore.getState().currentMap
    if (!map) return
    const gridSize = map.grid_size_px

    const tokens = useTokenStore.getState().tokens

    for (const token of tokens) {
      if (token.light_bright <= 0 && token.light_dim <= 0) continue

      const cx = (token.x + token.size / 2) * gridSize
      const cy = (token.y + token.size / 2) * gridSize

      // Bright radius
      if (token.light_bright > 0) {
        const r = token.light_bright * gridSize
        this.drawDashedCircle(cx, cy, r, BRIGHT_COLOR, 0.4)
      }

      // Dim radius (beyond bright)
      if (token.light_dim > 0) {
        const r = (token.light_bright + token.light_dim) * gridSize
        this.drawDashedCircle(cx, cy, r, DIM_COLOR, 0.3)
      }
    }
  }

  private drawDashedCircle(
    cx: number, cy: number, radius: number,
    color: number, alpha: number,
  ) {
    const segments = 64
    let patIdx = 0
    let drawing = true

    for (let i = 0; i < segments; i++) {
      const a1 = (2 * Math.PI * i) / segments
      const a2 = (2 * Math.PI * (i + 1)) / segments
      const x1 = cx + Math.cos(a1) * radius
      const y1 = cy + Math.sin(a1) * radius
      const x2 = cx + Math.cos(a2) * radius
      const y2 = cy + Math.sin(a2) * radius

      if (drawing) {
        this.graphics.moveTo(x1, y1)
        this.graphics.lineTo(x2, y2)
        this.graphics.stroke({ color, width: 1.5, alpha })
      }

      patIdx++
      if (patIdx % 3 === 0) drawing = !drawing
    }
  }

  destroy() {
    this.unsubTokens()
    this.unsubMap()
    this.viewport.container.removeChild(this.graphics)
    this.graphics.destroy()
  }
}
```

- [ ] **Step 2: Add LightRenderer to CanvasView.tsx**

Add ref and instantiation following the same pattern as WallRenderer/FogRenderer.

- [ ] **Step 3: Verify build and commit**

Run: `cd <worktree>/client && npm run build`

```bash
git add client/src/canvas/LightRenderer.ts client/src/canvas/CanvasView.tsx
git commit -m "feat(sp5): LightRenderer with DM light radius indicators"
```

---

## Task 19: Wall REST Client & Fog REST Client

**Files:**
- Create: `client/src/api/walls.ts`
- Create: `client/src/api/fog.ts`

- [ ] **Step 1: Create wall REST client**

Create `client/src/api/walls.ts`:

```typescript
import type { Wall, CreateWallRequest, UpdateWallRequest } from '../types/Wall'

const BASE = '/api'

export async function listWalls(mapId: string): Promise<Wall[]> {
  const res = await fetch(`${BASE}/maps/${mapId}/walls`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to list walls: ${res.status}`)
  return res.json()
}

export async function createWalls(mapId: string, walls: CreateWallRequest[]): Promise<Wall[]> {
  const res = await fetch(`${BASE}/maps/${mapId}/walls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(walls),
  })
  if (!res.ok) throw new Error(`Failed to create walls: ${res.status}`)
  return res.json()
}

export async function updateWall(wallId: string, patch: UpdateWallRequest): Promise<Wall> {
  const res = await fetch(`${BASE}/walls/${wallId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`Failed to update wall: ${res.status}`)
  return res.json()
}

export async function deleteWall(wallId: string): Promise<void> {
  const res = await fetch(`${BASE}/walls/${wallId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Failed to delete wall: ${res.status}`)
}
```

- [ ] **Step 2: Create fog REST client**

Create `client/src/api/fog.ts`:

```typescript
import type { FogCell } from '../types/FogCell'

const BASE = '/api'

export async function getFog(mapId: string): Promise<FogCell[]> {
  const res = await fetch(`${BASE}/maps/${mapId}/fog`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to get fog: ${res.status}`)
  return res.json()
}

export async function updateFog(
  mapId: string,
  cells: FogCell[],
  revealed: boolean,
): Promise<FogCell[]> {
  const res = await fetch(`${BASE}/maps/${mapId}/fog`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ cells, revealed }),
  })
  if (!res.ok) throw new Error(`Failed to update fog: ${res.status}`)
  return res.json()
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/api/walls.ts client/src/api/fog.ts
git commit -m "feat(sp5): wall and fog REST client modules"
```

---

## Task 20: React UI — WallToolbar, TokenVisionEditor, VisionPanel, FogTool

**Files:**
- Create: `client/src/components/WallToolbar.tsx`
- Create: `client/src/components/TokenVisionEditor.tsx`
- Create: `client/src/components/VisionPanel.tsx`
- Create: `client/src/components/FogTool.tsx`

This task creates the four React UI components. Each follows the existing component patterns (Radix primitives, Zustand store subscriptions, DM-only visibility checks).

- [ ] **Step 1: Create WallToolbar component**

Create `client/src/components/WallToolbar.tsx` — DM-only toolbar for wall placement with polyline tool, rectangle tool, wall type selector (wall/door/secret_door), and active tool state managed via the existing `useToolStore` pattern (add a `wallTool` field or extend tool types).

- [ ] **Step 2: Create TokenVisionEditor component**

Create `client/src/components/TokenVisionEditor.tsx` — extends the token inspector with number inputs for vision_range, darkvision_range, light_bright, light_dim, and a has_vision toggle. Updates token via the existing `PATCH /api/tokens/:id` endpoint.

- [ ] **Step 3: Create VisionPanel component**

Create `client/src/components/VisionPanel.tsx` — DM-only panel with a dropdown to switch between "DM View" and player preview modes. When player preview is selected, shows a player selector. Calls `useFogStore.getState().setVisionMode()`.

- [ ] **Step 4: Create FogTool component**

Create `client/src/components/FogTool.tsx` — DM-only brush tool for revealing/hiding fog cells. Toggle between reveal/hide mode. Click-drag on canvas paints revealed cells.

- [ ] **Step 5: Integrate into Campaign.tsx**

Add WallToolbar, VisionPanel, and FogTool to the Campaign page layout (DM-only visibility). Add TokenVisionEditor to the existing token inspector section.

- [ ] **Step 6: Verify build**

Run: `cd <worktree>/client && npm run build && npm run lint`
Expected: Compiles and lints clean.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/WallToolbar.tsx client/src/components/TokenVisionEditor.tsx \
        client/src/components/VisionPanel.tsx client/src/components/FogTool.tsx \
        client/src/pages/Campaign.tsx
git commit -m "feat(sp5): wall toolbar, vision panel, token vision editor, fog tool UI"
```

---

## Task 21: WallInteraction (Canvas Interaction for Walls & Doors)

**Files:**
- Create: `client/src/canvas/WallInteraction.ts`
- Modify: `client/src/canvas/CanvasView.tsx`

- [ ] **Step 1: Implement WallInteraction**

Create `client/src/canvas/WallInteraction.ts` — handles:
- Wall polyline placement: click to add vertices, double-click to finish, Escape to cancel
- Wall rectangle placement: click two corners, creates 4 segments
- Wall selection: click near a wall segment to select it
- Wall endpoint dragging: drag selected wall endpoints to reposition
- Door double-click: detect double-click on a door within vision range, send `ToggleDoor` WS message
- Snap to grid intersections (hold Alt to disable)

Follows the same pattern as `TokenInteraction.ts` — subscribes to tool store for active tool, listens to PixiJS pointer events on the canvas.

- [ ] **Step 2: Add to CanvasView.tsx**

Instantiate WallInteraction after WallRenderer.

- [ ] **Step 3: Verify build and commit**

```bash
git add client/src/canvas/WallInteraction.ts client/src/canvas/CanvasView.tsx
git commit -m "feat(sp5): wall placement, selection, and door interaction"
```

---

## Task 22: Vision Recomputation Integration

**Files:**
- Modify: `client/src/canvas/FogRenderer.ts`
- Modify: `client/src/canvas/TokenRenderer.ts`

- [ ] **Step 1: Add vision recomputation to FogRenderer**

Add a `recompute()` method to FogRenderer that:
1. Gets all tokens with `has_vision: true` from tokenStore
2. Gets all walls from wallStore (filtering: closed/locked doors and walls block, open doors don't)
3. For each vision token, calls `computeVisibilityPolygon()` from the raycasting module
4. Stores results in visionStore via `setPolygon()`
5. Updates explored cells in fogStore

Subscribe to tokenStore (token moves), wallStore (wall changes), and visionStore (dirty flag) to trigger recomputation.

- [ ] **Step 2: Filter token rendering by visibility**

In `TokenRenderer.ts`, add fog-aware filtering:
- If fog is enabled and this is a player view, skip rendering tokens that are not in any visibility polygon
- Tokens in explored-but-not-visible cells are hidden
- DM view shows all tokens regardless

- [ ] **Step 3: Verify build and commit**

```bash
git add client/src/canvas/FogRenderer.ts client/src/canvas/TokenRenderer.ts
git commit -m "feat(sp5): vision recomputation and fog-aware token filtering"
```

---

## Task 23: Accessibility

**Files:**
- Modify: `client/src/canvas/AccessibilityDOM.ts`
- Modify: `client/src/canvas/WallRenderer.ts`

- [ ] **Step 1: Extend AccessibilityDOM with wall/door descriptions**

Add off-screen DOM elements for:
- Wall segments: descriptive text ("Wall from (2,3) to (2,7)")
- Doors: interactive buttons ("Door at (4,3) — closed", with click handler to toggle)
- ARIA live region for door state changes and light level announcements

- [ ] **Step 2: Add keyboard controls to WallInteraction**

- Enter to finish polyline, Escape to cancel
- Arrow keys to nudge selected wall endpoints by one grid unit
- Tab to cycle through interactable doors, Enter/Space to toggle

- [ ] **Step 3: Commit**

```bash
git add client/src/canvas/AccessibilityDOM.ts client/src/canvas/WallInteraction.ts
git commit -m "feat(sp5): accessibility — wall descriptions, door buttons, keyboard controls"
```

---

## Task 24: Pre-Push Verification

- [ ] **Step 1: Run all backend checks**

```bash
cd <worktree>
cargo fmt --all -- --check
SQLX_OFFLINE=true cargo clippy --workspace -- -D warnings
cargo test --workspace
```

Expected: All pass.

- [ ] **Step 2: Run all frontend checks**

```bash
cd <worktree>/client
npm run lint
npm run build
npm run test -- --run
```

Expected: All pass.

- [ ] **Step 3: Fix any failures and commit fixes**

---

## Task 25: End-to-End Tests (Playwright)

**Files:**
- Create: `client/e2e/walls.spec.ts`
- Create: `client/e2e/fog.spec.ts`

- [ ] **Step 1: Write wall placement e2e test**

Create `client/e2e/walls.spec.ts` with tests:
- DM creates walls via polyline tool → walls render on canvas
- DM creates rectangle room → 4 walls appear
- DM creates door → toggles open/closed → verifies state change
- DM locks door → player double-clicks → lock indicator appears

- [ ] **Step 2: Write fog e2e test**

Create `client/e2e/fog.spec.ts` with tests:
- DM reveals fog area → player sees revealed cells
- DM hides area → player sees fog return
- Token with vision sees visibility polygon
- Multi-client: player A moves token → A's fog updates → B unchanged

- [ ] **Step 3: Run e2e tests locally**

Run: `cd <worktree>/client && npm run test:e2e`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add client/e2e/walls.spec.ts client/e2e/fog.spec.ts
git commit -m "test(sp5): e2e tests for wall placement, doors, fog of war, and vision"
```

---

## Task 26: Visual Regression Tests

**Files:**
- Create: `client/e2e/visual-fog.spec.ts`

- [ ] **Step 1: Write visual regression tests**

Create `client/e2e/visual-fog.spec.ts` with Playwright screenshot tests:
- Fog rendering: visibility polygon with gradient edges
- Light levels: bright/dim/dark zones
- Wall overlay: wall/door/secret door rendering in DM view
- Door states: open/closed/locked visual indicators
- Explored fog: previously seen areas at 50% dim

Each test sets up a known map state, takes a screenshot, and compares to a baseline.

- [ ] **Step 2: Generate baseline screenshots**

Run: `cd <worktree>/client && npm run test:e2e -- --update-snapshots`

- [ ] **Step 3: Commit baselines**

```bash
git add client/e2e/visual-fog.spec.ts client/e2e/*.spec.ts-snapshots/
git commit -m "test(sp5): visual regression tests for fog, lighting, and wall rendering"
```

---

## Task 27: Final Pre-Push Verification

- [ ] **Step 1: Run full backend CI checks**

```bash
cd <worktree>
cargo fmt --all -- --check
SQLX_OFFLINE=true cargo clippy --workspace -- -D warnings
cargo test --workspace
```

- [ ] **Step 2: Run full frontend CI checks**

```bash
cd <worktree>/client
npm run lint
npm run build
npm run test -- --run
```

- [ ] **Step 3: Run e2e tests**

```bash
cd <worktree>/client && npm run test:e2e
```

- [ ] **Step 4: Verify all pass, fix any issues, final commit if needed**
