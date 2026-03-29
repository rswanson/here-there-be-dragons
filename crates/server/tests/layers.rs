mod common;
use serde_json::json;

async fn setup_map(app: &common::TestApp) -> (String, String) {
    let campaign = common::create_test_campaign(app, "dm@test.com", "Campaign").await;
    let campaign_id = campaign["id"].as_str().unwrap().to_string();
    let resp = app
        .client
        .post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Map" }))
        .send()
        .await
        .unwrap();
    let map: serde_json::Value = resp.json().await.unwrap();
    let map_id = map["id"].as_str().unwrap().to_string();
    (campaign_id, map_id)
}

#[tokio::test]
async fn test_create_layer() {
    let app = common::spawn_app().await;
    let (_, map_id) = setup_map(&app).await;
    let resp = app
        .client
        .post(app.url(&format!("/api/maps/{}/layers", map_id)))
        .json(&json!({ "name": "Enemies", "layer_type": "token", "dm_only": false }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let layer: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(layer["name"], "Enemies");
    assert_eq!(layer["layer_type"], "token");
    assert_eq!(layer["sort_order"], 3);
}

#[tokio::test]
async fn test_update_layer() {
    let app = common::spawn_app().await;
    let (_, map_id) = setup_map(&app).await;
    let resp = app
        .client
        .get(app.url(&format!("/api/maps/{}", map_id)))
        .send()
        .await
        .unwrap();
    let map: serde_json::Value = resp.json().await.unwrap();
    let layer_id = map["layers"][0]["id"].as_str().unwrap();
    let resp = app
        .client
        .patch(app.url(&format!("/api/layers/{}", layer_id)))
        .json(&json!({ "name": "Renamed", "locked": true, "opacity": 0.5 }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let updated: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(updated["name"], "Renamed");
    assert_eq!(updated["locked"], true);
    assert_eq!(updated["opacity"], 0.5);
}

#[tokio::test]
async fn test_reorder_layers() {
    let app = common::spawn_app().await;
    let (_, map_id) = setup_map(&app).await;
    let resp = app
        .client
        .get(app.url(&format!("/api/maps/{}", map_id)))
        .send()
        .await
        .unwrap();
    let map: serde_json::Value = resp.json().await.unwrap();
    let layers = map["layers"].as_array().unwrap();
    let reversed_ids: Vec<&str> = layers
        .iter()
        .rev()
        .map(|l| l["id"].as_str().unwrap())
        .collect();
    let resp = app
        .client
        .put(app.url(&format!("/api/maps/{}/layers/order", map_id)))
        .json(&json!({ "layer_ids": reversed_ids }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let resp = app
        .client
        .get(app.url(&format!("/api/maps/{}", map_id)))
        .send()
        .await
        .unwrap();
    let map: serde_json::Value = resp.json().await.unwrap();
    let new_layers = map["layers"].as_array().unwrap();
    assert_eq!(new_layers[0]["id"].as_str().unwrap(), reversed_ids[0]);
}

#[tokio::test]
async fn test_delete_layer() {
    let app = common::spawn_app().await;
    let (_, map_id) = setup_map(&app).await;
    let resp = app
        .client
        .post(app.url(&format!("/api/maps/{}/layers", map_id)))
        .json(&json!({ "name": "Temp", "layer_type": "drawing" }))
        .send()
        .await
        .unwrap();
    let layer: serde_json::Value = resp.json().await.unwrap();
    let layer_id = layer["id"].as_str().unwrap();
    let resp = app
        .client
        .delete(app.url(&format!("/api/layers/{}", layer_id)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 204);
}
