# SP-5: Dynamic Lighting & Fog of War — Design Spec

The advanced rendering layer for Here There Be Dragons — wall geometry, line-of-sight raycasting, light sources, fog of war, and per-token vision. Players see only what their tokens can see. DMs see everything and control fog reveals.

**Parent spec:** [Here There Be Dragons Design Spec](2026-03-15-here-there-be-dragons-design.md)
**Roadmap:** [Phase 1 Roadmap](../plans/2026-03-15-phase1-roadmap.md)
**Dependencies:** SP-1 (Grid & Map Rendering Engine), SP-2 (Real-Time Sync & Session Infrastructure)

---

## Scope

SP-5 adds vision, lighting, and fog of war on top of the existing grid/map rendering engine (SP-1) and real-time sync infrastructure (SP-2). A DM places walls and doors on the map, configures token vision and light sources, and players see only what their tokens can see — with fog covering unexplored and out-of-sight areas.

**In scope:**
- Wall placement tools (polyline + rectangle) with grid-intersection snap
- Wall types: wall, door, secret door
- Door states: open, closed, locked — with player interaction
- Light sources on tokens (bright radius, dim radius)
- Token vision properties (vision range, darkvision range, has_vision flag)
- Per-token raycasting visibility (polygon computed client-side)
- Fog of war: three states — unexplored (black), explored (dim), currently visible (clear)
- Manual fog reveal/hide tool for DM
- DM sees everything; fog overlay togglable
- DM player-preview mode (view map as a specific player sees it)
- Bright/dim/dark light levels with gradient rendering
- Real-time updates (token move → vision recalculates → fog updates)
- WebSocket sync for wall, door, fog, and vision state changes
- Visual regression tests (Playwright screenshots for fog/lighting rendering)

**Out of scope (future work):**
- Colored lights / light mixing
- One-way walls (transparent from one side)
- Terrain-based movement cost
- Light source objects independent of tokens (e.g., wall sconces)
- Fog of war import/export
- Vision modes beyond darkvision (tremorsense, blindsight, etc.)

---

## Architecture

### Computation Model: Client-Side Vision

All vision and lighting computation happens client-side in the browser. The server stores and syncs wall, door, and fog state but performs no raycasting.

**Rationale:**
- This is a self-hosted game for friends — cheat-proofing wall geometry is unnecessary
- Instant visual feedback when tokens move is critical for good UX
- Keeps the server simple and stateless for vision
- PixiJS/WebGL renders fog beautifully with masks and shaders
- Matches how Roll20 and Foundry VTT handle it

**Data flow:**
```
Token moves → client raycasts against walls → visibility polygon computed
  → fog overlay mask updated → PixiJS re-renders fog
  → WebSocket broadcasts token position to other clients
  → other clients recompute their own token visibility
```

### Fog of War: Two Layers

Fog of war composes two independent systems:

1. **Manual fog (DM-controlled)** — the DM reveals/hides grid cells with a brush tool. Controls pacing ("you haven't entered the dungeon yet"). Default: all cells unrevealed.
2. **Dynamic lighting (vision-computed)** — each token's raycasted visibility polygon determines what's currently visible. Explored cells (previously visible) stay dimmed.

**Composition formula:**
```
playerSees(cell) = dmRevealed(cell) AND (currentlyVisible(cell) OR previouslyExplored(cell))
```

Where:
- `dmRevealed` — the DM's manual fog layer
- `currentlyVisible` — cell is inside any controlled token's visibility polygon
- `previouslyExplored` — cell was previously visible to any of the player's tokens

### Explored Fog Storage

Explored cells are stored client-side per browser session in a `Set<string>` of `"x,y"` cell keys. When a cell enters a token's visibility polygon, it's added to the explored set. Persisted to `localStorage` keyed by `mapId:userId`. Not synced to server — each player's explored state is their own.

---

## Data Model

### New Table: `walls`

Wall segments belong to a map directly — not to a layer. Walls are structural geometry that blocks vision, not visual content participating in the layer compositing stack.

```sql
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
```

**Coordinates:** Grid-intersection coordinates (integer values when snapped). `(x1, y1)` and `(x2, y2)` define the segment endpoints. Stored as `REAL` to support free-placement (Alt+click bypasses snap).

