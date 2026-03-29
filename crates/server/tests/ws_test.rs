mod common;

use common::spawn_app;
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tokio_tungstenite::tungstenite::{Message, client::IntoClientRequest};

/// Register a user, create a campaign, and return (access_token, campaign_id).
async fn setup_user_with_campaign(app: &common::TestApp) -> (String, String) {
    let client = reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .unwrap();

    // Register
    let resp = client
        .post(app.url("/api/auth/register"))
        .json(&json!({
            "email": "ws-test@example.com",
            "password": "password123",
            "display_name": "WS Tester"
        }))
        .send()
        .await
        .unwrap();
    let token = resp
        .cookies()
        .find(|c| c.name() == "access_token")
        .expect("No access_token cookie")
        .value()
        .to_string();

    // Create campaign
    let resp = client
        .post(app.url("/api/campaigns"))
        .json(&json!({"name": "WS Test Campaign"}))
        .send()
        .await
        .unwrap();
    let campaign: serde_json::Value = resp.json().await.unwrap();
    let campaign_id = campaign["id"].as_str().unwrap().to_string();

    (token, campaign_id)
}

async fn connect_ws(
    app: &common::TestApp,
    campaign_id: &str,
    token: &str,
) -> tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>> {
    let ws_url = format!("ws://{}/api/ws/{}", app.addr, campaign_id);
    let mut req = ws_url.into_client_request().unwrap();
    req.headers_mut()
        .insert("Cookie", format!("access_token={token}").parse().unwrap());
    let (ws, _) = tokio_tungstenite::connect_async(req)
        .await
        .expect("Failed to connect to WebSocket");
    ws
}

/// Drain messages until we find one matching the predicate, or timeout.
async fn recv_until(
    ws: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    predicate: impl Fn(&serde_json::Value) -> bool,
) -> serde_json::Value {
    for _ in 0..20 {
        let msg = tokio::time::timeout(std::time::Duration::from_secs(5), ws.next())
            .await
            .expect("Timed out waiting for message")
            .unwrap()
            .unwrap();
        if let Message::Text(text) = msg {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                if predicate(&parsed) {
                    return parsed;
                }
            }
        }
    }
    panic!("Did not receive expected message within 20 messages");
}

#[tokio::test]
async fn websocket_ping_pong() {
    let app = spawn_app().await;
    let (token, campaign_id) = setup_user_with_campaign(&app).await;
    let mut ws = connect_ws(&app, &campaign_id, &token).await;

    // Drain the SessionJoined message first
    let _ = recv_until(&mut ws, |v| v["type"] == "SessionJoined").await;

    // Send Ping
    let ping = json!({"type": "Ping"});
    ws.send(Message::Text(ping.to_string().into()))
        .await
        .unwrap();

    // Expect Pong
    let pong = recv_until(&mut ws, |v| v["type"] == "Pong").await;
    assert_eq!(pong["type"], "Pong");
}

#[tokio::test]
async fn websocket_multiple_pings() {
    let app = spawn_app().await;
    let (token, campaign_id) = setup_user_with_campaign(&app).await;
    let mut ws = connect_ws(&app, &campaign_id, &token).await;

    // Drain SessionJoined
    let _ = recv_until(&mut ws, |v| v["type"] == "SessionJoined").await;

    for _ in 0..3 {
        let ping = json!({"type": "Ping"});
        ws.send(Message::Text(ping.to_string().into()))
            .await
            .unwrap();

        let pong = recv_until(&mut ws, |v| v["type"] == "Pong").await;
        assert_eq!(pong["type"], "Pong");
    }
}

#[tokio::test]
async fn websocket_rejects_unauthenticated() {
    let app = spawn_app().await;
    // Use a dummy campaign_id — auth check happens before campaign check
    let ws_url = format!(
        "ws://{}/api/ws/00000000-0000-0000-0000-000000000000",
        app.addr
    );

    let result = tokio_tungstenite::connect_async(&ws_url).await;
    // Should fail — either connection refused or upgrade rejected
    assert!(
        result.is_err() || {
            let (mut ws, resp) = result.unwrap();
            let rejected = resp.status() == 401 || resp.status() == 403;
            let _ = ws.close(None).await;
            rejected
        }
    );
}
