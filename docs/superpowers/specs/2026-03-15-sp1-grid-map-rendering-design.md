# SP-1: Grid & Map Rendering Engine — Design Spec

The core canvas system for Here There Be Dragons — grid rendering, map display, layers, tokens, drawing tools, and measurement. This is the spatial foundation that makes the VTT a functional battle map.

**Parent spec:** [Here There Be Dragons Design Spec](2026-03-15-here-there-be-dragons-design.md)
**Roadmap:** [Phase 1 Roadmap](../plans/2026-03-15-phase1-roadmap.md)
**Dependencies:** SP-0 (Tech Stack & Foundation)

---

## Scope

SP-1 delivers a functional battle map. A DM uploads a map image, configures a grid, places tokens, and players see their tokens and can move them. Drawing tools let the DM sketch and annotate. Measurement tools support tactical combat. No lighting, no fog of war, no real-time sync — those are SP-5 and SP-2 respectively.

**In scope:**
- Square grid with configurable scale + gridless mode
- Map image upload and display, aligned to grid
- Flexible layer system (DM-managed)
- Token placement, movement, sizing (1x1–4x4), bars, and status markers
- Drawing tools (freehand, shapes, polygon) and AoE templates
- Measurement tools (ruler, waypoint path, AoE preview)
- Pan, zoom, and smooth 60fps performance
- Backend data model, REST API, and WebSocket message types

**Out of scope (later sub-projects):**
- Hex grid (future extension of grid abstraction)
- Dynamic lighting and fog of war (SP-5)
- Real-time multi-client sync (SP-2)
- Per-player token visibility (SP-5)
- Chat integration for measurement results (SP-4)

---

## Architecture

### Two Rendering Contexts

The SP-0 architecture establishes two rendering contexts — PixiJS canvas and React UI. SP-1 extends both:

**PixiJS Canvas** — six subsystems:
1. **Viewport** — pan, zoom, camera transform, viewport culling
2. **Layer Manager** — ordered PixiJS Containers, one per layer
3. **Grid Renderer** — square grid or gridless, drawn as culled Graphics
4. **Token Renderer** — sprites with bars, status icons, selection rings
5. **Drawing Layer** — freehand, shapes, polygon, AoE template objects
6. **Measurement Overlay** — ephemeral ruler, waypoints, AoE preview

**React UI** — new panels and controls:
- **Toolbar** — active tool selection, draw settings, grid config
- **Layer Panel** (DM-only) — create, reorder, toggle, rename, lock layers
- **Token Inspector** — edit selected token properties (name, bars, status, size)
- **Map Settings** — grid size, scale, snap mode, diagonal rule

### Data Flow

```
User action (click/drag on canvas)
  → PixiJS event handler
  → Zustand store update
  → React UI re-render (toolbar, inspector, panels)
  → PixiJS canvas update (subscribed to store changes)
  → REST API persist + WebSocket broadcast (SP-2 integration point)
```

PixiJS owns rendering. Zustand owns state. The canvas never holds authoritative state — it reads from stores and renders. This separation ensures React UI and PixiJS stay in sync without direct coupling.

### New Zustand Stores

- **`mapStore`** — current map data, grid settings, layers, active layer
- **`tokenStore`** — tokens on the current map, selection state
- **`toolStore`** — active tool, draw settings (color, width, fill), measurement state
- **`drawingStore`** — drawing objects per layer, undo/redo stack

---

## Grid & Viewport

### Grid System

- Square grid with configurable cell size in pixels
- Grid scale: DM configures what 1 square equals (default: 5ft for D&D 3.5e)
- Grid scale unit configurable (feet, meters, or generic "units")
- Gridless mode: grid overlay disabled, snap-to-grid off, map images display freely
- Grid rendered as a PixiJS Graphics object covering only visible cells (culled to viewport bounds)
- Grid coordinates: integer `(col, row)` system, origin at top-left. All positions stored in grid coordinates, converted to pixels for rendering.
- Grid appearance: configurable color, opacity, and line width

### Viewport

- Pan via middle-mouse drag or two-finger trackpad
- Zoom via scroll wheel / pinch, with configurable min/max (0.1x to 5x)
- Smooth animated zoom centered on cursor position
- Keyboard shortcuts: fit-to-map, zoom-to-selection, center on token
- Viewport culling: only render objects within visible bounds plus a small margin