### New Table: `fog_cells`

Sparse storage of DM-revealed cells. Only stores revealed cells — default state is unrevealed.

```sql
CREATE TABLE fog_cells (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id      UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    x           INTEGER NOT NULL,
    y           INTEGER NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(map_id, x, y)
);

CREATE INDEX idx_fog_cells_map ON fog_cells(map_id);
```

### Token Extensions

Add columns to the existing `tokens` table:

```sql
ALTER TABLE tokens ADD COLUMN has_vision       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tokens ADD COLUMN vision_range      REAL NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN darkvision_range  REAL NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN light_bright      REAL NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN light_dim         REAL NOT NULL DEFAULT 0;
```

- `has_vision` — only tokens with this flag generate visibility polygons. Typically player tokens.
- `vision_range` — how far the token can see in grid squares (in bright/dim light)
- `darkvision_range` — within this range, darkness is treated as dim light (0 = no darkvision)
- `light_bright` — bright light emission radius in grid squares (e.g., torch = 4 squares = 20ft)
- `light_dim` — dim light radius beyond bright (e.g., torch = 4 more squares = 20ft beyond bright)

---

## Wall System

### Wall Types

- **`wall`** — blocks vision and light. Solid line rendered to DM. Invisible to players (walls are structural, not visual).
- **`door`** — blocks vision when closed/locked, transparent when open. Rendered with a hinge icon. DM and players can toggle open/closed.
- **`secret_door`** — looks like a plain wall to players (no visual distinction). DM sees it marked with a dotted line. Only DM can toggle. When the DM opens a secret door, it becomes a visible open door to all players (the secret is revealed). Closing it again returns it to secret (invisible to players).

### Door States

- **`closed`** — blocks vision and light. DM or players can toggle to open.
- **`open`** — vision and light pass through. DM or players can toggle to closed.
- **`locked`** — blocks vision and light. Players cannot open. When a player double-clicks a locked door, a brief lock icon shake/flash appears on the door segment (visible only to that player). DM sees locked doors with a persistent lock icon.
- DM cycles states via right-click context menu: open → closed → locked → open.
- Players can only toggle between open and closed. Locked state is DM-only to set and to clear.

### Wall Placement Tools (DM Only)

**Polyline tool:**
- Click to place vertices, each click extends the chain
- Segments share endpoints — no gaps between adjacent segments
- Double-click or Escape to finish the chain
- Segments snap to grid intersections by default; hold Alt for free placement

**Rectangle tool:**
- Click first corner, click second corner
- Creates 4 wall segments forming a closed room
- Decomposed into 4 independent segments in storage (not a separate shape type)
- Same grid-intersection snap behavior

**Wall editing:**
- Click a wall segment to select it — highlights and shows endpoint handles
- Drag endpoints to reposition
- Delete key removes selected walls
- Right-click context menu: change type (wall/door/secret door), change door state, delete, split at midpoint
- Box-select for batch operations (delete, change type)

### Wall Rendering (DM View Only)

Walls render as colored overlay lines visible only to the DM:
- **Wall:** teal solid line
- **Door (closed):** orange solid line with hinge icon
- **Door (open):** orange dashed line with hinge icon (rotated open)
- **Door (locked):** orange solid line with lock icon
- **Secret door:** purple dotted line (DM only — players see nothing)

Players never see wall geometry directly. They experience walls indirectly through the fog/vision system.

---

## Vision & Raycasting

### Per-Token Vision

Tokens with `has_vision: true` generate a visibility polygon. Typically only player-controlled tokens have vision enabled. The DM sees everything regardless of token vision.

### Raycasting Algorithm

2D raycasting from token center to wall segment endpoints, using the standard Nicky Case / Red Blob Games algorithm:

1. Collect all wall segment endpoints within vision range of the token
2. For each endpoint, cast rays at the exact angle and slightly offset (+/- epsilon) to find shadow boundaries
3. For each ray, find the nearest wall intersection
4. Sort intersection points by angle from token center
5. Connect points to form the visibility polygon
6. Clip the polygon to the vision range circle

Closed/locked doors and walls block rays. Open doors do not. Secret doors always block rays (they function as walls for vision purposes, regardless of state).

