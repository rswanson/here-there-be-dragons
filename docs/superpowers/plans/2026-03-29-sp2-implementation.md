# SP-2: Real-Time Sync & Session Infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the multiplayer sync backbone — session management, WebSocket broadcast, and client-side message dispatch — so that actions by one connected user are immediately visible to all other users in the same campaign.

**Architecture:** Server-side `SessionManager` holds per-campaign sessions with a `SessionBroadcaster` trait (defaulting to in-memory `tokio::broadcast` channels). WebSocket connections route by campaign ID. Mutations persist to PostgreSQL then broadcast deltas. Client-side `MessageDispatcher` routes server messages to Zustand stores. Full state reload on reconnect.

**Tech Stack:** Rust (Axum, tokio, sqlx, serde, ts-rs, async-trait), React 19 + TypeScript (Zustand 5, Vite 8), PostgreSQL, Playwright (multi-browser-context E2E)

---

## File Structure

### Backend — New Files

| File | Responsibility |
|------|---------------|
| `crates/server/src/session/mod.rs` | Module root — re-exports SessionManager, Session, SessionBroadcaster |
| `crates/server/src/session/broadcaster.rs` | `SessionBroadcaster` trait + `InMemoryBroadcaster` implementation |
| `crates/server/src/session/manager.rs` | `SessionManager` struct — creates/joins/leaves sessions, idle cleanup |
| `crates/server/src/session/types.rs` | `ConnectionHandle`, `ConnectedUser`, session-related types |
| `crates/server/src/routes/state.rs` | `GET /api/maps/{id}/state` composite endpoint |

### Backend — Modified Files

| File | Changes |
|------|---------|
| `crates/htbd-core/src/messages.rs` | Add SP-2 message variants (JoinSession, SessionJoined, UserJoined, UserLeft, FullState, etc.) |
| `crates/htbd-core/src/lib.rs` | Update TS export test for new types |
| `crates/server/src/state.rs` | Add `SessionManager` to `AppState` |
| `crates/server/src/lib.rs` | Add `pub mod session;` |
| `crates/server/src/main.rs` | Initialize `SessionManager`, add to `AppState` |
| `crates/server/src/routes/mod.rs` | Mount state route, update WS route to `/ws/{campaign_id}` |
| `crates/server/src/routes/ws.rs` | Full rewrite — campaign-scoped connection, message dispatch, broadcast integration |
| `crates/server/src/routes/tokens.rs` | Add broadcast side-effect after mutations |
| `crates/server/src/routes/drawings.rs` | Add broadcast side-effect after mutations |
| `crates/server/src/routes/layers.rs` | Add broadcast side-effect after mutations |
| `crates/server/src/routes/map_images.rs` | Add broadcast side-effect after mutations |
| `crates/server/src/routes/maps.rs` | Add state route, broadcast side-effect |

### Frontend — New Files

| File | Responsibility |
|------|---------------|
| `client/src/state/presence.ts` | `usePresenceStore` — connected users, connection state |
| `client/src/api/dispatcher.ts` | `MessageDispatcher` — routes server messages to stores |
| `client/src/api/maps.ts` | Add `getState(mapId)` for composite endpoint (may already exist — extend) |
| `client/src/components/ConnectionStatus.tsx` | Green/yellow/red dot in header |
| `client/src/components/PlayersOnline.tsx` | Connected users list in sidebar |
| `client/src/components/Toast.tsx` | Toast notification for join/leave events |

### Frontend — Modified Files

| File | Changes |
|------|---------|
| `client/src/api/ws.ts` | Campaign-scoped URL, connectionState, reconnect triggers full reload |
| `client/src/state/tokens.ts` | Add `handleServerMessage()` method |
| `client/src/state/drawings.ts` | Add `handleServerMessage()` method |
| `client/src/state/map.ts` | Add `handleServerMessage()` method |
| `client/src/pages/Campaign.tsx` | Initialize WsClient + dispatcher, load state via composite endpoint |
| `client/src/components/Layout.tsx` | Add ConnectionStatus to header |

---

## Chunk 1: Core Message Types & Session Types

### Task 1: Add SP-2 Message Variants to htbd-core

**Files:**
- Modify: `crates/htbd-core/src/messages.rs`
- Modify: `crates/htbd-core/src/lib.rs`

- [ ] **Step 1: Add new ClientMessage variants**

Add to the existing `ClientMessage` enum in `crates/htbd-core/src/messages.rs`:

```rust
// Add these variants to the existing ClientMessage enum:
    JoinSession {
        campaign_id: Uuid,
    },
    LeaveSession {},
    RequestFullState {
        map_id: Uuid,
    },
```

- [ ] **Step 2: Add ConnectedUser struct**

Add above the `ServerMessage` enum in `crates/htbd-core/src/messages.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ConnectedUser {
    pub user_id: Uuid,
    pub display_name: String,
    pub role: String,
}
```

- [ ] **Step 3: Add new ServerMessage variants**

Add to the existing `ServerMessage` enum in `crates/htbd-core/src/messages.rs`:

```rust
// Add these variants to the existing ServerMessage enum:
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
        map: crate::map::Map,
        layers: Vec<crate::map::MapLayer>,
        tokens: Vec<crate::token::Token>,
        drawings: Vec<crate::drawing::Drawing>,
    },
```

- [ ] **Step 4: Add MapFullState type for the REST endpoint**

Add to `crates/htbd-core/src/map.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MapFullState {
    pub map: Map,
    pub layers: Vec<MapLayer>,
    pub tokens: Vec<crate::token::Token>,
    pub drawings: Vec<crate::drawing::Drawing>,
}
```

- [ ] **Step 5: Update TS export test**

In the `#[test]` function in `crates/htbd-core/src/lib.rs`, add exports for new types:

```rust
    ConnectedUser::export_all().unwrap();
    MapFullState::export_all().unwrap();
```

- [ ] **Step 6: Run tests to generate TS bindings**

```bash
cargo test --workspace
```

Expected: All tests pass, new `.ts` files generated in `crates/htbd-core/bindings/`.

- [ ] **Step 7: Copy generated types to client**

```bash
cp crates/htbd-core/bindings/ConnectedUser.ts client/src/types/
cp crates/htbd-core/bindings/MapFullState.ts client/src/types/
```

- [ ] **Step 8: Commit**

```bash
git add crates/htbd-core/ client/src/types/
git commit -m "feat(core): add SP-2 session and presence message types"
```

---

## Chunk 2: SessionBroadcaster Trait & InMemoryBroadcaster

### Task 2: Create session module with broadcaster trait

**Files:**
- Create: `crates/server/src/session/mod.rs`
- Create: `crates/server/src/session/types.rs`
- Create: `crates/server/src/session/broadcaster.rs`
- Modify: `crates/server/src/lib.rs`

- [ ] **Step 1: Add async-trait dependency**

