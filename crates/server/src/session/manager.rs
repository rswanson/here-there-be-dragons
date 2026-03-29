use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use htbd_core::messages::ServerMessage;
use htbd_core::models::CampaignRole;
use tokio::sync::RwLock;
use uuid::Uuid;

use super::broadcaster::SessionBroadcaster;
use super::types::{ConnectedUserInfo, ConnectionHandle};

/// Idle timeout before a session with zero connections is cleaned up.
const SESSION_IDLE_TIMEOUT: Duration = Duration::from_secs(60);

/// A live session for a campaign, tracking all active connections.
struct Session {
    #[allow(dead_code)] // Will be used when sessions need campaign context
    campaign_id: Uuid,
    /// Multiple connections per user (multi-tab support).
    connections: HashMap<Uuid, Vec<ConnectionHandle>>,
    /// Cached role per user.
    roles: HashMap<Uuid, CampaignRole>,
    /// Last time there was any activity (join/leave/message).
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

    /// Collect all ConnectionHandles across all users into a flat Vec.
    fn all_connections(&self) -> Vec<ConnectionHandle> {
        self.connections
            .values()
            .flat_map(|conns| conns.iter().cloned())
            .collect()
    }

    fn touch(&mut self) {
        self.last_activity = Instant::now();
    }
}