### Light Level Computation

Each cell within the visibility polygon is classified into one of three light levels:

- **Bright** — within `light_bright` radius of any light-emitting token visible to this token
- **Dim** — within `light_dim` radius (beyond bright) of any visible light source, OR within `darkvision_range` of this token when the cell would otherwise be dark
- **Dark** — in the visibility polygon but beyond all light and darkvision ranges

### Multi-Token Vision

When a player controls multiple tokens with `has_vision: true` (e.g., a character and a familiar), the final visibility is the union of all their tokens' visibility polygons. Each token computes its own polygon; the renderer unions them for the composite player view.

### Performance

Raycasting runs on token move, wall/door state changes, and light source changes — not every frame. The visibility polygon is cached and only recomputed when:
- A controlled token moves
- A door opens/closes
- Walls are added/removed/modified
- A light source moves or changes radius

For a typical dungeon map (200–400 wall segments), raycasting completes in <2ms per token. With 4 player tokens, that's <8ms total — well within a 16ms frame budget at 60fps.

---

## Fog Rendering (PixiJS/WebGL)

### Rendering Approach

The fog is rendered as a full-map overlay using PixiJS Graphics and masks. Three visual layers compose on top of existing map content:

**Render stack (bottom to top):**
1. Existing map content — map images, tokens, drawings (SP-1)
2. Lighting tint layer — subtle warm/cool color wash over bright/dim areas
3. Fog overlay — semi-transparent black with cutouts for visibility

### Fog Overlay

- A full-screen black rectangle covers the entire map
- The current visibility polygon is cut out using a PixiJS mask (Graphics polygon → mask on the fog container)
- Wall shadow edges are sharp (from the raycast polygon geometry)
- Range-limit edges fade smoothly via radial alpha gradient at the polygon boundary

### Three Visual States

- **Currently visible (in polygon):** fully clear, with bright/dim tinting based on light level
- **Previously explored (not in polygon, in explored set):** dimmed overlay (50% black) — map and grid visible, but tokens and active content hidden
- **Unexplored (never seen, or DM-unrevealed):** near-opaque black (95%) — effectively hidden

### Dim Light Rendering

Cells in the dim zone receive a subtle darkening overlay (20–30% black) to visually distinguish them from bright areas. This creates a visible bright → dim → dark gradient within the visibility polygon.

### Token Visibility in Fog

- Tokens in currently-visible cells: rendered normally
- Tokens in explored-but-not-visible cells: hidden (not rendered)
- Tokens in unexplored cells: hidden
- This is client-side rendering filtering only — tokens remain in the store, just not drawn

### DM Vision Modes

