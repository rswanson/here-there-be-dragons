mod common;

use common::{create_test_campaign, spawn_app};
use reqwest::multipart;

fn png_1x1() -> Vec<u8> {
    // Minimal valid 1x1 PNG image
    vec![
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77,
        0x53, 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
        0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21,
        0xBC, 0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, // IEND chunk
        0x44, 0xAE, 0x42, 0x60, 0x82,
    ]
}

async fn upload_png(app: &common::TestApp, campaign_id: &str) -> reqwest::Response {
    let form = multipart::Form::new().part(
        "file",
        multipart::Part::bytes(png_1x1())
            .file_name("test.png")
            .mime_str("image/png")
            .unwrap(),
    );

    app.client
        .post(app.url(&format!("/api/assets/campaigns/{}", campaign_id)))
        .multipart(form)
        .send()
        .await
        .unwrap()
}

#[tokio::test]
async fn upload_image_returns_asset_metadata() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@example.com", "Asset Test").await;
    let campaign_id = campaign["id"].as_str().unwrap();

    let resp = upload_png(&app, campaign_id).await;
    assert_eq!(resp.status(), 201);

    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["filename"], "test.png");
    assert_eq!(body["content_type"], "image/png");
    assert!(body["id"].is_string());
    assert!(body["size_bytes"].as_i64().unwrap() > 0);
}

#[tokio::test]
async fn upload_unsupported_type_returns_400() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@example.com", "Bad Upload").await;
    let campaign_id = campaign["id"].as_str().unwrap();

    let form = multipart::Form::new().part(
        "file",
        multipart::Part::bytes(b"not a zip".to_vec())
            .file_name("test.zip")
            .mime_str("application/zip")
            .unwrap(),
    );

    let resp = app
        .client
        .post(app.url(&format!("/api/assets/campaigns/{}", campaign_id)))
        .multipart(form)
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn player_cannot_upload() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@example.com", "DM Only Upload").await;
    let campaign_id = campaign["id"].as_str().unwrap();
    let invite_code = campaign["invite_code"].as_str().unwrap();

    // Player joins
    let client2 = reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .unwrap();
    client2
        .post(app.url("/api/auth/register"))
        .json(&serde_json::json!({
            "email": "player@example.com",
            "password": "password123",
            "display_name": "Player"
        }))
        .send()
        .await
        .unwrap();
    client2
        .post(app.url(&format!("/api/campaigns/join/{}", invite_code)))
        .send()
        .await
        .unwrap();

    // Player tries to upload
    let form = multipart::Form::new().part(
        "file",
        multipart::Part::bytes(png_1x1())
            .file_name("test.png")
            .mime_str("image/png")
            .unwrap(),
    );
    let resp = client2
        .post(app.url(&format!("/api/assets/campaigns/{}", campaign_id)))
        .multipart(form)
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 403);
}

#[tokio::test]
async fn list_assets_for_campaign() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@example.com", "Listing Test").await;
    let campaign_id = campaign["id"].as_str().unwrap();

    // Upload two assets
    upload_png(&app, campaign_id).await;
    upload_png(&app, campaign_id).await;

    let resp = app
        .client
        .get(app.url(&format!("/api/assets/campaigns/{}", campaign_id)))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
    let assets: Vec<serde_json::Value> = resp.json().await.unwrap();
    assert_eq!(assets.len(), 2);
}

#[tokio::test]
async fn list_assets_with_content_type_filter() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@example.com", "Filter Test").await;
    let campaign_id = campaign["id"].as_str().unwrap();

    upload_png(&app, campaign_id).await;

    // Filter for images
    let resp = app
        .client
        .get(app.url(&format!(
            "/api/assets/campaigns/{}?content_type=image/%25",
            campaign_id
        )))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let assets: Vec<serde_json::Value> = resp.json().await.unwrap();
    assert_eq!(assets.len(), 1);

    // Filter for PDFs (should be empty)
    let resp = app
        .client
        .get(app.url(&format!(
            "/api/assets/campaigns/{}?content_type=application/pdf",
            campaign_id
        )))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let assets: Vec<serde_json::Value> = resp.json().await.unwrap();
    assert!(assets.is_empty());
}