In workspace `Cargo.toml`, add under `[workspace.dependencies]`:

```toml
async-trait = "0.1"
```

In `crates/server/Cargo.toml`, add under `[dependencies]`:

```toml
async-trait = { workspace = true }
```

- [ ] **Step 2: Create session types**

Create `crates/server/src/session/types.rs`:

```rust
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use uuid::Uuid;

use htbd_core::messages::ServerMessage;
use htbd_core::models::CampaignRole;

/// A handle to a single WebSocket connection. Messages sent here
/// are forwarded to the client by the WebSocket task.
#[derive(Debug, Clone)]
pub struct ConnectionHandle {
    pub user_id: Uuid,
    pub display_name: String,
    pub role: CampaignRole,
    pub tx: mpsc::UnboundedSender<ServerMessage>,
}

/// Info about a connected user (for presence lists).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectedUserInfo {
    pub user_id: Uuid,
    pub display_name: String,
    pub role: CampaignRole,
}
```

- [ ] **Step 3: Create SessionBroadcaster trait**

Create `crates/server/src/session/broadcaster.rs`:

```rust
use async_trait::async_trait;
use uuid::Uuid;

use htbd_core::messages::ServerMessage;
use htbd_core::models::CampaignRole;

use super::types::ConnectionHandle;

/// Abstraction over how messages are delivered to session members.
/// The default `InMemoryBroadcaster` sends directly via mpsc channels.
/// A future `RedisBroadcaster` could publish to a shared bus instead.
#[async_trait]
pub trait SessionBroadcaster: Send + Sync {
    /// Broadcast a message to all connections in a session.
    /// If `exclude` is Some, skip that user (e.g. the sender).
    async fn broadcast(
        &self,
        connections: &[ConnectionHandle],
        message: &ServerMessage,
        exclude: Option<Uuid>,
    );

    /// Send a message to a specific user's connections.
    async fn send_to(
        &self,
        connections: &[ConnectionHandle],
        user_id: Uuid,
        message: &ServerMessage,
    );
}

/// Sends messages directly to connection handles via their mpsc channels.
/// No external broker — works for single-server deployments.
pub struct InMemoryBroadcaster;

#[async_trait]
impl SessionBroadcaster for InMemoryBroadcaster {
    async fn broadcast(
        &self,
        connections: &[ConnectionHandle],
        message: &ServerMessage,
        exclude: Option<Uuid>,
    ) {
        for conn in connections {
            if exclude == Some(conn.user_id) {
                continue;
            }
            // Filter dm_only content for non-DM users happens at a higher level.
            // The broadcaster sends whatever it receives.
            let _ = conn.tx.send(message.clone());
        }
    }

    async fn send_to(
        &self,
        connections: &[ConnectionHandle],
        user_id: Uuid,
        message: &ServerMessage,
    ) {
        for conn in connections {
            if conn.user_id == user_id {
                let _ = conn.tx.send(message.clone());
            }
        }
    }
}
```

- [ ] **Step 4: Create session module root**

Create `crates/server/src/session/mod.rs`:

```rust
pub mod broadcaster;
pub mod manager;
pub mod types;

pub use broadcaster::{InMemoryBroadcaster, SessionBroadcaster};
pub use manager::SessionManager;
pub use types::{ConnectionHandle, ConnectedUserInfo};
```

- [ ] **Step 5: Add session module to server lib**

In `crates/server/src/lib.rs`, add:

```rust
pub mod session;
```

- [ ] **Step 6: Verify it compiles**

```bash
cargo check -p server
```

Expected: Compiles (manager module is referenced but empty — create a placeholder).

Create placeholder `crates/server/src/session/manager.rs`:

```rust
pub struct SessionManager;
```

- [ ] **Step 7: Commit**

```bash
git add crates/server/src/session/ crates/server/src/lib.rs Cargo.toml crates/server/Cargo.toml
git commit -m "feat(server): add SessionBroadcaster trait and InMemoryBroadcaster"
```

---

### Task 3: Implement SessionManager

**Files:**
- Modify: `crates/server/src/session/manager.rs`
- Modify: `crates/server/src/state.rs`
- Modify: `crates/server/src/main.rs`

- [ ] **Step 1: Write SessionManager**

Replace `crates/server/src/session/manager.rs`:

```rust
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::{mpsc, RwLock};
use uuid::Uuid;

use htbd_core::messages::{ConnectedUser, ServerMessage};
use htbd_core::models::CampaignRole;

use super::broadcaster::SessionBroadcaster;
use super::types::{ConnectedUserInfo, ConnectionHandle};

const IDLE_TIMEOUT: Duration = Duration::from_secs(60);

/// Per-campaign session holding connected clients.
struct Session {
    campaign_id: Uuid,
    /// All active connections grouped by user. A user may have multiple
    /// connections (e.g. two browser tabs).
    connections: HashMap<Uuid, Vec<ConnectionHandle>>,
    /// Cached roles — avoids re-querying the DB on every message.
    roles: HashMap<Uuid, CampaignRole>,
    last_activity: Instant,
}

impl Session {
    fn new(campaign_id: Uuid) -> Self {
        Self {
            campaign_id,
            connections: HashMap::new(),
            roles: HashMap::new(),
            last_activity: Instant::now(),
        }
    }

    fn touch(&mut self) {
        self.last_activity = Instant::now();
    }

    /// Flat list of all connection handles across all users.
    fn all_connections(&self) -> Vec<ConnectionHandle> {
        self.connections.values().flatten().cloned().collect()
    }

    /// List of unique connected users (for presence).
    fn connected_users(&self) -> Vec<ConnectedUser> {
        self.connections
            .keys()
            .filter_map(|uid| {
                let conns = self.connections.get(uid)?;
                let first = conns.first()?;
                Some(ConnectedUser {
                    user_id: *uid,
                    display_name: first.display_name.clone(),
                    role: format!("{:?}", first.role).to_lowercase(),
                })
            })
            .collect()
    }

    fn is_empty(&self) -> bool {
        self.connections.is_empty()
    }

    fn is_idle(&self) -> bool {
        self.is_empty() && self.last_activity.elapsed() > IDLE_TIMEOUT
    }
}

/// Manages all active campaign sessions. Stored in AppState as `Arc<SessionManager>`.
pub struct SessionManager {
    sessions: RwLock<HashMap<Uuid, Session>>,
    broadcaster: Arc<dyn SessionBroadcaster>,
}

impl SessionManager {
    pub fn new(broadcaster: Arc<dyn SessionBroadcaster>) -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            broadcaster,
        }
    }

    /// Add a connection to a campaign session. Creates the session if it
    /// doesn't exist. Returns the current connected-user list for the
    /// `SessionJoined` response.
    pub async fn join(
        &self,
        campaign_id: Uuid,
        user_id: Uuid,
        display_name: String,
        role: CampaignRole,
        tx: mpsc::UnboundedSender<ServerMessage>,
    ) -> (Vec<ConnectedUser>, bool) {
        let mut sessions = self.sessions.write().await;
        let session = sessions
            .entry(campaign_id)
            .or_insert_with(|| Session::new(campaign_id));

        session.touch();
        session.roles.insert(user_id, role.clone());

        let is_new_user = !session.connections.contains_key(&user_id);

        let handle = ConnectionHandle {
            user_id,
            display_name,
            role,
            tx,
        };

        session
            .connections
            .entry(user_id)
            .or_default()
            .push(handle);

        let users = session.connected_users();
        (users, is_new_user)
    }

    /// Remove a specific connection. Returns true if this was the user's
    /// last connection (triggers `UserLeft` broadcast).
    pub async fn leave(
        &self,
        campaign_id: Uuid,
        user_id: Uuid,
        tx_ptr: usize, // pointer identity to find the right handle
    ) -> bool {
        let mut sessions = self.sessions.write().await;
        let Some(session) = sessions.get_mut(&campaign_id) else {
            return false;
        };

        session.touch();

        let was_last = if let Some(conns) = session.connections.get_mut(&user_id) {
            conns.retain(|c| {
                // Compare by sender pointer identity
                let ptr = &c.tx as *const _ as usize;
                ptr != tx_ptr
            });
            if conns.is_empty() {
                session.connections.remove(&user_id);
                session.roles.remove(&user_id);
                true
            } else {
                false
            }
        } else {
            false
        };

        was_last
    }

    /// Broadcast a message to all members of a campaign session.
    pub async fn broadcast(
        &self,
        campaign_id: Uuid,
        message: &ServerMessage,
        exclude: Option<Uuid>,
    ) {
        let sessions = self.sessions.read().await;
        if let Some(session) = sessions.get(&campaign_id) {
            let conns = session.all_connections();
            self.broadcaster.broadcast(&conns, message, exclude).await;
        }
    }

    /// Send a message to a specific user in a campaign session.
    pub async fn send_to(
        &self,
        campaign_id: Uuid,
        user_id: Uuid,
        message: &ServerMessage,
    ) {
        let sessions = self.sessions.read().await;
        if let Some(session) = sessions.get(&campaign_id) {
            let conns = session.all_connections();
            self.broadcaster.send_to(&conns, user_id, message).await;
        }
    }

    /// Get the cached role for a user in a session.
    pub async fn get_role(
        &self,
        campaign_id: Uuid,
        user_id: Uuid,
    ) -> Option<CampaignRole> {
        let sessions = self.sessions.read().await;
        sessions
            .get(&campaign_id)
            .and_then(|s| s.roles.get(&user_id).cloned())
    }

    /// Clean up idle sessions. Call this periodically from a background task.
    pub async fn cleanup_idle(&self) {
        let mut sessions = self.sessions.write().await;
        sessions.retain(|_, session| !session.is_idle());
    }

    /// Get connected users for a campaign (for presence).
    pub async fn connected_users(&self, campaign_id: Uuid) -> Vec<ConnectedUser> {
        let sessions = self.sessions.read().await;
        sessions
            .get(&campaign_id)
            .map(|s| s.connected_users())
            .unwrap_or_default()
    }
}
```

- [ ] **Step 2: Add SessionManager to AppState**

Modify `crates/server/src/state.rs`:

```rust
use std::sync::Arc;

use crate::config::Config;
use crate::session::SessionManager;
use asset_store::StorageBackend;
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Config,
    pub storage: Arc<dyn StorageBackend>,
    pub session_manager: Arc<SessionManager>,
}
```

- [ ] **Step 3: Initialize SessionManager in main.rs**

In `crates/server/src/main.rs`, after creating the storage backend and before building AppState, add:

```rust
    use crate::session::{InMemoryBroadcaster, SessionManager};

    let broadcaster = Arc::new(InMemoryBroadcaster);
    let session_manager = Arc::new(SessionManager::new(broadcaster));

    // Spawn idle session cleanup task (runs every 30 seconds)
    {
        let sm = session_manager.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(30));
            loop {
                interval.tick().await;
                sm.cleanup_idle().await;
            }
        });
    }
```

And update the `AppState` construction to include `session_manager`.

- [ ] **Step 4: Verify it compiles**