### Snap-to-Grid

- Tokens snap to grid cell centers by default
- Snap modes: off, center-snap, corner-snap (configurable per-map)
- Drawing tool endpoints optionally snap to grid intersections
- Measurement tools always reference grid coordinates for distance calculation
- In gridless mode, all snapping is disabled

---

## Layer System

### Layer Model

Each map has an ordered list of layers. Layers are a DM-only organizational tool — players see the flattened composite result with no layer UI.

**Layer properties:**
- `id`, `name`, `layer_type`, `sort_order`, `visible`, `locked`, `opacity` (0–1), `dm_only`

**Layer types:**
- **Map-image** — holds one or more positioned/scaled images (base map, furniture overlays, terrain)
- **Token** — holds token objects. Multiple token layers allow grouping (e.g., "NPCs", "Players", "Enemies")
- **Drawing** — holds freehand strokes, shapes, and annotations

### Default Layers

New maps start with three layers:
1. "Background" (map-image) — for the base map image
2. "Tokens" (token) — for player and NPC tokens
3. "DM Notes" (drawing, dm_only) — for DM-only annotations invisible to players

### DM Layer Operations

- Create, delete, rename layers
- Reorder via drag (changes `sort_order`, reorders PixiJS Containers)
- Toggle visibility (hides from DM view temporarily; player view unaffected unless `dm_only`)
- Lock (prevents editing — protects map images from accidental moves)
- Adjust opacity (applies to entire PixiJS Container alpha)
- Set `dm_only` flag — layer excluded entirely from player render (not sent to player clients)

### Rendering

- Each layer maps to a PixiJS Container in the scene graph
- Layer order = Container order. Reordering layers reorders containers.
- Player client renders all non-DM-only layers — no layer awareness, just the composite
- Hidden or off-screen layers skip rendering (`Container.visible = false`)
- Large map images lazy-loaded (decoded and uploaded to GPU only when visible and in viewport)

---

## Token System

### Token Data Model

Each token belongs to a layer and has:
- `id`, `name`, `asset_id` (reference to SP-0 asset library), `owner_id` (player who controls it)
- `x`, `y` (grid coordinates, fractional for gridless), `size` (1–4, representing NxN grid squares), `rotation` (degrees)
- `bars` (array, up to 3), `status_markers` (array of marker IDs)

### Token Bars

- Up to 3 configurable bars per token
- Each bar: `label`, `current_value`, `max_value`, `color`, `visibility` (everyone | dm-only | owner+dm)
- Rendered as thin horizontal bars below the token sprite
- Bar visibility allows DMs to hide enemy HP from players while showing player HP to everyone

### Status Markers

- Predefined set of condition icons covering D&D 3.5e conditions (poisoned, stunned, prone, grappled, concentrating, blinded, frightened, invisible, etc.)
- Ships with a default icon set — custom markers deferred
- DM toggles markers on/off per token
- Rendered as small icons arranged around the token border (top-right corner, wrapping clockwise)
- Icons packed into a sprite sheet atlas for single-draw-call rendering

### Token Interaction

- Click to select — shows selection ring, opens Token Inspector panel
- Drag to move — ghost preview at destination, snaps to grid on release
- Multi-select via shift-click or box-select (drag on empty space), then move as group
- Right-click context menu: edit, duplicate, delete, move to layer, set size
- Double-click to open full token editor (name, bars, image, etc.)
- Players can only select/move tokens they own. DM can move any token.

### Token Sizing

- Size is NxN grid squares: 1x1 (small/medium), 2x2 (large), 3x3 (huge), 4x4 (gargantuan)
- Token image scales to fill the grid footprint
- Circular crop applied to the image (standard VTT token style)

### Token Rendering Performance

- Tokens sharing the same asset share one GPU texture via PixiJS texture cache
- Off-screen tokens culled from rendering
- During drag, only the dragged token's position updates per frame — ghost/snap preview is a lightweight sprite

---

## Drawing Tools

### Tool Set

