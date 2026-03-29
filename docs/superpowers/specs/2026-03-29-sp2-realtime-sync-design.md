# SP-2: Real-Time Sync & Session Infrastructure — Design Spec

The multiplayer backbone for Here There Be Dragons — how clients stay in sync, how sessions are managed, and how game state flows between connected players in real time.

**Parent spec:** [Here There Be Dragons Design Spec](2026-03-15-here-there-be-dragons-design.md)
**Roadmap:** [Phase 1 Roadmap](../plans/2026-03-15-phase1-roadmap.md)
**Dependencies:** SP-0 (Tech Stack & Foundation)
**Consumers:** SP-1 (Grid & Map — first integration target), SP-4 (Chat), SP-5 (Lighting/Fog), SP-6 (Audio/Video)

---

## Scope

SP-2 delivers the real-time sync infrastructure that makes the VTT multiplayer. A DM and players connect to the same campaign session, and actions by one user (moving a token, placing a drawing, changing a layer) are immediately visible to all other connected users. State persists between sessions — closing the browser and coming back later picks up where you left off.

**In scope:**
- WebSocket session routing by campaign
- Real-time broadcast of state deltas to connected clients
- Last-write-wins conflict resolution (server-authoritative)
- Full state reload on reconnect
- Connection presence (who's online)
- DM/player permission filtering on broadcasts
- `SessionBroadcaster` trait for future pub/sub migration
- Composite state endpoint for efficient loading
- Optimistic client updates with server correction
- Multi-tab support (same user, multiple connections)

**Out of scope (later sub-projects):**
- Chat messages and initiative tracker (SP-4)
- Per-token vision and lighting sync (SP-5)
- Audio/video peer discovery (SP-6)
- Rich presence (cursors, viewport indicators)
- Horizontal scaling / multi-server (future, enabled by `SessionBroadcaster` trait)

---

## Architecture

### Three Layers

SP-2 adds a session layer between the existing transport and persistence layers:

```
┌─────────────────────────────────────────────────┐
│  Transport Layer                                 │
│  WebSocket connection mgmt, JWT auth, routing    │
│  /api/ws/{campaign_id}                           │
├─────────────────────────────────────────────────┤
│  Session Layer                                   │
│  SessionManager → Session per campaign           │
│  Validates, persists, broadcasts via trait        │
│  InMemoryBroadcaster (tokio::broadcast channels) │
├─────────────────────────────────────────────────┤
│  Persistence Layer                               │
│  Existing sqlx repositories (maps, tokens, etc.) │
│  PostgreSQL — eager writes on every mutation      │
└─────────────────────────────────────────────────┘
```

### SessionBroadcaster Trait

The broadcast mechanism is behind a trait so the in-memory implementation can be swapped for a pub/sub broker (Redis, NATS) later without changing consumers:

```rust
#[async_trait]
pub trait SessionBroadcaster: Send + Sync {
    /// Broadcast a message to all members of a session, optionally excluding one user.
    async fn broadcast(&self, session_id: Uuid, message: ServerMessage, exclude: Option<Uuid>);
    /// Send a message to a specific user in a session.
    async fn send_to(&self, session_id: Uuid, user_id: Uuid, message: ServerMessage);
}
```

The default implementation (`InMemoryBroadcaster`) uses `tokio::sync::broadcast` channels per session. Each WebSocket connection holds a receiver for its session's channel. The broadcaster filters messages by recipient role before sending (DM-only content is stripped from player broadcasts).

### SessionManager

```
SessionManager (Arc<RwLock<...>>, stored in Axum AppState)
├── sessions: HashMap<CampaignId, Session>
│
Session
├── campaign_id: Uuid
├── connections: HashMap<UserId, Vec<ConnectionHandle>>
├── roles: HashMap<UserId, CampaignRole>  // cached from DB on join
├── broadcaster: Arc<dyn SessionBroadcaster>
└── last_activity: Instant
```

- Sessions are created lazily on first connection to a campaign
- Sessions persist in memory for 60 seconds after the last user disconnects (grace period for page refreshes)
- Multiple connections per user are supported (multiple tabs). Presence tracks unique users, not connections.
- `UserLeft` only fires when a user's last connection drops

### Connection Flow

1. Client opens WebSocket to `/api/ws/{campaign_id}`
2. Server validates JWT via existing `AuthUser` middleware
3. Server verifies campaign membership via `db::campaigns::get_member_role()`
4. `SessionManager` creates or joins the session, caches user role
5. Server sends `SessionJoined { user_id, campaign_id, connected_users }` to the new client
6. Server broadcasts `UserJoined { user_id, display_name }` to other session members
7. Client loads full state via `GET /api/maps/{id}/state`
8. Client is now live — incoming deltas update stores in real time

---

## Message Protocol

All messages are defined in `htbd-core/src/messages.rs` with the existing `serde(tag = "type", content = "payload")` pattern and auto-exported to TypeScript via `ts-rs`.

### New ClientMessage Variants

| Variant | Payload | Purpose |
|---------|---------|---------|
| `JoinSession` | `{ campaign_id }` | Confirms client readiness after WebSocket open |
| `LeaveSession` | `{}` | Graceful disconnect |
| `RequestFullState` | `{ map_id }` | Request state snapshot (reconnect) |

### New ServerMessage Variants

| Variant | Payload | Purpose |
|---------|---------|---------|
| `SessionJoined` | `{ user_id, campaign_id, connected_users }` | Join acknowledgment with presence |
| `UserJoined` | `{ user_id, display_name }` | Broadcast on connect |
| `UserLeft` | `{ user_id, display_name }` | Broadcast on disconnect |
| `FullState` | `{ map, layers, tokens, drawings }` | Complete state for reconnect |
| `Error` | `{ code, message }` | Structured error (permission denied, not found) |

### Existing SP-1 Messages (Now Live)

These are already defined but only stubbed in SP-1. SP-2 wires them to actually broadcast:

- `TokenCreated`, `TokenMoved`, `TokenUpdated`, `TokenDeleted`
- `DrawingCreated`, `DrawingUpdated`, `DrawingDeleted`
- `MapImagePlaced`, `MapImageUpdated`, `MapImageDeleted`
- `LayersReordered`

Each includes a `*_by: Uuid` field for attribution (who made this change).

### Message Flow: Token Move

1. Player sends `MoveToken { token_id, x, y }` via WebSocket
2. Server validates: is the token owned by this player (or is user DM)? Is the layer unlocked?
3. Server persists: `db::tokens::update_position(token_id, x, y)`
4. Server broadcasts: `TokenMoved { token_id, x, y, moved_by }` to all session members
5. Each client's `MessageDispatcher` routes to `useTokenStore.handleServerMessage()`
6. Store applies the position update → React re-render + PixiJS canvas update

### DM Filtering

Before broadcasting, the session layer checks each recipient's cached role. Content from `dm_only` layers is stripped from messages sent to players. This filtering happens inside the `SessionBroadcaster` implementation — it receives the full message and the recipient list with roles.

Specifically filtered:
- Tokens on `dm_only` layers: `TokenCreated`, `TokenMoved`, `TokenUpdated` suppressed for players
- Drawings on `dm_only` layers: same treatment
- Layer metadata: `dm_only` flag and layer content hidden from players
- `FullState` response: `dm_only` layers and their content excluded for players

---

## Conflict Resolution

**Strategy: Last-write-wins, server-authoritative.**

When two clients modify the same state simultaneously:
1. Both messages arrive at the server
2. Server processes them sequentially (tokio task serialization per session)
3. Each mutation persists to DB, overwriting the previous value
4. Each mutation broadcasts to all clients
5. All clients converge on the last-written value

There is no version numbering, vector clocks, or merge logic. The server processes messages in arrival order, and the last one wins. This is the simplest correct approach for a VTT where:
- Conflicts are rare (players typically control different tokens)
- The DM can always manually correct any state
- Sub-second convergence is acceptable

**Optimistic updates on the client:** The local client applies changes immediately for responsiveness. When the server broadcast arrives, the client compares: if the values match (common case — no conflict), it's a no-op. If they differ (conflict), the server's version overwrites the local state. This produces a brief visual "snap" on conflict, which is acceptable given conflict rarity.

---

## REST API Changes

### New Endpoint

`GET /api/maps/{id}/state` — Composite endpoint returning full map state in one response:

```json
{
  "map": { "id": "...", "name": "...", "grid_size_px": 70, ... },
  "layers": [ { "id": "...", "name": "Background", "layer_type": "background", ... } ],
  "tokens": [ { "id": "...", "name": "Ironclad", "x": 4, "y": 3, ... } ],
  "drawings": [ { "id": "...", "drawing_type": "freehand", ... } ]
}
```

Filtered by role — players receive only non-`dm_only` content. Used on initial connect and reconnect.

### Modified Mutation Endpoints

Existing REST mutation endpoints (`POST /layers/{id}/tokens`, `PATCH /tokens/{id}`, `DELETE /tokens/{id}`, etc.) gain a broadcast side-effect: after persisting to DB, they publish the delta to the `SessionBroadcaster`. This ensures mutations from REST and WebSocket both result in real-time broadcasts.

### Mutation Path Split

| Operation | Transport | Reason |
|-----------|-----------|--------|
| Move token | WebSocket only | High frequency during drag, latency-sensitive |
| Create/update/delete token | REST → WS broadcast | Infrequent, benefits from REST error handling |
| Create/update/delete drawing | REST → WS broadcast | Same |
| Layer CRUD, map settings | REST → WS broadcast | DM-only, infrequent |
| Map image operations | REST → WS broadcast | File upload involved |

---

## Client Integration

### New Store: `usePresenceStore`

```typescript
interface PresenceState {
  connectedUsers: Array<{ user_id: string; display_name: string; role: string }>
  isConnected: boolean
  connectionState: 'connecting' | 'connected' | 'disconnected'
  handleServerMessage: (msg: ServerMessage) => void
}
```

Updated by `SessionJoined`, `UserJoined`, `UserLeft` messages.

### MessageDispatcher

A single function subscribes to `WsClient` and routes messages to the appropriate store. This is the extension point for future sub-projects:

```typescript
function createMessageDispatcher(wsClient: WsClient): void {
  wsClient.subscribe((msg) => {
    switch (msg.type) {
      case 'TokenMoved':
      case 'TokenCreated':
      case 'TokenUpdated':
      case 'TokenDeleted':
        useTokenStore.getState().handleServerMessage(msg)
        break
      case 'DrawingCreated':
      case 'DrawingUpdated':
      case 'DrawingDeleted':
        useDrawingStore.getState().handleServerMessage(msg)
        break
      case 'UserJoined':
      case 'UserLeft':
      case 'SessionJoined':
        usePresenceStore.getState().handleServerMessage(msg)
        break
      case 'LayersReordered':
      case 'MapImagePlaced':
      case 'MapImageUpdated':
      case 'MapImageDeleted':
        useMapStore.getState().handleServerMessage(msg)
        break
      // SP-4 will add: ChatMessage, WhisperMessage, etc.
      // SP-5 will add: LightingUpdate, FogReveal, etc.
    }
  })
}
```

### Modified Stores

Existing stores (`useTokenStore`, `useDrawingStore`, `useMapStore`) each gain a `handleServerMessage(msg)` method that applies server deltas. This replaces the current pattern of loading state only from REST responses.

### Optimistic Updates

When the local user performs an action:
1. Store updates immediately (existing behavior — snappy UX)
2. WebSocket message sent to server
3. Server broadcast arrives back
4. Store compares: if values match the optimistic update, no-op. If different (conflict), server version overwrites.

Dedup is by comparing field values, not message IDs — simpler and sufficient for last-write-wins.

### Modified WsClient

- Connect URL changes from `/api/ws` to `/api/ws/{campaign_id}`
- Reconnect logic triggers full state reload via `GET /api/maps/{id}/state`
- Exposes `connectionState` observable for UI binding

### UI Additions

- **Connection status dot** in the header bar (green = connected, yellow = reconnecting, red = disconnected)
- **Players online list** in the campaign sidebar showing connected users with role badges
- **Toast notifications** on player join/leave ("Player X joined the session")

---

## Reconnect Handling

**Strategy: Full state reload.**

On disconnect:
1. `WsClient` detects `onclose` event
2. UI shows "Reconnecting..." indicator (yellow dot)
3. Exponential backoff reconnect attempts (existing logic, starting at 1s)

On reconnect:
1. WebSocket reconnects to `/api/ws/{campaign_id}`
2. Server re-adds connection to session, sends `SessionJoined` with current presence
3. Client fetches `GET /api/maps/{id}/state` for the currently viewed map
4. Stores are replaced with fresh server state
5. Canvas re-renders from updated stores
6. UI shows "Connected" (green dot)

No delta replay, no sequence numbers. Full reload is fast enough for VTT-scale data (hundreds of objects, not millions) and eliminates an entire class of ordering bugs.

---

## Session Persistence

Sessions are not explicitly "created" or "ended" — they emerge from connections.

- **Active session:** At least one user connected. In-memory state tracks presence and caches roles.
- **Idle session:** No users connected. Stays in memory for 60 seconds (grace period), then cleaned up.
- **Persistent state:** All game state (maps, tokens, drawings, layers) is in PostgreSQL at all times (eager writes). There is no in-memory-only state that could be lost.
- **Session resume:** When a user reconnects to a campaign (even days later), they load state from PostgreSQL. No separate "save/load" mechanism needed.

The 60-second grace period prevents session churn during common scenarios: page refresh, brief network interruption, switching tabs.

---

## Testing Strategy

### Backend Integration Tests
- Session lifecycle: connect → `SessionJoined` → disconnect → `UserLeft` broadcast
- Multi-client broadcast: two clients connect, one moves token, other receives `TokenMoved`
- Permission filtering: player doesn't receive `dm_only` layer content in broadcasts or `FullState`
- Reconnect: client disconnects, another client moves tokens, first client reconnects and loads updated state via REST
- Last-write-wins: two simultaneous moves on same token, both persist, last value is canonical
- Multiple tabs: same user connects twice, `UserJoined` fires once, `UserLeft` fires when both disconnect
- Session cleanup: all users disconnect, session persists for 60s, then cleaned up
- Invalid access: non-member tries to connect, gets rejected

### Frontend Unit Tests
- `usePresenceStore`: `handleServerMessage` for `UserJoined`, `UserLeft`, `SessionJoined`
- `MessageDispatcher`: routes each message type to correct store method
- Optimistic update dedup: local move followed by server echo doesn't double-apply
- Conflict resolution: local optimistic update overwritten by different server value
- `WsClient` reconnect: triggers full state reload

### Playwright E2E Tests (Multi-Browser Context)
- Two browser contexts connect to the same campaign
- Player A moves a token, Player B sees it move
- DM creates a `dm_only` layer with tokens, player doesn't see them
- Player disconnects, DM moves tokens, player reconnects and sees updated positions
- Connection presence: Player B joins, Player A sees updated player list
- Simultaneous edits: both players move different tokens, both updates visible to both

### Visual Regression Tests
- Connection status indicator states (connected, reconnecting, disconnected)
- Players online sidebar panel with multiple users
- Toast notification appearance on player join/leave

---

## Extension Points for Future Sub-Projects

The `MessageDispatcher` switch statement is the primary extension point:

- **SP-4 (Chat):** Add `ChatMessage`, `WhisperMessage`, `InitiativeUpdate` cases → route to `useChatStore`
- **SP-5 (Lighting/Fog):** Add `LightingUpdate`, `FogReveal`, `WallChanged` cases → route to `useLightingStore`
- **SP-6 (Audio/Video):** Use session presence for peer discovery. WebRTC signaling messages can flow through the same WebSocket.

The `SessionBroadcaster` trait is the scaling extension point:
- **Horizontal scaling:** Replace `InMemoryBroadcaster` with `RedisBroadcaster` or `NatsBroadcaster`. Same trait interface, same consumer code, different transport.
