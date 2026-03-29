mod common;
use serde_json::json;

async fn setup_with_asset(app: &common::TestApp) -> (String, String, String) {
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
    let layer_id = map["layers"][0]["id"].as_str().unwrap().to_string();

    // Upload an asset
    let form = reqwest::multipart::Form::new().part(
        "file",
        reqwest::multipart::Part::bytes(vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
            .file_name("map.png")
            .mime_str("image/png")
            .unwrap(),
    );
    let resp = app
        .client
        .post(app.url(&format!("/api/assets/campaigns/{}", campaign_id)))
        .multipart(form)
        .send()
        .await
        .unwrap();
    let asset: serde_json::Value = resp.json().await.unwrap();
    let asset_id = asset["id"].as_str().unwrap().to_string();

    (layer_id, asset_id, map_id)
}

#[tokio::test]
async fn test_place_and_list_images() {
    let app = common::spawn_app().await;
    let (layer_id, asset_id, _) = setup_with_asset(&app).await;

    let resp = app
        .client
        .post(app.url(&format!("/api/layers/{}/images", layer_id)))
        .json(&json!({ "asset_id": asset_id, "x": 0, "y": 0, "width": 30, "height": 20 }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    let image: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(image["width"], 30.0);
}

#[tokio::test]
async fn test_update_image() {
    let app = common::spawn_app().await;
    let (layer_id, asset_id, _) = setup_with_asset(&app).await;

    let resp = app
        .client
        .post(app.url(&format!("/api/layers/{}/images", layer_id)))
        .json(&json!({ "asset_id": asset_id, "x": 0, "y": 0, "width": 30, "height": 20 }))
        .send()
        .await
        .unwrap();
    let image: serde_json::Value = resp.json().await.unwrap();
    let image_id = image["id"].as_str().unwrap();

    let resp = app
        .client
        .patch(app.url(&format!("/api/images/{}", image_id)))
        .json(&json!({ "x": 5.0, "y": 5.0 }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    let updated: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(updated["x"], 5.0);
}

#[tokio::test]
async fn test_delete_image() {
    let app = common::spawn_app().await;
    let (layer_id, asset_id, _) = setup_with_asset(&app).await;

    let resp = app
        .client
        .post(app.url(&format!("/api/layers/{}/images", layer_id)))
        .json(&json!({ "asset_id": asset_id, "x": 0, "y": 0, "width": 30, "height": 20 }))
        .send()
        .await
        .unwrap();
    let image: serde_json::Value = resp.json().await.unwrap();
    let image_id = image["id"].as_str().unwrap();

    let resp = app
        .client
        .delete(app.url(&format!("/api/images/{}", image_id)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 204);
}