- **Freehand** — mouse/stylus drawing, configurable stroke color, width, opacity
- **Line** — click start and end, optional snap to grid intersections
- **Rectangle** — click and drag, optionally filled
- **Circle/Ellipse** — click center and drag radius, optionally filled
- **Polygon** — click to add vertices, double-click or close path to finish
- **Eraser** — click a drawing to delete it, or drag to delete all touched objects. Only affects active layer.

### Drawing Properties

- Stroke: color, width (1–20px), opacity
- Fill: color, opacity (for closed shapes)
- All drawings belong to a specific layer — drawn on whichever layer is active in the layer panel
- Drawings are objects (selectable, movable, deletable after creation), not baked pixels

### AoE Templates

Separate from basic drawing tools — these are tactical combat overlays:

- **Cone** — origin point + direction + angle (default 90°) + length in grid squares
- **Cube** — origin corner + size in grid squares
- **Sphere/Circle** — center + radius in grid squares
- **Line** — origin + length in grid squares + width (default 1 square)

**Behavior:**
- Semi-transparent colored overlays with distinct visual style (hatched or colored fill) — clearly different from drawings
- Snap to grid, display affected squares highlighted
- Ephemeral by default (disappear when tool is deselected)
- Can be "pinned" to persist on the map (added to the active drawing layer)

### Freehand Smoothing

Raw mouse points simplified via Ramer-Douglas-Peucker algorithm after stroke ends, reducing point count by 60–80% while preserving shape. This reduces storage and rendering cost.

### Undo/Redo

- Drawing actions support undo/redo (Ctrl+Z / Ctrl+Shift+Z)
- Scoped to drawing operations only, not token movement
- Undo stack per drawing layer, cleared on layer switch

---

## Measurement Tools

### Ruler

- Click to set origin, drag to measure
- Shows distance in grid squares and configured scale (e.g., "6 squares / 30ft")
- Snap to grid cell centers by default, hold Alt for free-position
- Visual: colored line with distance label following the cursor
- Visible only to the measuring user (not broadcast)

### Waypoint Path

- Click to place waypoints, each segment shows its distance
- Running total displayed at the cursor
- Used for planning movement around obstacles
- Right-click or Escape to finish/cancel
- Visual: connected line segments with distance labels at each waypoint, total at endpoint

### AoE Measurement

- When placing an AoE template, affected grid squares are highlighted and counted
- Hover shows summary (e.g., "15ft cone — affects 6 squares")
- Reuses the AoE template system from drawing tools in a non-pinned, preview-only mode

### Grid Scale Configuration

- DM sets: 1 square = N feet/meters/units (default: 5ft)
- All measurement displays use this scale
- Stored per-map (different maps can have different scales)

### Diagonal Measurement

Three modes, configurable per-campaign:
- **D&D standard (default):** alternating 5/10/5/10 for diagonals (3.5e PHB rule)
- **Euclidean:** actual distance (√2 × grid size per diagonal)
- **Manhattan:** no diagonal movement discount, each square = 1 unit

---

## Backend Data Model

### New Database Tables

```sql
-- Maps belong to campaigns
CREATE TABLE maps (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id      UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    grid_enabled     BOOLEAN NOT NULL DEFAULT true,
    grid_size_px     INTEGER NOT NULL DEFAULT 70,
    grid_scale       REAL NOT NULL DEFAULT 5.0,
    grid_scale_unit  TEXT NOT NULL DEFAULT 'ft',
    diagonal_mode    TEXT NOT NULL DEFAULT 'dnd_standard'
                     CHECK (diagonal_mode IN ('dnd_standard', 'euclidean', 'manhattan')),
    width_squares    INTEGER NOT NULL DEFAULT 30,
    height_squares   INTEGER NOT NULL DEFAULT 20,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Layers belong to maps
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

-- Map images positioned on map-image layers
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

-- Tokens on token layers
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
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Drawing objects on drawing layers
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
    fill_opacity    REAL NOT NULL DEFAULT 0.3
);
```