- **DM View (default)** — sees everything, no fog. Wall/door overlay visible. Light source radii shown as faint dashed circles.
- **Player Preview** — DM selects a player from a dropdown in the vision panel. Map renders exactly as that player sees it (their tokens' visibility polygons, fog, current lighting). Wall/door editing overlay remains visible on top for continued editing context. Shows only the player's current visibility (not their explored fog) to keep this simple.
- Quick toggle via keyboard shortcut: `V` cycles DM → Player 1 → Player 2 → ... → DM.

---

## WebSocket Messages & API

### REST Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/api/maps/:id/walls` | List all walls for a map | Campaign members |
| `POST` | `/api/maps/:id/walls` | Create wall(s) — accepts batch | DM only |
| `PATCH` | `/api/walls/:id` | Update wall (endpoints, type, door state) | DM only |
| `DELETE` | `/api/walls/:id` | Delete wall | DM only |
| `GET` | `/api/maps/:id/fog` | Get revealed fog cells | Campaign members |
| `PUT` | `/api/maps/:id/fog` | Batch update fog reveals | DM only |

Token vision fields are updated via the existing `PATCH /api/tokens/:id` endpoint.

### WebSocket Messages

**Client → Server:**
- `CreateWalls { map_id, walls: Vec<Wall> }` — batch create (polyline/rectangle tool produces multiple segments)
- `UpdateWall { wall_id, patch }` — move endpoints, change type
- `DeleteWalls { wall_ids: Vec<Uuid> }` — batch delete
- `ToggleDoor { wall_id }` — player or DM toggles a door
- `RevealFog { map_id, cells: Vec<(i32, i32)>, revealed: bool }` — DM reveals/hides cells
- `UpdateTokenVision { token_id, patch }` — update vision/light properties

**Server → Client:**
- `WallsCreated { map_id, walls, created_by }`
- `WallUpdated { wall_id, patch, updated_by }`
- `WallsDeleted { wall_ids, deleted_by }`
- `DoorToggled { wall_id, door_state, toggled_by }` — triggers vision recalc on all clients
- `DoorLocked { wall_id }` — sent only to the requesting player when they try to open a locked door
- `FogRevealed { map_id, cells, revealed }` — DM fog state changes
- `TokenVisionUpdated { token_id, patch }` — triggers vision recalc

### Door Toggle Authorization

The server enforces door interaction rules:
- Players can toggle doors between open and closed (if within vision — enforced client-side as a UX gate, not server-side)
- Players cannot toggle locked doors — server returns `DoorLocked` to the requesting client
- Players cannot interact with secret doors (they don't know they exist)
- DM can toggle any door to any state

### FullState Extension

The existing `FullState` composite message (from SP-2) is extended to include:
- `walls: Vec<Wall>` — all wall segments for the current map
- `fog_cells: Vec<(i32, i32)>` — DM-revealed fog cell coordinates

Clients receive complete wall and fog data on connect/reconnect.

---

## Client-Side Components

### New Zustand Stores

- **`useWallStore`** — walls array, selectedWallIds, CRUD methods, `handleServerMessage()` for wall/door messages
- **`useFogStore`** — revealedCells `Set<string>` (from server), exploredCells `Set<string>` (from localStorage), DM fog tool state, vision mode (DM view / player preview + which player)
- **`useVisionStore`** — computed visibility polygons per token (cached), light levels per cell, recompute triggers. Subscribes to wallStore, tokenStore, and fogStore, recomputes visibility when any dependency changes.

### New PixiJS Renderers

Following the established Renderer pattern (constructor subscribes to store, `sync()` re-renders on change, `destroy()` cleans up):

- **`WallRenderer`** — renders wall segments as colored lines in DM view. Door icons, secret door markers, lock icons. Hidden in player view except for visible doors within vision polygon.
- **`FogRenderer`** — renders the fog overlay. Manages the visibility polygon mask, explored dim overlay, and unexplored black overlay. Handles the three visual states and gradient edges.
- **`LightRenderer`** — renders light radius indicators (DM view: dashed circles for bright/dim ranges) and bright/dim tint within the visibility polygon.

### New React UI Components

- **`WallToolbar`** — DM-only toolbar section: polyline tool, rectangle tool, wall type selector (wall/door/secret), door state controls
- **`VisionPanel`** — DM-only panel: vision mode dropdown (DM view / player preview), player selector for preview mode, toggle wall overlay visibility
- **`TokenVisionEditor`** — extension to existing Token Inspector: vision range, darkvision range, light bright/dim radius, has_vision toggle
- **`FogTool`** — DM-only: brush to reveal/hide fog cells. Click-drag to paint revealed areas. Toggle between reveal/hide mode.

### Integration with Existing Code

- `CanvasView.tsx` — instantiate WallRenderer, FogRenderer, LightRenderer alongside existing renderers
- `dispatcher.ts` — route new wall/door/fog/vision messages to wallStore and fogStore
- `TokenInteraction.ts` — add door double-click handling (detect click on door segment within token's vision range)
- `Campaign.tsx` — load walls and fog state on mount via extended FullState

---

## Testing Strategy

### Unit Tests (Rust)

- Wall CRUD: creation, batch create, update endpoints, delete cascades with map
- Door state transitions: closed→open, open→closed, closed→locked (DM only), locked→open (DM only)
- Door toggle authorization: player can't toggle locked door, player can't toggle secret door, DM can toggle anything
- Fog cell CRUD: batch reveal, batch hide, idempotent reveals
- Token vision field validation: non-negative ranges, has_vision flag

### Unit Tests (Frontend — Vitest)

- **Raycasting math:** given wall segments and token position, verify computed visibility polygon. Test cases: open room, L-shaped corridor, room with pillar, door open vs closed.
- **Light level computation:** given visibility polygon + light sources, verify cells get correct bright/dim/dark classification
- **Fog composition:** verify `dmRevealed AND (visible OR explored)` logic
- **Multi-token vision union:** two tokens with overlapping visibility → union polygon
- **Wall store:** CRUD operations, server message handling
- **Fog store:** reveal/hide, explored set persistence to localStorage
- **Vision store:** recomputation triggers (token move, door toggle, wall change)

### Integration Tests (Rust — against PostgreSQL)

- Full wall lifecycle: create map → batch create walls → update wall type → delete wall → verify cascade on map delete
- Door toggle flow: create door → player toggles → verify state change → lock door → player toggle fails → DM toggles → succeeds
- Fog lifecycle: reveal cells → query reveals → hide cells → verify state
- Token vision fields: create token with vision → update vision range → verify persistence

### End-to-End Tests (Playwright)

- **Wall placement:** DM activates wall tool → places polyline walls → verifies wall segments render on canvas
- **Rectangle tool:** DM uses rectangle tool → clicks two corners → verifies 4 walls created
- **Door toggle:** DM creates door → player double-clicks door → door opens → verify vision updates
- **Locked door:** DM locks door → player double-clicks → lock indicator appears → door stays closed
- **Fog of war:** DM reveals area with fog tool → player sees revealed area → DM hides area → player sees fog return
- **Token vision:** DM enables vision on player token → player sees visibility polygon → token moves → fog updates
- **Player preview:** DM selects player preview mode → verifies fog renders from player perspective
- **Multi-client vision:** Two browsers — player A moves token → player A's fog updates → player B's view unchanged

### Visual Regression Tests (Playwright Screenshots)

- Fog rendering: visibility polygon with gradient edges
- Light levels: bright/dim/dark zones visible in screenshot
- Wall overlay: wall/door/secret door rendering in DM view
- Door states: open/closed/locked visual indicators
- Explored fog: previously seen areas at 50% dim overlay

---

## Accessibility

### Keyboard Controls

- **Wall tool:** Enter to finish polyline, Escape to cancel, arrow keys to nudge selected wall endpoints by one grid unit
- **Door toggle:** when a door is within the focused token's vision, Tab to cycle through interactable doors, Enter/Space to toggle
- **Fog reveal tool:** arrow keys to move brush position, Space to toggle reveal/hide at cursor

### Screen Reader Announcements (ARIA Live Regions)

- Door state changes: "Door opened" / "Door closed" / "Door is locked"
- Vision changes: "Entering dimly lit area" / "Entering darkness" when token moves between light zones
- Fog reveal: "Area revealed" / "Area hidden" for DM actions

### Parallel DOM

Extending the SP-1 pattern of off-screen DOM elements for screen reader access:
- Wall segments: "Wall from (2,3) to (2,7)" / "Door at (4,3) — closed"
- Interactable doors listed as buttons in the parallel DOM so screen readers can discover and toggle them

### Color Considerations

- Fog dim overlay uses opacity, not color alone — works for all vision types
- Light level indicators use brightness/opacity differences, not color-only differentiation
- Wall type colors (DM view) supplement with distinct shapes/patterns: doors have a hinge icon, secret doors have a dotted line pattern

---

## SP-5 Deliverable

When SP-5 is complete:

1. DM places walls using polyline and rectangle tools, snapped to grid intersections
2. DM sets wall types (wall, door, secret door) and door states (open, closed, locked)
3. Players double-click doors to open/close them; locked doors show a lock indicator
4. DM configures token vision (range, darkvision) and light emission (bright/dim radius)
5. Players see only what their tokens can see — raycast visibility polygon with sharp wall shadows and smooth range fade
6. Fog of war shows three states: unexplored (black), explored (dim), currently visible (clear with lighting)
7. DM manually reveals/hides fog areas with a brush tool
8. DM previews the map as any specific player sees it
9. Light levels (bright/dim/dark) render visually distinct zones; darkvision treats dark as dim
10. All state syncs in real time — door toggles, token moves, and wall edits trigger vision recalculation across clients
11. Full test coverage: unit, integration, e2e, and visual regression tests for all lighting/fog rendering