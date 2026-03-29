mod common;

use common::spawn_app;
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tokio_tungstenite::tungstenite::{Message, client::IntoClientRequest};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type WsStream =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

/// Register a user with a *separate* reqwest client and return (client, access_token, user_id).
async fn register_separate(
    app: &common::TestApp,
    email: &str,
    name: &str,
) -> (reqwest::Client, String, String) {
    let client = reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .unwrap();

    let resp = client
        .post(app.url("/api/auth/register"))
        .json(&json!({
            "email": email,
            "password": "password123",
            "display_name": name
        }))
        .send()
        .await
        .unwrap();
    assert!(
        resp.status().is_success(),
        "Register failed: {}",
        resp.status()
    );

    let token = resp
        .cookies()
        .find(|c| c.name() == "access_token")
        .expect("No access_token cookie")
        .value()
        .to_string();

    let me_resp = client.get(app.url("/api/auth/me")).send().await.unwrap();
    let me: serde_json::Value = me_resp.json().await.unwrap();
    let user_id = me["user"]["id"].as_str().unwrap().to_string();

    (client, token, user_id)
}

/// Connect a WebSocket to `/api/ws/{campaign_id}` with the given access token.
async fn connect_ws(app: &common::TestApp, campaign_id: &str, token: &str) -> WsStream {
    let ws_url = format!("ws://{}/api/ws/{}", app.addr, campaign_id);
    let mut req = ws_url.into_client_request().unwrap();
    req.headers_mut()
        .insert("Cookie", format!("access_token={token}").parse().unwrap());
    let (ws, _) = tokio_tungstenite::connect_async(req)
        .await
        .expect("Failed to connect WebSocket");
    ws
}

/// Read the next text message, parsed as JSON. Times out after 5 seconds.
async fn recv_json(ws: &mut WsStream) -> serde_json::Value {
    let msg = tokio::time::timeout(std::time::Duration::from_secs(5), ws.next())
        .await
        .expect("Timed out waiting for WS message")
        .expect("Stream ended")
        .expect("WS error");
    let text = msg.into_text().expect("Non-text message");
    serde_json::from_str(&text).expect("Invalid JSON")
}

/// Read messages until we find one whose "type" matches `msg_type`. Drains up to 20 messages.
async fn recv_until(ws: &mut WsStream, msg_type: &str) -> serde_json::Value {
    for _ in 0..20 {
        let msg = recv_json(ws).await;
        if msg["type"] == msg_type {
            return msg;
        }
    }
    panic!("Did not receive message of type '{msg_type}' within 20 messages");
}