### REST API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/api/campaigns/:id/maps` | Create map | DM only |
| `GET` | `/api/campaigns/:id/maps` | List maps | Campaign members |
| `GET` | `/api/maps/:id` | Get map with layers | Campaign members (filters dm_only) |
| `PATCH` | `/api/maps/:id` | Update map settings | DM only |
| `DELETE` | `/api/maps/:id` | Delete map | DM only |
| `POST` | `/api/maps/:id/layers` | Create layer | DM only |
| `PATCH` | `/api/layers/:id` | Update layer (name, order, visibility, etc.) | DM only |
| `DELETE` | `/api/layers/:id` | Delete layer | DM only |
| `PUT` | `/api/maps/:id/layers/order` | Reorder all layers | DM only |
| `POST` | `/api/layers/:id/images` | Place map image on layer | DM only |
| `PATCH` | `/api/images/:id` | Update image position/size | DM only |
| `DELETE` | `/api/images/:id` | Remove image from layer | DM only |
| `POST` | `/api/layers/:id/tokens` | Create token | DM only |
| `PATCH` | `/api/tokens/:id` | Update token (position, bars, status, etc.) | DM or owner |
| `DELETE` | `/api/tokens/:id` | Delete token | DM only |
| `POST` | `/api/layers/:id/drawings` | Create drawing | DM only |
| `PATCH` | `/api/drawings/:id` | Update drawing | DM only |
| `DELETE` | `/api/drawings/:id` | Delete drawing | DM only |

### WebSocket Message Types

New variants added to the existing `ClientMessage` / `ServerMessage` enums from SP-0:

**Client → Server:**
- `MoveToken { token_id, x, y }` — token position update
- `UpdateToken { token_id, patch }` — token property changes (bars, status, name, size)
- `CreateDrawing { layer_id, drawing }` — new drawing object
- `DeleteDrawing { drawing_id }` — remove drawing
- `ReorderLayers { map_id, layer_ids }` — new layer order
- `PlaceMapImage { layer_id, asset_id, position }` — place image on layer

**Server → Client:**
- `TokenMoved { token_id, x, y, moved_by }` — broadcast token move
- `TokenUpdated { token_id, patch, updated_by }` — broadcast token changes
- `DrawingCreated { layer_id, drawing }` — broadcast new drawing
- `DrawingDeleted { drawing_id }` — broadcast drawing removal
- `LayerUpdated { layer }` — broadcast layer changes (reorder, visibility, etc.)
- `MapImagePlaced { layer_id, image }` — broadcast image placement

### Design Decisions

- **Token bars as JSONB** — always loaded with the token, max 3 bars, doesn't justify a separate table
- **Drawing points as JSONB** — freehand strokes have variable-length point arrays (hundreds of points), poor fit for relational columns
- **Map images reference SP-0 assets** via `asset_id` — no duplicate storage
- **REST for persistence, WebSocket for broadcast** — SP-1 persists via REST API; SP-2 will unify real-time mutations through WebSocket. For SP-1, REST-first is simpler and the WebSocket messages prepare the interface SP-2 will use.

---

## Performance Strategy

### Rendering Performance

- **Viewport culling** — only objects within visible bounds (+margin) in the render tree. Off-screen Containers set to `visible = false`.
- **Texture atlas** — status marker icons packed into a single sprite sheet, one draw call for all markers on screen
- **Shared textures** — tokens using the same asset share one GPU texture via PixiJS texture cache
- **Lazy image loading** — map images decoded and uploaded to GPU only when their layer is visible and overlaps viewport. Large maps (4000x4000+) load progressively.
- **Grid rendering** — grid drawn as a single Graphics object covering only visible cells, redrawn on viewport change (not per-frame). Cached as a render texture when static.
- **Drawing batching** — static drawings (not being actively edited) rendered to a cached render texture per layer. Only re-rasterized when a drawing on that layer changes.

### Interaction Performance

- **Token drag at 60fps** — during drag, only the dragged token's position updates per frame. Ghost/snap preview is a lightweight sprite.
- **Freehand smoothing** — Ramer-Douglas-Peucker simplification after stroke ends, reducing point count by 60–80%
- **Throttled state updates** — during continuous interactions (drag, draw), Zustand store updates throttled to ~30Hz. PixiJS renders at 60fps from interpolated local state.

### Scale Targets

- **Smooth 60fps:** 100+ tokens visible, 10 layers, 4000×4000px map image, active drawing
- **Acceptable 30fps+:** 200+ tokens, 20 layers, 8000×8000px map image
- Validated via performance test suite (PixiJS headless rendering benchmarks)

### Memory Management

