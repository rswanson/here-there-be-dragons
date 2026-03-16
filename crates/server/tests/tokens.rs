mod common;
use serde_json::json;

async fn setup_token_layer(app: &common::TestApp) -> (String, String, String) {
    let campaign = common::create_test_campaign(app, "dm@test.com", "Campaign").await;
    let campaign_id = campaign["id"].as_str().unwrap().to_string();
    let invite_code = campaign["invite_code"].as_str().unwrap().to_string();

    let resp = app
        .client
        .post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Map" }))
        .send()
        .await
        .unwrap();
    let map: serde_json::Value = resp.json().await.unwrap();
    let token_layer_id = map["layers"][1]["id"].as_str().unwrap().to_string();

    (token_layer_id, campaign_id, invite_code)
}

#[tokio::test]
async fn test_create_token() {
    let app = common::spawn_app().await;
    let (layer_id, _, _) = setup_token_layer(&app).await;

    let resp = app
        .client
        .post(app.url(&format!("/api/layers/{}/tokens", layer_id)))
        .json(&json!({
            "name": "Goblin",
            "x": 5.0, "y": 3.0,
            "size": 1,
            "bars": [{"label": "HP", "current": 7, "max": 7, "color": "#ff0000", "visibility": "everyone"}],
            "status_markers": ["stunned"]
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    let token: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(token["name"], "Goblin");
    assert_eq!(token["x"], 5.0);
    assert_eq!(token["size"], 1);
    assert_eq!(token["bars"][0]["label"], "HP");
    assert_eq!(token["status_markers"][0], "stunned");
}

#[tokio::test]
async fn test_player_can_move_own_token() {
    let app = common::spawn_app().await;
    let (layer_id, _, invite_code) = setup_token_layer(&app).await;

    let player_client = reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .unwrap();
    let resp = player_client
        .post(app.url("/api/auth/register"))
        .json(&json!({"email": "player@test.com", "password": "password123", "display_name": "Player"}))
        .send()
        .await
        .unwrap();
    let player_auth: serde_json::Value = resp.json().await.unwrap();
    let player_id = player_auth["user"]["id"].as_str().unwrap();

    player_client
        .post(app.url(&format!("/api/campaigns/join/{}", invite_code)))
        .send()
        .await
        .unwrap();

    // DM creates token owned by player
    let resp = app
        .client
        .post(app.url(&format!("/api/layers/{}/tokens", layer_id)))
        .json(&json!({ "name": "Player Token", "owner_id": player_id, "x": 0, "y": 0 }))
        .send()
        .await
        .unwrap();
    let token: serde_json::Value = resp.json().await.unwrap();
    let token_id = token["id"].as_str().unwrap();

    // Player moves their own token
    let resp = player_client
        .patch(app.url(&format!("/api/tokens/{}", token_id)))
        .json(&json!({ "x": 10.0, "y": 15.0 }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    let updated: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(updated["x"], 10.0);
}

#[tokio::test]
async fn test_player_cannot_move_others_token() {
    let app = common::spawn_app().await;
    let (layer_id, _, invite_code) = setup_token_layer(&app).await;

    let resp = app
        .client
        .post(app.url(&format!("/api/layers/{}/tokens", layer_id)))
        .json(&json!({ "name": "NPC", "x": 0, "y": 0 }))
        .send()
        .await
        .unwrap();
    let token: serde_json::Value = resp.json().await.unwrap();
    let token_id = token["id"].as_str().unwrap();

    let player_client = reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .unwrap();
    player_client
        .post(app.url("/api/auth/register"))
        .json(&json!({"email": "player@test.com", "password": "password123", "display_name": "Player"}))
        .send()
        .await
        .unwrap();
    player_client
        .post(app.url(&format!("/api/campaigns/join/{}", invite_code)))
        .send()
        .await
        .unwrap();

    let resp = player_client
        .patch(app.url(&format!("/api/tokens/{}", token_id)))
        .json(&json!({ "x": 10.0, "y": 15.0 }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 403);
}

#[tokio::test]
async fn test_player_cannot_delete_token() {
    let app = common::spawn_app().await;
    let (layer_id, _, invite_code) = setup_token_layer(&app).await;

    let player_client = reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .unwrap();
    let resp = player_client
        .post(app.url("/api/auth/register"))
        .json(&json!({"email": "player@test.com", "password": "password123", "display_name": "Player"}))
        .send()
        .await
        .unwrap();
    let player_auth: serde_json::Value = resp.json().await.unwrap();
    let player_id = player_auth["user"]["id"].as_str().unwrap();

    player_client
        .post(app.url(&format!("/api/campaigns/join/{}", invite_code)))
        .send()
        .await
        .unwrap();

    let resp = app
        .client
        .post(app.url(&format!("/api/layers/{}/tokens", layer_id)))
        .json(&json!({ "name": "Player Token", "owner_id": player_id }))
        .send()
        .await
        .unwrap();
    let token: serde_json::Value = resp.json().await.unwrap();
    let token_id = token["id"].as_str().unwrap();

    let resp = player_client
        .delete(app.url(&format!("/api/tokens/{}", token_id)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 403);
}