#[tokio::test]
async fn serve_asset_returns_binary_with_correct_content_type() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@example.com", "Serve Test").await;
    let campaign_id = campaign["id"].as_str().unwrap();

    let upload_resp = upload_png(&app, campaign_id).await;
    let asset: serde_json::Value = upload_resp.json().await.unwrap();
    let asset_id = asset["id"].as_str().unwrap();

    let resp = app
        .client
        .get(app.url(&format!("/api/assets/{}", asset_id)))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
    assert_eq!(
        resp.headers()
            .get("content-type")
            .unwrap()
            .to_str()
            .unwrap(),
        "image/png"
    );
    let body = resp.bytes().await.unwrap();
    assert_eq!(body.as_ref(), png_1x1().as_slice());
}

#[tokio::test]
async fn non_member_cannot_access_assets() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@example.com", "Private Assets").await;
    let campaign_id = campaign["id"].as_str().unwrap();

    let upload_resp = upload_png(&app, campaign_id).await;
    let asset: serde_json::Value = upload_resp.json().await.unwrap();
    let asset_id = asset["id"].as_str().unwrap();

    // Non-member tries to access
    let client2 = reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .unwrap();
    client2
        .post(app.url("/api/auth/register"))
        .json(&serde_json::json!({
            "email": "outsider@example.com",
            "password": "password123",
            "display_name": "Outsider"
        }))
        .send()
        .await
        .unwrap();

    let resp = client2
        .get(app.url(&format!("/api/assets/{}", asset_id)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 403);

    // Also can't list
    let resp = client2
        .get(app.url(&format!("/api/assets/campaigns/{}", campaign_id)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 403);
}

#[tokio::test]
async fn dm_can_delete_asset() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@example.com", "Delete Test").await;
    let campaign_id = campaign["id"].as_str().unwrap();

    let upload_resp = upload_png(&app, campaign_id).await;
    let asset: serde_json::Value = upload_resp.json().await.unwrap();
    let asset_id = asset["id"].as_str().unwrap();

    let resp = app
        .client
        .delete(app.url(&format!("/api/assets/{}", asset_id)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 204);

    // Should be gone
    let resp = app
        .client
        .get(app.url(&format!("/api/assets/{}", asset_id)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 404);
}

#[tokio::test]
async fn player_cannot_delete_asset() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@example.com", "No Delete").await;
    let campaign_id = campaign["id"].as_str().unwrap();
    let invite_code = campaign["invite_code"].as_str().unwrap();

    let upload_resp = upload_png(&app, campaign_id).await;
    let asset: serde_json::Value = upload_resp.json().await.unwrap();
    let asset_id = asset["id"].as_str().unwrap();

    // Player joins
    let client2 = reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .unwrap();
    client2
        .post(app.url("/api/auth/register"))
        .json(&serde_json::json!({
            "email": "player@example.com",
            "password": "password123",
            "display_name": "Player"
        }))
        .send()
        .await
        .unwrap();
    client2
        .post(app.url(&format!("/api/campaigns/join/{}", invite_code)))
        .send()
        .await
        .unwrap();

    let resp = client2
        .delete(app.url(&format!("/api/assets/{}", asset_id)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 403);
}

#[tokio::test]
async fn player_can_view_assets() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@example.com", "Shared Assets").await;
    let campaign_id = campaign["id"].as_str().unwrap();
    let invite_code = campaign["invite_code"].as_str().unwrap();

    let upload_resp = upload_png(&app, campaign_id).await;
    let asset: serde_json::Value = upload_resp.json().await.unwrap();
    let asset_id = asset["id"].as_str().unwrap();

    // Player joins
    let client2 = reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .unwrap();
    client2
        .post(app.url("/api/auth/register"))
        .json(&serde_json::json!({
            "email": "player@example.com",
            "password": "password123",
            "display_name": "Player"
        }))
        .send()
        .await
        .unwrap();
    client2
        .post(app.url(&format!("/api/campaigns/join/{}", invite_code)))
        .send()
        .await
        .unwrap();

    // Player can list assets
    let resp = client2
        .get(app.url(&format!("/api/assets/campaigns/{}", campaign_id)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let assets: Vec<serde_json::Value> = resp.json().await.unwrap();
    assert_eq!(assets.len(), 1);

    // Player can serve/download asset
    let resp = client2
        .get(app.url(&format!("/api/assets/{}", asset_id)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
}