- Textures evicted from GPU when layers are hidden or maps are switched
- Asset images cached in browser via HTTP caching headers (SP-0 asset serving)
- Maximum texture size detected on init — warn DM if map image exceeds device GPU limits

---

## Testing Strategy

### Unit Tests (Rust)

- Map CRUD: creation, settings update, deletion cascades layers/tokens/drawings
- Layer operations: create, reorder, toggle visibility, lock, delete with cascade
- Token CRUD: creation with bars/status, position updates, ownership validation
- Drawing CRUD: creation with various types, point serialization, deletion
- Permission checks: player cannot create layers/tokens/drawings, player can move owned tokens

### Unit Tests (Frontend — Vitest)

- Grid coordinate math: pixel-to-grid conversion, grid-to-pixel, snap calculations
- Diagonal distance: verify all three diagonal modes produce correct distances
- Drawing point simplification: Ramer-Douglas-Peucker produces expected output
- AoE template math: cone/cube/sphere/line affected-square calculations
- Zustand stores: mapStore, tokenStore, toolStore, drawingStore state transitions

### Integration Tests (Rust — against PostgreSQL)

- Full map lifecycle: create campaign → create map → add layers → place tokens → update positions → delete map (cascade)
- Token ownership: DM creates token with player owner → player can update position → player cannot delete → DM can delete
- Layer ordering: create multiple layers → reorder → verify sort_order consistency
- Map image placement: upload asset → place on layer → verify asset reference → delete image → asset still exists

### End-to-End Tests (Playwright)

- **Map creation:** DM creates a map → configures grid settings → verifies canvas renders with grid
- **Map image:** DM uploads map image via asset library → places on map layer → verifies it displays on canvas
- **Token placement:** DM creates token from asset → places on map → verifies it renders at correct grid position
- **Token movement:** DM drags token → verifies new position → player moves own token → verifies position update
- **Token bars/status:** DM sets HP bar → verifies bar renders below token → toggles status marker → verifies icon appears
- **Layer management:** DM creates new layer → reorders layers → toggles visibility → verifies canvas updates
- **Drawing tools:** DM selects freehand → draws on canvas → selects rectangle → draws shape → verifies objects persist
- **AoE templates:** DM selects cone template → places on grid → verifies affected squares highlighted
- **Measurement:** DM uses ruler → verifies distance display → uses waypoint path → verifies running total
- **Grid modes:** DM switches between grid-enabled and gridless → verifies grid overlay toggles
- **Permissions:** Player cannot access layer panel, map settings, or DM-only drawing tools

### Visual Regression Tests (Playwright Screenshots)

- Grid rendering at various zoom levels
- Token rendering with bars and status markers
- AoE template overlays on grid
- Layer compositing (multiple map images stacked)

---

## Accessibility

Building on the SP-0 accessibility foundation:

- **Toolbar keyboard navigation** — all tools selectable via keyboard shortcuts (documented, configurable)
- **Token keyboard control** — arrow keys to move selected token by one grid square, with audible/visual snap confirmation
- **Screen reader announcements** — token selection ("Selected: Goblin 1, HP 15/20, poisoned"), measurement results ("Distance: 30 feet"), drawing tool activation
- **Canvas focus indicator** — visible focus ring when canvas has keyboard focus
- **High contrast grid** — grid color automatically adjusts for contrast against map image (or uses DM-configured color)
- **Parallel DOM** — off-screen DOM elements describing token positions and states for screen reader access (pattern established in SP-0, extended here with token/layer data)

---

## SP-1 Deliverable

When SP-1 is complete:

1. DM creates a map with a configurable square grid (or gridless)
2. DM uploads and positions map images on layers
3. DM manages an arbitrary layer stack (create, reorder, hide, lock, DM-only)
4. DM places tokens on the grid — sized 1x1 through 4x4, with HP bars and status markers
5. Players see the flattened map and can move their own tokens
6. DM uses drawing tools (freehand, shapes, polygon) and AoE templates (cone, cube, sphere, line)
7. DM and players measure distances with ruler, waypoint paths, and AoE previews
8. Everything renders at 60fps with 100+ tokens and large map images
9. All functionality covered by unit, integration, e2e, and visual regression tests

The map is ready for SP-2 (real-time sync) and SP-5 (dynamic lighting & fog of war) to build on.