/// Manages all active campaign sessions and delegates broadcasting.
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

    /// Add a user connection to a session. Creates the session lazily if needed.
    /// Returns the list of currently connected users (for SessionJoined response).
    /// Broadcasts UserJoined only on the user's *first* connection to this session.
    pub async fn join(&self, campaign_id: Uuid, conn: ConnectionHandle) -> Vec<ConnectedUserInfo> {
        let user_id = conn.user_id;
        let display_name = conn.display_name.clone();
        let role = conn.role;

        let mut sessions = self.sessions.write().await;
        let session = sessions
            .entry(campaign_id)
            .or_insert_with(|| Session::new(campaign_id));
        session.touch();

        let is_first_connection =
            !session.connections.contains_key(&user_id) || session.connections[&user_id].is_empty();

        session.connections.entry(user_id).or_default().push(conn);
        session.roles.insert(user_id, role);

        // Collect connected user info before releasing the lock
        let connected_users: Vec<ConnectedUserInfo> = session
            .connections
            .iter()
            .filter(|(_, conns)| !conns.is_empty())
            .map(|(uid, conns)| {
                let first = &conns[0];
                ConnectedUserInfo {
                    user_id: *uid,
                    display_name: first.display_name.clone(),
                    role: *session.roles.get(uid).unwrap_or(&CampaignRole::Player),
                }
            })
            .collect();

        if is_first_connection {
            let all_conns = session.all_connections();
            // Drop the write lock before broadcasting
            drop(sessions);

            let msg = ServerMessage::UserJoined {
                user_id,
                display_name,
            };
            // Broadcast to everyone except the joining user
            self.broadcaster
                .broadcast(&all_conns, &msg, Some(user_id))
                .await;
        }

        connected_users
    }

    /// Remove a specific connection (identified by connection_id) from a session.
    /// Broadcasts UserLeft only when the user's *last* connection is removed.
    pub async fn leave(&self, campaign_id: Uuid, user_id: Uuid, connection_id: Uuid) {
        let mut sessions = self.sessions.write().await;
        let Some(session) = sessions.get_mut(&campaign_id) else {
            return;
        };
        session.touch();

        let Some(user_conns) = session.connections.get_mut(&user_id) else {
            return;
        };

        // Grab the display_name before we modify the vec
        let display_name = user_conns
            .first()
            .map(|c| c.display_name.clone())
            .unwrap_or_default();

        // Remove the specific connection by connection_id
        user_conns.retain(|c| c.connection_id != connection_id);

        if !user_conns.is_empty() {
            return; // User still has other connections, no UserLeft
        }

        // User's last connection removed
        session.connections.remove(&user_id);
        session.roles.remove(&user_id);

        let all_conns = session.all_connections();
        drop(sessions);

        let msg = ServerMessage::UserLeft {
            user_id,
            display_name,
        };
        self.broadcaster.broadcast(&all_conns, &msg, None).await;
    }

    /// Broadcast a message to all connections in a session, optionally excluding one user.
    pub async fn broadcast(
        &self,
        campaign_id: Uuid,
        message: &ServerMessage,
        exclude: Option<Uuid>,
    ) {
        let sessions = self.sessions.read().await;
        let Some(session) = sessions.get(&campaign_id) else {
            return;
        };
        let all_conns = session.all_connections();
        drop(sessions);

        self.broadcaster
            .broadcast(&all_conns, message, exclude)
            .await;
    }

    /// Send a message to a specific user in a session.
    pub async fn send_to(&self, campaign_id: Uuid, user_id: Uuid, message: &ServerMessage) {
        let sessions = self.sessions.read().await;
        let Some(session) = sessions.get(&campaign_id) else {
            return;
        };
        let all_conns = session.all_connections();
        drop(sessions);

        self.broadcaster.send_to(&all_conns, user_id, message).await;
    }

    /// Get a user's role in a session, if they are connected.
    pub async fn get_role(&self, campaign_id: Uuid, user_id: Uuid) -> Option<CampaignRole> {
        let sessions = self.sessions.read().await;
        sessions
            .get(&campaign_id)
            .and_then(|s| s.roles.get(&user_id).copied())
    }

    /// Get the list of connected users in a session.
    pub async fn connected_users(&self, campaign_id: Uuid) -> Vec<ConnectedUserInfo> {
        let sessions = self.sessions.read().await;
        let Some(session) = sessions.get(&campaign_id) else {
            return Vec::new();
        };
        session
            .connections
            .iter()
            .filter(|(_, conns)| !conns.is_empty())
            .map(|(uid, conns)| {
                let first = &conns[0];
                ConnectedUserInfo {
                    user_id: *uid,
                    display_name: first.display_name.clone(),
                    role: *session.roles.get(uid).unwrap_or(&CampaignRole::Player),
                }
            })
            .collect()
    }

    /// Remove sessions that have been idle (zero connections) for longer than the timeout.
    pub async fn cleanup_idle(&self) {
        let mut sessions = self.sessions.write().await;
        let now = Instant::now();
        sessions.retain(|_id, session| {
            let has_connections = session.connections.values().any(|conns| !conns.is_empty());
            if has_connections {
                return true;
            }
            now.duration_since(session.last_activity) < SESSION_IDLE_TIMEOUT
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::broadcaster::InMemoryBroadcaster;
    use htbd_core::models::CampaignRole;
    use tokio::sync::mpsc;

    fn make_manager() -> SessionManager {
        SessionManager::new(Arc::new(InMemoryBroadcaster::new()))
    }

    fn make_conn(
        user_id: Uuid,
        name: &str,
        role: CampaignRole,
    ) -> (ConnectionHandle, mpsc::UnboundedReceiver<ServerMessage>) {
        let (tx, rx) = mpsc::unbounded_channel();
        let conn = ConnectionHandle {
            connection_id: Uuid::new_v4(),
            user_id,
            display_name: name.to_string(),
            role,
            tx,
        };
        (conn, rx)
    }

    #[tokio::test]
    async fn join_creates_session_and_returns_users() {
        let mgr = make_manager();
        let campaign_id = Uuid::new_v4();
        let user_id = Uuid::new_v4();
        let (conn, _rx) = make_conn(user_id, "Alice", CampaignRole::Dm);

        let users = mgr.join(campaign_id, conn).await;
        assert_eq!(users.len(), 1);
        assert_eq!(users[0].user_id, user_id);
        assert_eq!(users[0].display_name, "Alice");
    }

    #[tokio::test]
    async fn join_broadcasts_user_joined_to_others() {
        let mgr = make_manager();
        let campaign_id = Uuid::new_v4();
        let uid1 = Uuid::new_v4();
        let uid2 = Uuid::new_v4();

        let (c1, mut rx1) = make_conn(uid1, "Alice", CampaignRole::Dm);
        let (c2, _rx2) = make_conn(uid2, "Bob", CampaignRole::Player);

        mgr.join(campaign_id, c1).await;
        mgr.join(campaign_id, c2).await;

        // Alice should receive UserJoined for Bob
        let msg = rx1.try_recv().unwrap();
        match msg {
            ServerMessage::UserJoined {
                user_id,
                display_name,
            } => {
                assert_eq!(user_id, uid2);
                assert_eq!(display_name, "Bob");
            }
            _ => panic!("expected UserJoined, got {msg:?}"),
        }
    }

    #[tokio::test]
    async fn multi_tab_no_duplicate_user_joined() {
        let mgr = make_manager();
        let campaign_id = Uuid::new_v4();
        let uid1 = Uuid::new_v4();
        let uid2 = Uuid::new_v4();

        let (c1, mut rx1) = make_conn(uid1, "Alice", CampaignRole::Dm);
        let (c2_tab1, _rx2a) = make_conn(uid2, "Bob", CampaignRole::Player);
        let (c2_tab2, _rx2b) = make_conn(uid2, "Bob", CampaignRole::Player);

        mgr.join(campaign_id, c1).await;
        mgr.join(campaign_id, c2_tab1).await;
        mgr.join(campaign_id, c2_tab2).await;

        // Alice should only get ONE UserJoined for Bob
        let msg = rx1.try_recv().unwrap();
        assert!(matches!(msg, ServerMessage::UserJoined { .. }));
        assert!(rx1.try_recv().is_err()); // No second notification
    }

    #[tokio::test]
    async fn leave_last_connection_broadcasts_user_left() {
        let mgr = make_manager();
        let campaign_id = Uuid::new_v4();
        let uid1 = Uuid::new_v4();
        let uid2 = Uuid::new_v4();

        let (c1, mut rx1) = make_conn(uid1, "Alice", CampaignRole::Dm);
        let (c2, _rx2) = make_conn(uid2, "Bob", CampaignRole::Player);
        let conn_id = c2.connection_id;

        mgr.join(campaign_id, c1).await;
        mgr.join(campaign_id, c2).await;
        // Drain UserJoined
        let _ = rx1.try_recv();

        mgr.leave(campaign_id, uid2, conn_id).await;

        let msg = rx1.try_recv().unwrap();
        assert!(matches!(msg, ServerMessage::UserLeft { .. }));
    }

    #[tokio::test]
    async fn leave_non_last_tab_no_user_left() {
        let mgr = make_manager();
        let campaign_id = Uuid::new_v4();
        let uid1 = Uuid::new_v4();
        let uid2 = Uuid::new_v4();

        let (c1, mut rx1) = make_conn(uid1, "Alice", CampaignRole::Dm);
        let (c2_tab1, _rx2a) = make_conn(uid2, "Bob", CampaignRole::Player);
        let conn_id1 = c2_tab1.connection_id;
        let (c2_tab2, _rx2b) = make_conn(uid2, "Bob", CampaignRole::Player);

        mgr.join(campaign_id, c1).await;
        mgr.join(campaign_id, c2_tab1).await;
        mgr.join(campaign_id, c2_tab2).await;
        // Drain UserJoined
        let _ = rx1.try_recv();

        mgr.leave(campaign_id, uid2, conn_id1).await;

        // Alice should NOT get UserLeft since Bob still has tab2
        assert!(rx1.try_recv().is_err());
    }

    #[tokio::test]
    async fn get_role_returns_correct_role() {
        let mgr = make_manager();
        let campaign_id = Uuid::new_v4();
        let uid = Uuid::new_v4();
        let (conn, _rx) = make_conn(uid, "Alice", CampaignRole::Dm);

        mgr.join(campaign_id, conn).await;
        assert_eq!(mgr.get_role(campaign_id, uid).await, Some(CampaignRole::Dm));
    }

    #[tokio::test]
    async fn connected_users_returns_all() {
        let mgr = make_manager();
        let campaign_id = Uuid::new_v4();
        let uid1 = Uuid::new_v4();
        let uid2 = Uuid::new_v4();

        let (c1, _rx1) = make_conn(uid1, "Alice", CampaignRole::Dm);
        let (c2, _rx2) = make_conn(uid2, "Bob", CampaignRole::Player);

        mgr.join(campaign_id, c1).await;
        mgr.join(campaign_id, c2).await;

        let users = mgr.connected_users(campaign_id).await;
        assert_eq!(users.len(), 2);
    }

    #[tokio::test]
    async fn broadcast_sends_to_session() {
        let mgr = make_manager();
        let campaign_id = Uuid::new_v4();
        let uid1 = Uuid::new_v4();
        let uid2 = Uuid::new_v4();

        let (c1, mut rx1) = make_conn(uid1, "Alice", CampaignRole::Dm);
        let (c2, mut rx2) = make_conn(uid2, "Bob", CampaignRole::Player);

        mgr.join(campaign_id, c1).await;
        mgr.join(campaign_id, c2).await;
        // Drain UserJoined
        let _ = rx1.try_recv();

        mgr.broadcast(campaign_id, &ServerMessage::Pong, None).await;

        assert!(rx1.try_recv().is_ok());
        assert!(rx2.try_recv().is_ok());
    }

    #[tokio::test]
    async fn send_to_targets_user() {
        let mgr = make_manager();
        let campaign_id = Uuid::new_v4();
        let uid1 = Uuid::new_v4();
        let uid2 = Uuid::new_v4();

        let (c1, mut rx1) = make_conn(uid1, "Alice", CampaignRole::Dm);
        let (c2, mut rx2) = make_conn(uid2, "Bob", CampaignRole::Player);

        mgr.join(campaign_id, c1).await;
        mgr.join(campaign_id, c2).await;
        let _ = rx1.try_recv();

        mgr.send_to(campaign_id, uid2, &ServerMessage::Pong).await;

        assert!(rx1.try_recv().is_err());
        assert!(rx2.try_recv().is_ok());
    }
}
