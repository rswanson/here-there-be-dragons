mod common;

use common::{create_test_campaign, register_user, spawn_app};

#[tokio::test]
async fn create_campaign_returns_campaign_with_invite_code() {
    let app = spawn_app().await;
    register_user(&app, "dm@example.com", "password123", "DM").await;

    let resp = app
        .client
        .post(app.url("/api/campaigns"))
        .json(&serde_json::json!({ "name": "Dragon's Lair" }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["name"], "Dragon's Lair");
    assert!(body["invite_code"].is_string());
    assert!(!body["invite_code"].as_str().unwrap().is_empty());
    assert!(body["id"].is_string());
    assert!(body["owner_id"].is_string());
}

#[tokio::test]
async fn create_campaign_empty_name_returns_400() {
    let app = spawn_app().await;
    register_user(&app, "dm@example.com", "password123", "DM").await;

    let resp = app
        .client
        .post(app.url("/api/campaigns"))
        .json(&serde_json::json!({ "name": "" }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn create_campaign_unauthenticated_returns_401() {
    let app = spawn_app().await;

    let client2 = reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .unwrap();
    let resp = client2
        .post(app.url("/api/campaigns"))
        .json(&serde_json::json!({ "name": "Secret Campaign" }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 401);
}

#[tokio::test]
async fn list_campaigns_returns_only_member_campaigns() {
    let app = spawn_app().await;

    // User 1 creates a campaign
    register_user(&app, "user1@example.com", "password123", "User1").await;
    app.client
        .post(app.url("/api/campaigns"))
        .json(&serde_json::json!({ "name": "Campaign A" }))
        .send()
        .await
        .unwrap();

    let resp = app
        .client
        .get(app.url("/api/campaigns"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let campaigns: Vec<serde_json::Value> = resp.json().await.unwrap();
    assert_eq!(campaigns.len(), 1);
    assert_eq!(campaigns[0]["name"], "Campaign A");

    // User 2 should see no campaigns
    let client2 = reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .unwrap();
    client2
        .post(app.url("/api/auth/register"))
        .json(&serde_json::json!({
            "email": "user2@example.com",
            "password": "password123",
            "display_name": "User2"
        }))
        .send()
        .await
        .unwrap();

    let resp = client2.get(app.url("/api/campaigns")).send().await.unwrap();
    assert_eq!(resp.status(), 200);
    let campaigns: Vec<serde_json::Value> = resp.json().await.unwrap();
    assert!(campaigns.is_empty());
}

#[tokio::test]
async fn get_campaign_as_member() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@example.com", "My Campaign").await;
    let id = campaign["id"].as_str().unwrap();

    let resp = app
        .client
        .get(app.url(&format!("/api/campaigns/{}", id)))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["name"], "My Campaign");
}

#[tokio::test]
async fn get_campaign_non_member_returns_403() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@example.com", "Private Campaign").await;
    let id = campaign["id"].as_str().unwrap();

    // Register a different user
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
        .get(app.url(&format!("/api/campaigns/{}", id)))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 403);
}

#[tokio::test]
async fn join_campaign_via_invite_code() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@example.com", "Open Campaign").await;
    let invite_code = campaign["invite_code"].as_str().unwrap();

    // New user joins
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

    let resp = client2
        .post(app.url(&format!("/api/campaigns/join/{}", invite_code)))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["name"], "Open Campaign");

    // Player should now see the campaign in their list
    let resp = client2.get(app.url("/api/campaigns")).send().await.unwrap();
    let campaigns: Vec<serde_json::Value> = resp.json().await.unwrap();
    assert_eq!(campaigns.len(), 1);
}

#[tokio::test]
async fn join_campaign_invalid_code_returns_404() {
    let app = spawn_app().await;
    register_user(&app, "user@example.com", "password123", "User").await;

    let resp = app
        .client
        .post(app.url("/api/campaigns/join/invalidcode123"))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 404);
}

#[tokio::test]
async fn list_members_shows_all_with_roles() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@example.com", "Team Campaign").await;
    let id = campaign["id"].as_str().unwrap();
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

    // DM lists members
    let resp = app
        .client
        .get(app.url(&format!("/api/campaigns/{}/members", id)))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
    let members: Vec<serde_json::Value> = resp.json().await.unwrap();
    assert_eq!(members.len(), 2);

    let roles: Vec<&str> = members
        .iter()
        .map(|m| m["role"].as_str().unwrap())
        .collect();
    assert!(roles.contains(&"dm"));
    assert!(roles.contains(&"player"));
}

#[tokio::test]
async fn dm_can_remove_player() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@example.com", "Strict Campaign").await;
    let id = campaign["id"].as_str().unwrap();
    let invite_code = campaign["invite_code"].as_str().unwrap();

    // Player joins
    let client2 = reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .unwrap();
    let player_resp = client2
        .post(app.url("/api/auth/register"))
        .json(&serde_json::json!({
            "email": "player@example.com",
            "password": "password123",
            "display_name": "Player"
        }))
        .send()
        .await
        .unwrap();
    let player_body: serde_json::Value = player_resp.json().await.unwrap();
    let player_id = player_body["user"]["id"].as_str().unwrap();

    client2
        .post(app.url(&format!("/api/campaigns/join/{}", invite_code)))
        .send()
        .await
        .unwrap();

    // DM removes player
    let resp = app
        .client
        .delete(app.url(&format!("/api/campaigns/{}/members/{}", id, player_id)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    // Player should no longer be in the campaign
    let resp = app
        .client
        .get(app.url(&format!("/api/campaigns/{}/members", id)))
        .send()
        .await
        .unwrap();
    let members: Vec<serde_json::Value> = resp.json().await.unwrap();
    assert_eq!(members.len(), 1);
    assert_eq!(members[0]["role"], "dm");
}

#[tokio::test]
async fn player_cannot_remove_members() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@example.com", "Protected Campaign").await;
    let id = campaign["id"].as_str().unwrap();
    let invite_code = campaign["invite_code"].as_str().unwrap();
    let dm_body: serde_json::Value = app
        .client
        .get(app.url("/api/auth/me"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let dm_id = dm_body["user"]["id"].as_str().unwrap();

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

    // Player tries to remove DM
    let resp = client2
        .delete(app.url(&format!("/api/campaigns/{}/members/{}", id, dm_id)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 403);
}

#[tokio::test]
async fn dm_cannot_be_removed() {
    let app = spawn_app().await;
    let campaign = create_test_campaign(&app, "dm@example.com", "Safe Campaign").await;
    let id = campaign["id"].as_str().unwrap();
    let dm_id = campaign["owner_id"].as_str().unwrap();

    // DM tries to remove themselves (the SQL prevents removing DM role)
    app.client
        .delete(app.url(&format!("/api/campaigns/{}/members/{}", id, dm_id)))
        .send()
        .await
        .unwrap();

    // Should succeed as a request but the DM row shouldn't be deleted (role != 'dm' filter)
    // Verify DM is still a member
    let resp = app
        .client
        .get(app.url(&format!("/api/campaigns/{}/members", id)))
        .send()
        .await
        .unwrap();
    let members: Vec<serde_json::Value> = resp.json().await.unwrap();
    assert_eq!(members.len(), 1);
    assert_eq!(members[0]["role"], "dm");
}
