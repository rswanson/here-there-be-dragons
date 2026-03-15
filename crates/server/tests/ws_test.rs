mod common;

use common::spawn_app;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::{Message, client::IntoClientRequest};

/// Register a user and return the access_token cookie value.
async fn get_auth_cookie(app: &common::TestApp) -> String {
    let resp = common::register_user(app, "ws-test@example.com", "password123", "WS Tester").await;
    resp.cookies()
        .find(|c| c.name() == "access_token")
        .expect("No access_token cookie in response")
        .value()
        .to_string()
}

async fn connect_ws(
    app: &common::TestApp,
    token: &str,
) -> tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>> {
    let ws_url = format!("ws://{}/api/ws", app.addr);
    let mut req = ws_url.into_client_request().unwrap();
    req.headers_mut()
        .insert("Cookie", format!("access_token={token}").parse().unwrap());
    let (ws, _) = tokio_tungstenite::connect_async(req)
        .await
        .expect("Failed to connect to WebSocket");
    ws
}

#[tokio::test]
async fn websocket_ping_pong() {
    let app = spawn_app().await;
    let token = get_auth_cookie(&app).await;
    let mut ws = connect_ws(&app, &token).await;

    // Send Ping
    let ping = serde_json::json!({"type": "Ping"});
    ws.send(Message::Text(ping.to_string().into()))
        .await
        .unwrap();

    // Expect Pong
    let msg = ws.next().await.unwrap().unwrap();
    let text = msg.into_text().unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(parsed["type"], "Pong");
}

#[tokio::test]
async fn websocket_invalid_message_returns_error() {
    let app = spawn_app().await;
    let token = get_auth_cookie(&app).await;
    let mut ws = connect_ws(&app, &token).await;

    // Send invalid message
    ws.send(Message::Text("{\"type\": \"NonExistent\"}".into()))
        .await
        .unwrap();

    // Expect Error
    let msg = ws.next().await.unwrap().unwrap();
    let text = msg.into_text().unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert_eq!(parsed["type"], "Error");
    assert!(parsed["payload"]["code"].is_string());
    assert!(parsed["payload"]["message"].is_string());
}

#[tokio::test]
async fn websocket_multiple_pings() {
    let app = spawn_app().await;
    let token = get_auth_cookie(&app).await;
    let mut ws = connect_ws(&app, &token).await;

    for _ in 0..3 {
        let ping = serde_json::json!({"type": "Ping"});
        ws.send(Message::Text(ping.to_string().into()))
            .await
            .unwrap();

        let msg = ws.next().await.unwrap().unwrap();
        let text = msg.into_text().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(parsed["type"], "Pong");
    }
}

#[tokio::test]
async fn websocket_rejects_unauthenticated() {
    let app = spawn_app().await;
    let ws_url = format!("ws://{}/api/ws", app.addr);

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
