mod common;
use serde_json::json;

async fn setup_drawing_layer(app: &common::TestApp) -> String {
    let campaign = common::create_test_campaign(app, "dm@test.com", "Campaign").await;
    let campaign_id = campaign["id"].as_str().unwrap();

    let resp = app
        .client
        .post(app.url(&format!("/api/campaigns/{}/maps", campaign_id)))
        .json(&json!({ "name": "Map" }))
        .send()
        .await
        .unwrap();
    let map: serde_json::Value = resp.json().await.unwrap();
    // DM Notes layer (index 2) is a drawing layer
    map["layers"][2]["id"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn test_create_drawing() {
    let app = common::spawn_app().await;
    let layer_id = setup_drawing_layer(&app).await;

    let resp = app
        .client
        .post(app.url(&format!("/api/layers/{}/drawings", layer_id)))
        .json(&json!({
            "drawing_type": "line",
            "points": [{"x": 0, "y": 0}, {"x": 10, "y": 10}],
            "stroke_color": "#ff0000",
            "stroke_width": 3.0
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    let drawing: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(drawing["drawing_type"], "line");
    assert_eq!(drawing["stroke_color"], "#ff0000");
}

#[tokio::test]
async fn test_update_drawing() {
    let app = common::spawn_app().await;
    let layer_id = setup_drawing_layer(&app).await;

    let resp = app
        .client
        .post(app.url(&format!("/api/layers/{}/drawings", layer_id)))
        .json(&json!({
            "drawing_type": "rectangle",
            "points": [{"x": 0, "y": 0}, {"x": 5, "y": 5}],
            "stroke_color": "#ffffff"
        }))
        .send()
        .await
        .unwrap();
    let drawing: serde_json::Value = resp.json().await.unwrap();
    let drawing_id = drawing["id"].as_str().unwrap();

    let resp = app
        .client
        .patch(app.url(&format!("/api/drawings/{}", drawing_id)))
        .json(&json!({ "stroke_color": "#00ff00", "stroke_width": 5.0 }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    let updated: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(updated["stroke_color"], "#00ff00");
}

#[tokio::test]
async fn test_delete_drawing() {
    let app = common::spawn_app().await;
    let layer_id = setup_drawing_layer(&app).await;

    let resp = app
        .client
        .post(app.url(&format!("/api/layers/{}/drawings", layer_id)))
        .json(&json!({ "drawing_type": "freehand", "points": [] }))
        .send()
        .await
        .unwrap();
    let drawing: serde_json::Value = resp.json().await.unwrap();
    let drawing_id = drawing["id"].as_str().unwrap();

    let resp = app
        .client
        .delete(app.url(&format!("/api/drawings/{}", drawing_id)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 204);
}