/// Create a campaign+map and return (campaign_id, token_layer_id, invite_code).
async fn setup_campaign_and_map(
    app: &common::TestApp,
    client: &reqwest::Client,
) -> (String, String, String) {
    let resp = client
        .post(app.url("/api/campaigns"))
        .json(&json!({ "name": "WS Test Campaign" }))
        .send()
        .await
        .unwrap();
    let campaign: serde_json::Value = resp.json().await.unwrap();
    let campaign_id = campaign["id"].as_str().unwrap().to_string();
    let invite_code = campaign["invite_code"].as_str().unwrap().to_string();

    let resp = client
        .post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Test Map" }))
        .send()
        .await
        .unwrap();
    let map: serde_json::Value = resp.json().await.unwrap();
    let token_layer_id = map["layers"][1]["id"].as_str().unwrap().to_string();

    (campaign_id, token_layer_id, invite_code)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// 1. Session join — connect, receive SessionJoined with connected users.
#[tokio::test]
async fn session_join_returns_session_joined() {
    let app = spawn_app().await;
    let (dm_client, dm_token, dm_user_id) = register_separate(&app, "dm-join@test.com", "DM").await;
    let (campaign_id, _, _) = setup_campaign_and_map(&app, &dm_client).await;

    let mut ws = connect_ws(&app, &campaign_id, &dm_token).await;
    let msg = recv_json(&mut ws).await;

    assert_eq!(msg["type"], "SessionJoined");
    assert_eq!(msg["payload"]["campaign_id"], campaign_id);
    assert_eq!(msg["payload"]["user_id"], dm_user_id);

    let users = msg["payload"]["connected_users"].as_array().unwrap();
    assert!(
        users.iter().any(|u| u["user_id"] == dm_user_id),
        "DM should appear in connected users"
    );

    ws.close(None).await.ok();
}

/// 2. Presence broadcast — two clients, second receives UserJoined.
#[tokio::test]
async fn presence_broadcast_user_joined() {
    let app = spawn_app().await;
    let (dm_client, dm_token, _) = register_separate(&app, "dm-pres@test.com", "DM").await;
    let (campaign_id, _, invite_code) = setup_campaign_and_map(&app, &dm_client).await;

    // Player joins campaign via invite
    let (player_client, player_token, player_user_id) =
        register_separate(&app, "player-pres@test.com", "Player").await;
    player_client
        .post(app.url(&format!("/api/campaigns/join/{invite_code}")))
        .send()
        .await
        .unwrap();

    // DM connects first
    let mut dm_ws = connect_ws(&app, &campaign_id, &dm_token).await;
    let _session_joined = recv_json(&mut dm_ws).await;
    assert_eq!(_session_joined["type"], "SessionJoined");

    // Player connects — DM should receive UserJoined
    let mut player_ws = connect_ws(&app, &campaign_id, &player_token).await;
    let _player_session = recv_json(&mut player_ws).await;
    assert_eq!(_player_session["type"], "SessionJoined");

    let user_joined = recv_until(&mut dm_ws, "UserJoined").await;
    assert_eq!(user_joined["payload"]["user_id"], player_user_id);
    assert_eq!(user_joined["payload"]["display_name"], "Player");

    dm_ws.close(None).await.ok();
    player_ws.close(None).await.ok();
}

/// 3. Token move broadcast — Client A sends MoveToken, Client B receives TokenMoved.
#[tokio::test]
async fn token_move_broadcast() {
    let app = spawn_app().await;
    let (dm_client, dm_token, _) = register_separate(&app, "dm-move@test.com", "DM").await;
    let (campaign_id, token_layer_id, invite_code) = setup_campaign_and_map(&app, &dm_client).await;

    // Create a token via REST
    let resp = dm_client
        .post(app.url(&format!("/api/layers/{token_layer_id}/tokens")))
        .json(&json!({
            "name": "Goblin",
            "x": 0.0,
            "y": 0.0,
        }))
        .send()
        .await
        .unwrap();
    assert!(resp.status().is_success());
    let token: serde_json::Value = resp.json().await.unwrap();
    let token_id = token["id"].as_str().unwrap();

    // Player joins campaign
    let (player_client, player_token, _) =
        register_separate(&app, "player-move@test.com", "Player").await;
    player_client
        .post(app.url(&format!("/api/campaigns/join/{invite_code}")))
        .send()
        .await
        .unwrap();

    // Both connect
    let mut dm_ws = connect_ws(&app, &campaign_id, &dm_token).await;
    let _ = recv_json(&mut dm_ws).await; // SessionJoined

    let mut player_ws = connect_ws(&app, &campaign_id, &player_token).await;
    let _ = recv_json(&mut player_ws).await; // SessionJoined

    // Drain UserJoined on DM side
    let _ = recv_until(&mut dm_ws, "UserJoined").await;

    // DM sends MoveToken via WebSocket
    let move_msg = json!({
        "type": "MoveToken",
        "payload": {
            "token_id": token_id,
            "x": 5.0,
            "y": 10.0
        }
    });
    dm_ws
        .send(Message::Text(move_msg.to_string().into()))
        .await
        .unwrap();

    // Both DM and player should receive TokenMoved (broadcast to all)
    let dm_moved = recv_until(&mut dm_ws, "TokenMoved").await;
    assert_eq!(dm_moved["payload"]["token_id"], token_id);
    assert_eq!(dm_moved["payload"]["x"], 5.0);
    assert_eq!(dm_moved["payload"]["y"], 10.0);

    let player_moved = recv_until(&mut player_ws, "TokenMoved").await;
    assert_eq!(player_moved["payload"]["token_id"], token_id);
    assert_eq!(player_moved["payload"]["x"], 5.0);
    assert_eq!(player_moved["payload"]["y"], 10.0);

    dm_ws.close(None).await.ok();
    player_ws.close(None).await.ok();
}

/// 4. Disconnect presence — client disconnects, other receives UserLeft.
#[tokio::test]
async fn disconnect_sends_user_left() {
    let app = spawn_app().await;
    let (dm_client, dm_token, _) = register_separate(&app, "dm-disc@test.com", "DM").await;
    let (campaign_id, _, invite_code) = setup_campaign_and_map(&app, &dm_client).await;

    let (player_client, player_token, player_user_id) =
        register_separate(&app, "player-disc@test.com", "Player").await;
    player_client
        .post(app.url(&format!("/api/campaigns/join/{invite_code}")))
        .send()
        .await
        .unwrap();

    // Both connect
    let mut dm_ws = connect_ws(&app, &campaign_id, &dm_token).await;
    let _ = recv_json(&mut dm_ws).await; // SessionJoined

    let mut player_ws = connect_ws(&app, &campaign_id, &player_token).await;
    let _ = recv_json(&mut player_ws).await; // SessionJoined

    // DM receives UserJoined for player
    let _ = recv_until(&mut dm_ws, "UserJoined").await;

    // Player disconnects
    player_ws.close(None).await.ok();

    // DM should receive UserLeft
    let user_left = recv_until(&mut dm_ws, "UserLeft").await;
    assert_eq!(user_left["payload"]["user_id"], player_user_id);
    assert_eq!(user_left["payload"]["display_name"], "Player");

    dm_ws.close(None).await.ok();
}

/// 5. Permission denied — non-member tries WebSocket connection.
#[tokio::test]
async fn non_member_ws_rejected() {
    let app = spawn_app().await;
    let (dm_client, _, _) = register_separate(&app, "dm-perm@test.com", "DM").await;
    let (campaign_id, _, _) = setup_campaign_and_map(&app, &dm_client).await;

    // Register outsider (not a campaign member)
    let (_, outsider_token, _) = register_separate(&app, "outsider@test.com", "Outsider").await;

    // Attempt WebSocket connection — should be rejected
    let ws_url = format!("ws://{}/api/ws/{}", app.addr, campaign_id);
    let mut req = ws_url.into_client_request().unwrap();
    req.headers_mut().insert(
        "Cookie",
        format!("access_token={outsider_token}").parse().unwrap(),
    );

    let result = tokio_tungstenite::connect_async(req).await;
    assert!(
        result.is_err() || {
            let (mut ws, resp) = result.unwrap();
            let rejected = resp.status() == 403 || resp.status() == 401;
            let _ = ws.close(None).await;
            rejected
        },
        "Non-member should be rejected from WebSocket"
    );
}

/// 6. Full state endpoint — GET /api/maps/{id}/state returns MapFullState.
#[tokio::test]
async fn full_state_endpoint_returns_map_data() {
    let app = spawn_app().await;
    let (dm_client, _, _) = register_separate(&app, "dm-state@test.com", "DM").await;
    let (campaign_id, token_layer_id, _) = setup_campaign_and_map(&app, &dm_client).await;

    // Create a token
    let resp = dm_client
        .post(app.url(&format!("/api/layers/{token_layer_id}/tokens")))
        .json(&json!({
            "name": "Dragon",
            "x": 3.0,
            "y": 7.0,
        }))
        .send()
        .await
        .unwrap();
    assert!(resp.status().is_success());

    // Get the map ID
    let resp = dm_client
        .get(app.url(&format!("/api/campaigns/{campaign_id}/maps")))
        .send()
        .await
        .unwrap();
    let maps: Vec<serde_json::Value> = resp.json().await.unwrap();
    let map_id = maps[0]["id"].as_str().unwrap();

    // Fetch full state
    let resp = dm_client
        .get(app.url(&format!("/api/maps/{map_id}/state")))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    let state: serde_json::Value = resp.json().await.unwrap();
    assert!(state["map"].is_object(), "Should contain map object");
    assert!(state["layers"].is_array(), "Should contain layers array");
    assert!(state["tokens"].is_array(), "Should contain tokens array");
    assert!(
        state["drawings"].is_array(),
        "Should contain drawings array"
    );

    let tokens = state["tokens"].as_array().unwrap();
    assert_eq!(tokens.len(), 1);
    assert_eq!(tokens[0]["name"], "Dragon");
    assert_eq!(tokens[0]["x"], 3.0);
    assert_eq!(tokens[0]["y"], 7.0);
}
