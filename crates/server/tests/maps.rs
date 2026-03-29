mod common;

use common::{create_test_campaign, spawn_app};
use serde_json::json;

#[tokio::test]
async fn test_create_map() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@test.com", "Campaign").await;
    let campaign_id = campaign["id"].as_str().unwrap();

    let resp = app
        .client
        .post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Tavern" }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    let map: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(map["name"], "Tavern");
    assert_eq!(map["grid_enabled"], true);
    assert_eq!(map["grid_size_px"], 70);

    // Verify default layers were created
    assert!(map["layers"].is_array());
    let layers = map["layers"].as_array().unwrap();
    assert_eq!(layers.len(), 3);
    assert_eq!(layers[0]["name"], "Background");
    assert_eq!(layers[1]["name"], "Tokens");
    assert_eq!(layers[2]["name"], "DM Notes");
}

#[tokio::test]
async fn test_list_maps() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@test.com", "Campaign").await;
    let campaign_id = campaign["id"].as_str().unwrap();

    app.client
        .post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Map A" }))
        .send()
        .await
        .unwrap();
    app.client
        .post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Map B" }))
        .send()
        .await
        .unwrap();

    let resp = app
        .client
        .get(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    let maps: Vec<serde_json::Value> = resp.json().await.unwrap();
    assert_eq!(maps.len(), 2);
}

#[tokio::test]
async fn test_get_map_filters_dm_only_for_player() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@test.com", "Campaign").await;
    let campaign_id = campaign["id"].as_str().unwrap();
    let invite_code = campaign["invite_code"].as_str().unwrap();

    let resp = app
        .client
        .post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Tavern" }))
        .send()
        .await
        .unwrap();
    let map: serde_json::Value = resp.json().await.unwrap();
    let map_id = map["id"].as_str().unwrap();

    // Player joins
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
    assert!(resp.status().is_success());
    player_client
        .post(app.url(&format!("/api/campaigns/join/{}", invite_code)))
        .send()
        .await
        .unwrap();

    // Player gets map — should not see dm_only layers
    let resp = player_client
        .get(app.url(&format!("/api/maps/{}", map_id)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let player_map: serde_json::Value = resp.json().await.unwrap();
    let layers = player_map["layers"].as_array().unwrap();
    assert_eq!(layers.len(), 2);
    assert!(layers.iter().all(|l| l["dm_only"] == false));
}

#[tokio::test]
async fn test_update_map_settings() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@test.com", "Campaign").await;
    let campaign_id = campaign["id"].as_str().unwrap();

    let resp = app
        .client
        .post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Tavern" }))
        .send()
        .await
        .unwrap();
    let map: serde_json::Value = resp.json().await.unwrap();
    let map_id = map["id"].as_str().unwrap();

    let resp = app
        .client
        .patch(app.url(&format!("/api/maps/{}", map_id)))
        .json(&json!({ "name": "Updated Tavern", "grid_enabled": false, "snap_mode": "off" }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    let updated: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(updated["name"], "Updated Tavern");
    assert_eq!(updated["grid_enabled"], false);
    assert_eq!(updated["snap_mode"], "off");
}

#[tokio::test]
async fn test_delete_map() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@test.com", "Campaign").await;
    let campaign_id = campaign["id"].as_str().unwrap();

    let resp = app
        .client
        .post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Deletable" }))
        .send()
        .await
        .unwrap();
    let map: serde_json::Value = resp.json().await.unwrap();
    let map_id = map["id"].as_str().unwrap();

    let resp = app
        .client
        .delete(app.url(&format!("/api/maps/{}", map_id)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 204);

    let resp = app
        .client
        .get(app.url(&format!("/api/maps/{}", map_id)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 404);
}

#[tokio::test]
async fn test_player_cannot_create_map() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@test.com", "Campaign").await;
    let campaign_id = campaign["id"].as_str().unwrap();
    let invite_code = campaign["invite_code"].as_str().unwrap();

    let player_client = reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .unwrap();
    player_client
        .post(app.url("/api/auth/register"))
        .json(
            &json!({"email": "player@test.com", "password": "password123", "display_name": "Player"}),
        )
        .send()
        .await
        .unwrap();
    player_client
        .post(app.url(&format!("/api/campaigns/join/{}", invite_code)))
        .send()
        .await
        .unwrap();

    let resp = player_client
        .post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Sneaky Map" }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 403);
}
