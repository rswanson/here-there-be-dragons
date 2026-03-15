mod common;

use common::spawn_app;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;

#[tokio::test]
async fn websocket_ping_pong() {
    let app = spawn_app().await;
    let ws_url = format!("ws://{}/api/ws", app.addr);

    let (mut ws, _) = tokio_tungstenite::connect_async(&ws_url)
        .await
        .expect("Failed to connect to WebSocket");

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
    let ws_url = format!("ws://{}/api/ws", app.addr);

    let (mut ws, _) = tokio_tungstenite::connect_async(&ws_url)
        .await
        .expect("Failed to connect to WebSocket");

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
    let ws_url = format!("ws://{}/api/ws", app.addr);

    let (mut ws, _) = tokio_tungstenite::connect_async(&ws_url)
        .await
        .expect("Failed to connect to WebSocket");

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
