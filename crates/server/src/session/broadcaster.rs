use async_trait::async_trait;
use htbd_core::messages::ServerMessage;
use uuid::Uuid;

use super::types::ConnectionHandle;

/// Abstraction over how messages are delivered to connected clients.
/// The InMemoryBroadcaster sends directly via mpsc channels.
/// A future Redis/NATS implementation could publish to a broker instead.
#[async_trait]
pub trait SessionBroadcaster: Send + Sync + 'static {
    /// Broadcast a message to all connections, optionally excluding one user.
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

/// In-process broadcaster that sends directly via tokio mpsc channels.
#[derive(Debug, Default)]
pub struct InMemoryBroadcaster;

impl InMemoryBroadcaster {
    pub fn new() -> Self {
        Self
    }
}

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
            // Ignore send errors — the connection may have been dropped
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

#[cfg(test)]
mod tests {
    use super::*;
    use htbd_core::models::CampaignRole;
    use tokio::sync::mpsc;

    fn make_conn(user_id: Uuid) -> (ConnectionHandle, mpsc::UnboundedReceiver<ServerMessage>) {
        let (tx, rx) = mpsc::unbounded_channel();
        let conn = ConnectionHandle {
            connection_id: Uuid::new_v4(),
            user_id,
            display_name: "Test".to_string(),
            role: CampaignRole::Player,
            tx,
        };
        (conn, rx)
    }

    #[tokio::test]
    async fn broadcast_sends_to_all() {
        let broadcaster = InMemoryBroadcaster::new();
        let id1 = Uuid::new_v4();
        let id2 = Uuid::new_v4();
        let (c1, mut rx1) = make_conn(id1);
        let (c2, mut rx2) = make_conn(id2);

        let msg = ServerMessage::Pong;
        broadcaster.broadcast(&[c1, c2], &msg, None).await;

        assert!(rx1.try_recv().is_ok());
        assert!(rx2.try_recv().is_ok());
    }

    #[tokio::test]
    async fn broadcast_excludes_user() {
        let broadcaster = InMemoryBroadcaster::new();
        let id1 = Uuid::new_v4();
        let id2 = Uuid::new_v4();
        let (c1, mut rx1) = make_conn(id1);
        let (c2, mut rx2) = make_conn(id2);

        let msg = ServerMessage::Pong;
        broadcaster.broadcast(&[c1, c2], &msg, Some(id1)).await;

        assert!(rx1.try_recv().is_err());
        assert!(rx2.try_recv().is_ok());
    }

    #[tokio::test]
    async fn send_to_targets_user() {
        let broadcaster = InMemoryBroadcaster::new();
        let id1 = Uuid::new_v4();
        let id2 = Uuid::new_v4();
        let (c1, mut rx1) = make_conn(id1);
        let (c2, mut rx2) = make_conn(id2);

        let msg = ServerMessage::Pong;
        broadcaster.send_to(&[c1, c2], id1, &msg).await;

        assert!(rx1.try_recv().is_ok());
        assert!(rx2.try_recv().is_err());
    }
}
