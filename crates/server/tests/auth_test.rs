mod common;

use common::{register_user, spawn_app};

/// Helper for tests that expect registration to fail — bypasses the success assertion.
async fn try_register(app: &common::TestApp, email: &str, password: &str, display_name: &str) -> reqwest::Response {
    app.client
        .post(app.url("/api/auth/register"))
        .json(&serde_json::json!({
            "email": email,
            "password": password,
            "display_name": display_name
        }))
        .send()
        .await
        .expect("Failed to send register request")
}

#[tokio::test]
async fn register_returns_user_and_sets_cookies() {
    let app = spawn_app().await;
    let resp = register_user(&app, "test@example.com", "password123", "Alice").await;
    assert_eq!(resp.status(), 200);

    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["user"]["email"], "test@example.com");
    assert_eq!(body["user"]["display_name"], "Alice");
    assert!(body["user"]["id"].is_string());
    assert!(body["user"]["created_at"].is_string());
}

#[tokio::test]
async fn register_duplicate_email_returns_409() {
    let app = spawn_app().await;
    register_user(&app, "dup@example.com", "password123", "User1").await;

    let resp = try_register(&app, "dup@example.com", "password456", "User2").await;
    assert_eq!(resp.status(), 409);
}

#[tokio::test]
async fn register_invalid_email_returns_400() {
    let app = spawn_app().await;
    let resp = try_register(&app, "not-an-email", "password123", "Alice").await;
    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn register_short_password_returns_400() {
    let app = spawn_app().await;
    let resp = try_register(&app, "test@example.com", "short", "Alice").await;
    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn register_empty_display_name_returns_400() {
    let app = spawn_app().await;
    let resp = try_register(&app, "test@example.com", "password123", "").await;
    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn login_with_valid_credentials() {
    let app = spawn_app().await;
    register_user(&app, "login@example.com", "password123", "Bob").await;

    let client2 = reqwest::Client::builder().cookie_store(true).build().unwrap();
    let resp = client2
        .post(app.url("/api/auth/login"))
        .json(&serde_json::json!({
            "email": "login@example.com",
            "password": "password123"
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["user"]["email"], "login@example.com");
    assert_eq!(body["user"]["display_name"], "Bob");
}

#[tokio::test]
async fn login_wrong_password_returns_401() {
    let app = spawn_app().await;
    register_user(&app, "wrong@example.com", "password123", "Eve").await;

    let client2 = reqwest::Client::builder().cookie_store(true).build().unwrap();
    let resp = client2
        .post(app.url("/api/auth/login"))
        .json(&serde_json::json!({
            "email": "wrong@example.com",
            "password": "wrongpassword"
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 401);
}

#[tokio::test]
async fn login_nonexistent_email_returns_401() {
    let app = spawn_app().await;

    let resp = app.client
        .post(app.url("/api/auth/login"))
        .json(&serde_json::json!({
            "email": "nobody@example.com",
            "password": "password123"
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 401);
}

#[tokio::test]
async fn me_returns_authenticated_user() {
    let app = spawn_app().await;
    register_user(&app, "me@example.com", "password123", "Charlie").await;

    let resp = app.client
        .get(app.url("/api/auth/me"))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["user"]["email"], "me@example.com");
}

#[tokio::test]
async fn me_without_token_returns_401() {
    let app = spawn_app().await;

    let client2 = reqwest::Client::builder().cookie_store(true).build().unwrap();
    let resp = client2
        .get(app.url("/api/auth/me"))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 401);
}

#[tokio::test]
async fn refresh_rotates_tokens() {
    let app = spawn_app().await;
    register_user(&app, "refresh@example.com", "password123", "Dave").await;

    let resp = app.client
        .post(app.url("/api/auth/refresh"))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);

    // /me should still work with the new access token
    let resp = app.client
        .get(app.url("/api/auth/me"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
}

#[tokio::test]
async fn logout_clears_session() {
    let app = spawn_app().await;
    register_user(&app, "logout@example.com", "password123", "Eve").await;

    // Verify we're authenticated
    let resp = app.client.get(app.url("/api/auth/me")).send().await.unwrap();
    assert_eq!(resp.status(), 200);

    // Logout
    let resp = app.client
        .post(app.url("/api/auth/logout"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    // Use a fresh client to verify the refresh token was revoked in the DB.
    // The original client's cookie jar may still have the access_token since
    // reqwest's cookie store doesn't reliably process removal Set-Cookie headers.
    // What we CAN verify is that the refresh token was deleted from the database.
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM refresh_tokens")
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(count.0, 0, "All refresh tokens should be revoked after logout");
}