```bash
cargo check --workspace
```

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/session/ crates/server/src/state.rs crates/server/src/main.rs
git commit -m "feat(server): implement SessionManager with idle cleanup"
```

---

## Chunk 3: WebSocket Handler Rewrite

### Task 4: Rewrite WebSocket handler with session integration

**Files:**
- Modify: `crates/server/src/routes/ws.rs`
- Modify: `crates/server/src/routes/mod.rs`

- [ ] **Step 1: Rewrite WebSocket handler**

Replace `crates/server/src/routes/ws.rs` entirely:

```rust
use axum::{
    extract::{
        ws::{Message, WebSocket},
        Path, State, WebSocketUpgrade,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use uuid::Uuid;

use htbd_core::messages::{ClientMessage, ServerMessage};
use htbd_core::models::CampaignRole;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;

pub async fn ws_upgrade(
    ws: WebSocketUpgrade,
    auth: AuthUser,
    State(state): State<AppState>,
    Path(campaign_id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    // Verify campaign membership before upgrading
    let role = db::campaigns::get_member_role(&state.pool, &campaign_id, &auth.user_id)
        .await?
        .ok_or(AppError::Forbidden("Not a member of this campaign".into()))?;

    let user = db::users::find_by_id(&state.pool, &auth.user_id)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(ws.on_upgrade(move |socket| {
        handle_socket(
            socket,
            state,
            campaign_id,
            auth.user_id,
            user.display_name,
            role,
        )
    }))
}

async fn handle_socket(
    socket: WebSocket,
    state: AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    display_name: String,
    role: CampaignRole,
) {
    let (mut ws_sink, mut ws_stream) = socket.split();

    // Channel for outbound messages to this connection
    let (tx, mut rx) = mpsc::unbounded_channel::<ServerMessage>();
    let tx_ptr = &tx as *const _ as usize;

    // Join the session
    let (connected_users, is_new_user) = state
        .session_manager
        .join(campaign_id, user_id, display_name.clone(), role.clone(), tx)
        .await;

    // Send SessionJoined to this client
    let joined_msg = ServerMessage::SessionJoined {
        user_id,
        campaign_id,
        connected_users,
    };
    let _ = ws_sink
        .send(Message::Text(serde_json::to_string(&joined_msg).unwrap().into()))
        .await;

    // Broadcast UserJoined to others (only if this is a new unique user)
    if is_new_user {
        let user_joined = ServerMessage::UserJoined {
            user_id,
            display_name: display_name.clone(),
        };
        state
            .session_manager
            .broadcast(campaign_id, &user_joined, Some(user_id))
            .await;
    }

    // Task: forward outbound messages from channel to WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let text = serde_json::to_string(&msg).unwrap();
            if ws_sink.send(Message::Text(text.into())).await.is_err() {
                break;
            }
        }
    });

    // Process inbound messages
    while let Some(Ok(msg)) = ws_stream.next().await {
        match msg {
            Message::Text(text) => {
                if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(&text) {
                    handle_client_message(
                        &state,
                        campaign_id,
                        user_id,
                        &role,
                        client_msg,
                    )
                    .await;
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    // Client disconnected — leave session
    let was_last = state
        .session_manager
        .leave(campaign_id, user_id, tx_ptr)
        .await;

    if was_last {
        let user_left = ServerMessage::UserLeft {
            user_id,
            display_name,
        };
        state
            .session_manager
            .broadcast(campaign_id, &user_left, None)
            .await;
    }

    send_task.abort();
}

async fn handle_client_message(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: &CampaignRole,
    msg: ClientMessage,
) {
    match msg {
        ClientMessage::Ping => {
            state
                .session_manager
                .send_to(campaign_id, user_id, &ServerMessage::Pong)
                .await;
        }
        ClientMessage::MoveToken { token_id, x, y } => {
            // Validate ownership
            let auth_info = db::tokens::get_token_auth_info(&state.pool, &token_id).await;
            let allowed = match (role, &auth_info) {
                (CampaignRole::Dm, _) => true,
                (_, Some((_layer_id, Some(owner_id)))) => *owner_id == user_id,
                _ => false,
            };
            if !allowed {
                return;
            }
            // Persist
            let _ = db::tokens::update_token_position(&state.pool, &token_id, x, y).await;
            // Broadcast to all
            let msg = ServerMessage::TokenMoved {
                token_id,
                x,
                y,
                moved_by: user_id,
            };
            state
                .session_manager
                .broadcast(campaign_id, &msg, None)
                .await;
        }
        // Other SP-1 message types will be handled via REST + broadcast
        // (create/update/delete go through REST endpoints which trigger broadcast)
        _ => {}
    }
}
```

- [ ] **Step 2: Update route mounting**

In `crates/server/src/routes/mod.rs`, change the WebSocket route from:

```rust
.nest("/ws", ws::ws_routes())
```

to:

```rust
.route("/ws/{campaign_id}", axum::routing::get(ws::ws_upgrade))
```

- [ ] **Step 3: Verify it compiles**

```bash
cargo check -p server
```

Fix any import issues. The `db::users::find_by_id` and `db::campaigns::get_member_role` functions need to exist. Check if `find_by_id` exists in `crates/db/src/users.rs` — if not, add it:

```rust
pub async fn find_by_id(pool: &PgPool, id: &Uuid) -> Result<Option<UserRow>, sqlx::Error> {
    sqlx::query_as!(
        UserRow,
        "SELECT id, email, display_name, created_at FROM users WHERE id = $1",
        id
    )
    .fetch_optional(pool)
    .await
}
```

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/routes/ws.rs crates/server/src/routes/mod.rs crates/db/src/users.rs
git commit -m "feat(server): rewrite WebSocket handler with session routing and broadcast"
```

---

## Chunk 4: REST Broadcast Side-Effects

### Task 5: Add broadcast to token mutation routes

**Files:**
- Modify: `crates/server/src/routes/tokens.rs`

- [ ] **Step 1: Add broadcast after token creation**

In the `create_token` handler, after the DB insert succeeds and before returning the JSON response, add:

```rust
    // Broadcast to session
    let campaign_id = db::map_layers::get_map_id_for_layer(&state.pool, &layer_id)
        .await?
        .and_then(|map_id_val| {
            // We need campaign_id — get it from the map
            // For now, we can get it from the auth context
            None::<Uuid> // placeholder
        });
    // Better approach: look up campaign_id from the layer → map → campaign chain
    let map_id = db::map_layers::get_map_id_for_layer(&state.pool, &layer_id).await?;
    if let Some(map_id) = map_id {
        if let Some(map_row) = db::maps::find_by_id(&state.pool, &map_id).await? {
            let msg = ServerMessage::TokenCreated {
                layer_id,
                token: token.clone(),
                created_by: auth.user_id,
            };
            state.session_manager.broadcast(map_row.campaign_id, &msg, None).await;
        }
    }
```

- [ ] **Step 2: Add broadcast after token update**

In the `update_token` handler, after the DB update, add similar broadcast logic:

```rust
    if let Some(ref updated) = updated_token {
        let layer_id = updated.layer_id;
        let map_id = db::map_layers::get_map_id_for_layer(&state.pool, &layer_id).await?;
        if let Some(map_id) = map_id {
            if let Some(map_row) = db::maps::find_by_id(&state.pool, &map_id).await? {
                let msg = ServerMessage::TokenUpdated {
                    token_id: id,
                    patch: req.clone(),
                    updated_by: auth.user_id,
                };
                state.session_manager.broadcast(map_row.campaign_id, &msg, None).await;
            }
        }
    }
```

- [ ] **Step 3: Add broadcast after token delete**

Similarly for `delete_token`:

```rust
    // Before deleting, get the campaign_id
    if let Some((layer_id, _owner_id)) = db::tokens::get_token_auth_info(&state.pool, &id).await {
        let map_id = db::map_layers::get_map_id_for_layer(&state.pool, &layer_id).await?;
        if let Some(map_id) = map_id {
            if let Some(map_row) = db::maps::find_by_id(&state.pool, &map_id).await? {
                let deleted = db::tokens::delete_token(&state.pool, &id).await?;
                if deleted {
                    let msg = ServerMessage::TokenDeleted {
                        token_id: id,
                        deleted_by: auth.user_id,
                    };
                    state.session_manager.broadcast(map_row.campaign_id, &msg, None).await;
                }
                return Ok(StatusCode::NO_CONTENT.into_response());
            }
        }
    }
```

- [ ] **Step 4: Verify it compiles**

```bash
cargo check -p server
```

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/routes/tokens.rs
git commit -m "feat(server): add WebSocket broadcast to token mutation routes"
```

### Task 6: Add broadcast to drawing, layer, and map image routes

**Files:**
- Modify: `crates/server/src/routes/drawings.rs`
- Modify: `crates/server/src/routes/layers.rs`
- Modify: `crates/server/src/routes/map_images.rs`

- [ ] **Step 1: Add helper to resolve campaign_id from layer_id**

Add to `crates/server/src/routes/guards.rs`:

```rust
/// Resolve campaign_id from a layer_id by traversing layer → map → campaign.
pub async fn get_campaign_id_for_layer(
    state: &AppState,
    layer_id: &Uuid,
) -> Result<Option<Uuid>, AppError> {
    let map_id = db::map_layers::get_map_id_for_layer(&state.pool, layer_id).await?;
    if let Some(map_id) = map_id {
        if let Some(map_row) = db::maps::find_by_id(&state.pool, &map_id).await? {
            return Ok(Some(map_row.campaign_id));
        }
    }
    Ok(None)
}
```

- [ ] **Step 2: Add broadcast to drawing routes**

In each handler in `drawings.rs` (`create_drawing`, `update_drawing`, `delete_drawing`), after the DB mutation, add:

```rust
    if let Some(campaign_id) = get_campaign_id_for_layer(&state, &layer_id).await? {
        let msg = ServerMessage::DrawingCreated { layer_id, drawing: drawing.clone() };
        state.session_manager.broadcast(campaign_id, &msg, None).await;
    }
```

(Adjust message variant for update/delete.)

- [ ] **Step 3: Add broadcast to layer routes**

In `layers.rs` handlers, after mutations:

```rust
    // For layer updates, broadcast LayerUpdated
    if let Some(campaign_id) = get_campaign_id_for_layer(&state, &layer_id).await? {
        let msg = ServerMessage::LayerUpdated { layer: updated_layer.clone() };
        state.session_manager.broadcast(campaign_id, &msg, None).await;
    }
```

- [ ] **Step 4: Add broadcast to map image routes**

In `map_images.rs` handlers, after mutations:

```rust
    if let Some(campaign_id) = get_campaign_id_for_layer(&state, &layer_id).await? {
        let msg = ServerMessage::MapImagePlaced { layer_id, image: image.clone() };
        state.session_manager.broadcast(campaign_id, &msg, None).await;
    }
```

- [ ] **Step 5: Verify and commit**

```bash
cargo check -p server
git add crates/server/src/routes/
git commit -m "feat(server): add WebSocket broadcast to drawing, layer, and map image routes"
```

---

## Chunk 5: Composite State Endpoint

### Task 7: Implement GET /api/maps/{id}/state

**Files:**
- Create: `crates/server/src/routes/state.rs`
- Modify: `crates/server/src/routes/mod.rs`
- Modify: `crates/db/src/tokens.rs`
- Modify: `crates/db/src/drawings.rs`

- [ ] **Step 1: Add list_for_map DB queries**

In `crates/db/src/tokens.rs`, add:

```rust
pub async fn list_for_map(pool: &PgPool, map_id: &Uuid) -> Result<Vec<TokenRow>, sqlx::Error> {
    sqlx::query_as!(
        TokenRow,
        r#"SELECT t.id, t.layer_id, t.name, t.asset_id, t.owner_id,
                  t.x, t.y, t.size, t.rotation,
                  t.bars_json, t.status_markers, t.created_at, t.updated_at
           FROM tokens t
           JOIN map_layers l ON t.layer_id = l.id
           WHERE l.map_id = $1
           ORDER BY t.created_at ASC"#,
        map_id
    )
    .fetch_all(pool)
    .await
}

pub async fn list_for_map_player(pool: &PgPool, map_id: &Uuid) -> Result<Vec<TokenRow>, sqlx::Error> {
    sqlx::query_as!(
        TokenRow,
        r#"SELECT t.id, t.layer_id, t.name, t.asset_id, t.owner_id,
                  t.x, t.y, t.size, t.rotation,
                  t.bars_json, t.status_markers, t.created_at, t.updated_at
           FROM tokens t
           JOIN map_layers l ON t.layer_id = l.id
           WHERE l.map_id = $1 AND l.dm_only = false
           ORDER BY t.created_at ASC"#,
        map_id
    )
    .fetch_all(pool)
    .await
}
```

In `crates/db/src/drawings.rs`, add similarly:

```rust
pub async fn list_for_map(pool: &PgPool, map_id: &Uuid) -> Result<Vec<DrawingRow>, sqlx::Error> {
    sqlx::query_as!(
        DrawingRow,
        r#"SELECT d.id, d.layer_id, d.drawing_type, d.points,
                  d.stroke_color, d.stroke_width, d.stroke_opacity,
                  d.fill_color, d.fill_opacity, d.created_at
           FROM drawings d
           JOIN map_layers l ON d.layer_id = l.id
           WHERE l.map_id = $1
           ORDER BY d.created_at ASC"#,
        map_id
    )
    .fetch_all(pool)
    .await
}

pub async fn list_for_map_player(pool: &PgPool, map_id: &Uuid) -> Result<Vec<DrawingRow>, sqlx::Error> {
    sqlx::query_as!(
        DrawingRow,
        r#"SELECT d.id, d.layer_id, d.drawing_type, d.points,
                  d.stroke_color, d.stroke_width, d.stroke_opacity,
                  d.fill_color, d.fill_opacity, d.created_at
           FROM drawings d
           JOIN map_layers l ON d.layer_id = l.id
           WHERE l.map_id = $1 AND l.dm_only = false
           ORDER BY d.created_at ASC"#,
        map_id
    )
    .fetch_all(pool)
    .await
}
```

- [ ] **Step 2: Create the state route**

Create `crates/server/src/routes/state.rs`:

```rust
use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

use htbd_core::map::MapFullState;
use htbd_core::models::CampaignRole;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;

use super::guards::require_member;

pub async fn get_map_state(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<MapFullState>, AppError> {
    let map_row = db::maps::find_by_id(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;

    let role = require_member(&state, map_row.campaign_id, auth.user_id).await?;

    let is_dm = role == CampaignRole::Dm;

    let layers = if is_dm {
        db::map_layers::list_for_map(&state.pool, &id).await?
    } else {
        db::map_layers::list_for_map_player(&state.pool, &id).await?
    };

    let tokens = if is_dm {
        db::tokens::list_for_map(&state.pool, &id).await?
    } else {
        db::tokens::list_for_map_player(&state.pool, &id).await?
    };

    let drawings = if is_dm {
        db::drawings::list_for_map(&state.pool, &id).await?
    } else {
        db::drawings::list_for_map_player(&state.pool, &id).await?
    };

    Ok(Json(MapFullState {
        map: map_row.into(),
        layers: layers.into_iter().map(Into::into).collect(),
        tokens: tokens.into_iter().map(Into::into).collect(),
        drawings: drawings.into_iter().map(Into::into).collect(),
    }))
}
```

- [ ] **Step 3: Mount the route**

In `crates/server/src/routes/mod.rs`, add:

```rust
.route("/maps/{id}/state", axum::routing::get(state::get_map_state))
```

- [ ] **Step 4: Regenerate sqlx offline data**

```bash
cargo sqlx prepare --workspace
```

- [ ] **Step 5: Verify and commit**

```bash
SQLX_OFFLINE=true cargo check --workspace
git add crates/db/ crates/server/src/routes/ .sqlx/
git commit -m "feat(server): add composite GET /api/maps/{id}/state endpoint"
```

---

## Chunk 6: Client — Presence Store & Message Dispatcher

### Task 8: Create usePresenceStore

**Files:**
- Create: `client/src/state/presence.ts`
- Create: `client/src/state/__tests__/presence.test.ts`

- [ ] **Step 1: Write the failing test**

Create `client/src/state/__tests__/presence.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { usePresenceStore } from '../presence'

describe('usePresenceStore', () => {
  beforeEach(() => {
    usePresenceStore.setState({
      connectedUsers: [],
      isConnected: false,
      connectionState: 'disconnected' as const,
    })
  })

  it('handles SessionJoined message', () => {
    usePresenceStore.getState().handleServerMessage({
      type: 'SessionJoined',
      payload: {
        user_id: 'u1',
        campaign_id: 'c1',
        connected_users: [
          { user_id: 'u1', display_name: 'Alice', role: 'dm' },
          { user_id: 'u2', display_name: 'Bob', role: 'player' },
        ],
      },
    })

    const state = usePresenceStore.getState()
    expect(state.connectedUsers).toHaveLength(2)
    expect(state.isConnected).toBe(true)
    expect(state.connectionState).toBe('connected')
  })

  it('handles UserJoined message', () => {
    usePresenceStore.getState().handleServerMessage({
      type: 'SessionJoined',
      payload: {
        user_id: 'u1',
        campaign_id: 'c1',
        connected_users: [{ user_id: 'u1', display_name: 'Alice', role: 'dm' }],
      },
    })

    usePresenceStore.getState().handleServerMessage({
      type: 'UserJoined',
      payload: { user_id: 'u2', display_name: 'Bob' },
    })

    expect(usePresenceStore.getState().connectedUsers).toHaveLength(2)
  })

  it('handles UserLeft message', () => {
    usePresenceStore.getState().handleServerMessage({
      type: 'SessionJoined',
      payload: {
        user_id: 'u1',
        campaign_id: 'c1',
        connected_users: [
          { user_id: 'u1', display_name: 'Alice', role: 'dm' },
          { user_id: 'u2', display_name: 'Bob', role: 'player' },
        ],
      },
    })

    usePresenceStore.getState().handleServerMessage({
      type: 'UserLeft',
      payload: { user_id: 'u2', display_name: 'Bob' },
    })

    expect(usePresenceStore.getState().connectedUsers).toHaveLength(1)
    expect(usePresenceStore.getState().connectedUsers[0].user_id).toBe('u1')
  })

  it('setConnectionState updates state', () => {
    usePresenceStore.getState().setConnectionState('connecting')
    expect(usePresenceStore.getState().connectionState).toBe('connecting')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd client && npm run test -- --run src/state/__tests__/presence.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement usePresenceStore**

Create `client/src/state/presence.ts`:

```typescript
import { create } from 'zustand'
import type { ConnectedUser } from '../types/ConnectedUser'

type ConnectionState = 'connecting' | 'connected' | 'disconnected'

interface PresenceState {
  connectedUsers: ConnectedUser[]
  isConnected: boolean
  connectionState: ConnectionState

  handleServerMessage: (msg: { type: string; payload: Record<string, unknown> }) => void
  setConnectionState: (state: ConnectionState) => void
  reset: () => void
}

export const usePresenceStore = create<PresenceState>()((set) => ({
  connectedUsers: [],
  isConnected: false,
  connectionState: 'disconnected' as ConnectionState,

  handleServerMessage: (msg) => {
    switch (msg.type) {
      case 'SessionJoined':
        set({
          connectedUsers: msg.payload.connected_users as ConnectedUser[],
          isConnected: true,
          connectionState: 'connected',
        })
        break
      case 'UserJoined':
        set((s) => ({
          connectedUsers: [
            ...s.connectedUsers,
            {
              user_id: msg.payload.user_id as string,
              display_name: msg.payload.display_name as string,
              role: 'player',
            },
          ],
        }))
        break
      case 'UserLeft':
        set((s) => ({
          connectedUsers: s.connectedUsers.filter(
            (u) => u.user_id !== msg.payload.user_id,
          ),
        }))
        break
    }
  },

  setConnectionState: (connectionState) =>
    set({
      connectionState,
      isConnected: connectionState === 'connected',
    }),

  reset: () =>
    set({
      connectedUsers: [],
      isConnected: false,
      connectionState: 'disconnected',
    }),
}))
```

- [ ] **Step 4: Run tests**

```bash
cd client && npm run test -- --run src/state/__tests__/presence.test.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/state/presence.ts client/src/state/__tests__/presence.test.ts
git commit -m "feat(client): add usePresenceStore for connection presence"
```

### Task 9: Create MessageDispatcher

**Files:**
- Create: `client/src/api/dispatcher.ts`
- Create: `client/src/api/__tests__/dispatcher.test.ts`

- [ ] **Step 1: Write the failing test**

Create `client/src/api/__tests__/dispatcher.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMessageDispatcher } from '../dispatcher'
import { useTokenStore } from '../../state/tokens'
import { usePresenceStore } from '../../state/presence'

describe('MessageDispatcher', () => {
  beforeEach(() => {
    useTokenStore.setState({ tokens: [], selectedIds: [] })
    usePresenceStore.setState({
      connectedUsers: [],
      isConnected: false,
      connectionState: 'disconnected',
    })
  })

  it('routes TokenMoved to token store', () => {
    // Pre-load a token
    useTokenStore.getState().loadTokens([
      { id: 't1', layer_id: 'l1', name: 'Test', x: 0, y: 0, size: 1 } as any,
    ])

    const dispatch = createMessageDispatcher()
    dispatch({ type: 'TokenMoved', payload: { token_id: 't1', x: 5, y: 3, moved_by: 'u1' } })

    const token = useTokenStore.getState().tokens.find((t) => t.id === 't1')
    expect(token?.x).toBe(5)
    expect(token?.y).toBe(3)
  })

  it('routes SessionJoined to presence store', () => {
    const dispatch = createMessageDispatcher()
    dispatch({
      type: 'SessionJoined',
      payload: {
        user_id: 'u1',
        campaign_id: 'c1',
        connected_users: [{ user_id: 'u1', display_name: 'Alice', role: 'dm' }],
      },
    })

    expect(usePresenceStore.getState().isConnected).toBe(true)
    expect(usePresenceStore.getState().connectedUsers).toHaveLength(1)
  })

  it('routes UserJoined to presence store', () => {
    const dispatch = createMessageDispatcher()
    dispatch({
      type: 'SessionJoined',
      payload: { user_id: 'u1', campaign_id: 'c1', connected_users: [] },
    })
    dispatch({
      type: 'UserJoined',
      payload: { user_id: 'u2', display_name: 'Bob' },
    })

    expect(usePresenceStore.getState().connectedUsers).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd client && npm run test -- --run src/api/__tests__/dispatcher.test.ts
```

- [ ] **Step 3: Implement MessageDispatcher**

Create `client/src/api/dispatcher.ts`:

```typescript
import { useTokenStore } from '../state/tokens'
import { useDrawingStore } from '../state/drawings'
import { useMapStore } from '../state/map'
import { usePresenceStore } from '../state/presence'

type ServerMsg = { type: string; payload: Record<string, unknown> }

/**
 * Creates a dispatch function that routes server messages to the
 * appropriate Zustand store. Subscribe this to WsClient.
 *
 * Extension point: SP-4 adds chat cases, SP-5 adds lighting cases.
 */
export function createMessageDispatcher(): (msg: ServerMsg) => void {
  return (msg: ServerMsg) => {
    switch (msg.type) {
      // Token messages
      case 'TokenMoved':
        useTokenStore.getState().moveToken(
          msg.payload.token_id as string,
          msg.payload.x as number,
          msg.payload.y as number,
        )
        break
      case 'TokenCreated':
        useTokenStore.getState().addToken(msg.payload.token as any)
        break
      case 'TokenUpdated':
        useTokenStore.getState().updateToken(
          msg.payload.token_id as string,
          msg.payload.patch as any,
        )
        break
      case 'TokenDeleted':
        useTokenStore.getState().removeToken(msg.payload.token_id as string)
        break

      // Drawing messages
      case 'DrawingCreated':
        useDrawingStore.getState().addDrawing(msg.payload.drawing as any)
        break
      case 'DrawingUpdated':
        useDrawingStore.getState().updateDrawing(
          msg.payload.drawing_id as string,
          msg.payload.patch as any,
        )
        break
      case 'DrawingDeleted':
        useDrawingStore.getState().removeDrawing(msg.payload.drawing_id as string)
        break

      // Map/layer messages
      case 'LayerUpdated':
        useMapStore.getState().updateLayer(
          (msg.payload.layer as any).id,
          msg.payload.layer as any,
        )
        break
      case 'MapImagePlaced':
      case 'MapImageUpdated':
      case 'MapImageDeleted':
      case 'LayersReordered':
        // These trigger a full map reload for simplicity
        break

      // Presence messages
      case 'SessionJoined':
      case 'UserJoined':
      case 'UserLeft':
        usePresenceStore.getState().handleServerMessage(msg)
        break

      case 'Pong':
        break // no-op

      case 'FullState':
        // Handled separately by reconnect logic
        break
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd client && npm run test -- --run src/api/__tests__/dispatcher.test.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/api/dispatcher.ts client/src/api/__tests__/dispatcher.test.ts
git commit -m "feat(client): add MessageDispatcher to route server messages to stores"
```

---

## Chunk 7: Client — WsClient Upgrade & Campaign Integration

### Task 10: Upgrade WsClient for campaign-scoped connections

**Files:**
- Modify: `client/src/api/ws.ts`

- [ ] **Step 1: Update WsClient**

Modify `client/src/api/ws.ts` to accept a campaign ID and expose connection state:

```typescript
import type { ClientMessage } from '../types/ClientMessage'
import type { ServerMessage } from '../types/ServerMessage'
import { usePresenceStore } from '../state/presence'

type MessageHandler = (msg: { type: string; payload: Record<string, unknown> }) => void

export class WsClient {
  private ws: WebSocket | null = null
  private handlers: Set<MessageHandler> = new Set()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private intentionalClose = false
  private campaignId: string | null = null
  private onReconnect: (() => void) | null = null

  connect(campaignId: string, onReconnect?: () => void) {
    this.campaignId = campaignId
    this.onReconnect = onReconnect ?? null
    this.intentionalClose = false
    usePresenceStore.getState().setConnectionState('connecting')

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/api/ws/${campaignId}`
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      usePresenceStore.getState().setConnectionState('connected')
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        for (const handler of this.handlers) {
          handler(msg)
        }
      } catch {
        // ignore malformed messages
      }
    }

    this.ws.onclose = () => {
      if (!this.intentionalClose && this.campaignId) {
        usePresenceStore.getState().setConnectionState('disconnected')
        this.reconnectTimer = setTimeout(() => {
          if (this.campaignId) {
            this.connect(this.campaignId, this.onReconnect ?? undefined)
            // Trigger full state reload after reconnect
            if (this.onReconnect) {
              // Wait for connection to establish before reloading
              setTimeout(() => this.onReconnect?.(), 1000)
            }
          }
        }, 3000)
      }
    }

    this.ws.onerror = () => {
      // onclose will fire after onerror
    }
  }

  send(message: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  disconnect() {
    this.intentionalClose = true
    this.campaignId = null
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
    usePresenceStore.getState().reset()
  }
}

export const wsClient = new WsClient()
```

- [ ] **Step 2: Verify it compiles**

```bash
cd client && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add client/src/api/ws.ts
git commit -m "feat(client): upgrade WsClient for campaign-scoped connections"
```

### Task 11: Integrate WebSocket into Campaign page

**Files:**
- Modify: `client/src/pages/Campaign.tsx`
- Modify: `client/src/api/maps.ts`

- [ ] **Step 1: Add getMapState to maps API**

In `client/src/api/maps.ts`, add:

```typescript
  getState: (mapId: string) =>
    request<MapFullState>(`/maps/${mapId}/state`),
```

Add the import: `import type { MapFullState } from '../types/MapFullState'`

- [ ] **Step 2: Update Campaign page to use WebSocket + composite state loading**

In `client/src/pages/Campaign.tsx`, update the map loading effect to use the composite endpoint and initialize the WebSocket connection:

```typescript
import { wsClient } from '../api/ws'
import { createMessageDispatcher } from '../api/dispatcher'
import { mapsApi } from '../api/maps'

// Inside the Campaign component, add WebSocket lifecycle:
useEffect(() => {
  if (!id) return

  const dispatch = createMessageDispatcher()
  const unsub = wsClient.subscribe(dispatch)
  wsClient.connect(id, () => {
    // On reconnect: reload current map state
    if (selectedMapId) {
      mapsApi.getState(selectedMapId).then((data) => {
        loadMap(data.map, data.layers)
        loadTokens(data.tokens)
        loadDrawings(data.drawings)
      })
    }
  })

  return () => {
    unsub()
    wsClient.disconnect()
  }
}, [id])

// Update the map selection effect to use composite endpoint:
useEffect(() => {
  if (!selectedMapId) return
  let cancelled = false
  const load = async () => {
    const data = await mapsApi.getState(selectedMapId)
    if (cancelled) return
    loadMap(data.map, data.layers)
    loadTokens(data.tokens)
    loadDrawings(data.drawings)
  }
  void load()
  return () => { cancelled = true }
}, [selectedMapId, loadMap, loadTokens, loadDrawings])
```

- [ ] **Step 3: Verify it compiles**

```bash
cd client && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Campaign.tsx client/src/api/maps.ts
git commit -m "feat(client): integrate WebSocket and composite state loading in Campaign page"
```

---

## Chunk 8: UI Components — Connection Status & Presence

### Task 12: Add ConnectionStatus indicator

**Files:**
- Create: `client/src/components/ConnectionStatus.tsx`
- Modify: `client/src/components/Layout.tsx`

- [ ] **Step 1: Create ConnectionStatus component**

Create `client/src/components/ConnectionStatus.tsx`:

```typescript
import { usePresenceStore } from '../state/presence'

const STATE_COLORS = {
  connected: '#22c55e',
  connecting: '#eab308',
  disconnected: '#ef4444',
}

const STATE_LABELS = {
  connected: 'Connected',
  connecting: 'Reconnecting...',
  disconnected: 'Disconnected',
}

export function ConnectionStatus() {
  const connectionState = usePresenceStore((s) => s.connectionState)

  // Don't show anything if not in a session
  if (connectionState === 'disconnected') return null

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
      title={STATE_LABELS[connectionState]}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: STATE_COLORS[connectionState],
        }}
        aria-label={STATE_LABELS[connectionState]}
      />
      <span style={{ color: 'var(--color-text-secondary)' }}>
        {STATE_LABELS[connectionState]}
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Add to Layout header**

In `client/src/components/Layout.tsx`, import and render `<ConnectionStatus />` in the header bar next to the user display name.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ConnectionStatus.tsx client/src/components/Layout.tsx
git commit -m "feat(ui): add connection status indicator to header"
```

### Task 13: Add PlayersOnline sidebar panel

**Files:**
- Create: `client/src/components/PlayersOnline.tsx`
- Modify: `client/src/pages/Campaign.tsx`

- [ ] **Step 1: Create PlayersOnline component**

Create `client/src/components/PlayersOnline.tsx`:

```typescript
import { usePresenceStore } from '../state/presence'

export function PlayersOnline() {
  const connectedUsers = usePresenceStore((s) => s.connectedUsers)
  const isConnected = usePresenceStore((s) => s.isConnected)

  if (!isConnected) return null

  return (
    <div
      style={{
        background: 'var(--color-surface, #2a2a3e)',
        borderRadius: 8,
        padding: 12,
        marginTop: 8,
      }}
    >
      <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--color-text, #e0e0e0)' }}>
        Players Online ({connectedUsers.length})
      </h4>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {connectedUsers.map((user) => (
          <li
            key={user.user_id}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text, #e0e0e0)' }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#22c55e',
                flexShrink: 0,
              }}
            />
            <span>{user.display_name}</span>
            {user.role === 'dm' && (
              <span
                style={{
                  fontSize: 10,
                  background: 'var(--color-primary, #6366f1)',
                  color: '#fff',
                  padding: '1px 4px',
                  borderRadius: 3,
                }}
              >
                DM
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Add PlayersOnline to Campaign sidebar**

In `client/src/pages/Campaign.tsx`, import and render `<PlayersOnline />` in the right sidebar below the map selector.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/PlayersOnline.tsx client/src/pages/Campaign.tsx
git commit -m "feat(ui): add PlayersOnline sidebar panel"
```

---

## Chunk 9: Backend Integration Tests

### Task 14: Write backend integration tests for session lifecycle and broadcast

**Files:**
- Create: `crates/server/tests/websocket.rs`

- [ ] **Step 1: Write integration tests**

Create `crates/server/tests/websocket.rs` with tests covering:

1. **Session join:** Connect to `/api/ws/{campaign_id}`, receive `SessionJoined` with connected users
2. **Presence broadcast:** Two clients connect, second receives `UserJoined` for first, and vice versa
3. **Token move broadcast:** Client A sends `MoveToken`, Client B receives `TokenMoved`
4. **Disconnect presence:** Client disconnects, other client receives `UserLeft`
5. **Permission denied:** Non-member attempts WebSocket connection, gets rejected
6. **Full state endpoint:** `GET /api/maps/{id}/state` returns composite state with DM filtering

Each test should:
- Set up test DB with users, campaign, membership, map
- Start the Axum test server
- Use `tokio-tungstenite` for WebSocket clients
- Assert message types and payloads

- [ ] **Step 2: Run tests**

```bash
cargo test -p server --test websocket
```

- [ ] **Step 3: Commit**

```bash
git add crates/server/tests/websocket.rs
git commit -m "test(server): add integration tests for WebSocket sessions and broadcast"
```

---

## Chunk 10: Playwright E2E Tests

### Task 15: Write multi-browser-context E2E tests

**Files:**
- Create: `client/e2e/sync.spec.ts`
- Create: `client/e2e/presence.spec.ts`

- [ ] **Step 1: Create sync E2E test**

Create `client/e2e/sync.spec.ts` testing:

1. Two browser contexts register, one creates campaign, other joins via invite code
2. DM creates a map, both users select it
3. DM places a token (via REST), player sees it appear
4. Player disconnects and reconnects, still sees the token

- [ ] **Step 2: Create presence E2E test**

Create `client/e2e/presence.spec.ts` testing:

1. Two users connect to same campaign
2. Both see "Players Online" panel with both users listed
3. One user disconnects, other sees the player list update

- [ ] **Step 3: Run E2E tests**

```bash
cd client && npx playwright test e2e/sync.spec.ts e2e/presence.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add client/e2e/sync.spec.ts client/e2e/presence.spec.ts
git commit -m "test(e2e): add multi-browser sync and presence tests"
```

---

## Chunk 11: Visual Regression & Polish

### Task 16: Add visual regression tests for presence UI

**Files:**
- Create: `client/e2e/visual-regression-sp2.spec.ts`

- [ ] **Step 1: Create visual regression tests**

Capture snapshots for:
- Connection status dot (connected state)
- Players Online panel with 2+ users
- Campaign sidebar with presence indicators

- [ ] **Step 2: Run and update snapshots**

```bash
cd client && npx playwright test e2e/visual-regression-sp2.spec.ts --update-snapshots
```

- [ ] **Step 3: Commit**

```bash
git add client/e2e/visual-regression-sp2.spec.ts client/e2e/visual-regression-sp2.spec.ts-snapshots/
git commit -m "test(e2e): add SP-2 visual regression snapshots"
```

### Task 17: Pre-push verification

- [ ] **Step 1: Run all backend checks**

```bash
cargo fmt --all -- --check
SQLX_OFFLINE=true cargo clippy --workspace -- -D warnings
SQLX_OFFLINE=true cargo test --workspace
```

- [ ] **Step 2: Run all frontend checks**

```bash
cd client && npm run lint
cd client && npm run build
cd client && npm run test -- --run
```

- [ ] **Step 3: Run E2E tests**

```bash
cd client && npx playwright test
```

All checks must pass before pushing.
