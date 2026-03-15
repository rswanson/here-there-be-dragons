use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};

use reqwest::Client;
use server::config::Config;
use server::state::AppState;
use sqlx::PgPool;
use tempfile::TempDir;

static DB_COUNTER: AtomicU32 = AtomicU32::new(0);

/// A running test server with a connected HTTP client.
pub struct TestApp {
    pub addr: SocketAddr,
    pub client: Client,
    pub pool: PgPool,
    pub _asset_dir: TempDir,
    db_name: String,
}

impl TestApp {
    pub fn url(&self, path: &str) -> String {
        format!("http://{}{}", self.addr, path)
    }
}

impl Drop for TestApp {
    fn drop(&mut self) {
        // Schedule database cleanup (best-effort, runs in background)
        let db_name = self.db_name.clone();
        let pool = self.pool.clone();
        tokio::spawn(async move {
            pool.close().await;
            // Connect to admin db to drop the test database
            if let Ok(admin) =
                PgPool::connect("postgres://dragons:dragons@localhost:5432/postgres").await
            {
                let _ = sqlx::query(&format!("DROP DATABASE IF EXISTS \"{}\"", db_name))
                    .execute(&admin)
                    .await;
                admin.close().await;
            }
        });
    }
}

/// Spin up a test server on a random port with a unique database per test.
/// Requires the dev PostgreSQL from docker-compose.dev.yml to be running.
pub async fn spawn_app() -> TestApp {
    let db_num = DB_COUNTER.fetch_add(1, Ordering::SeqCst);
    let db_name = format!(
        "dragons_test_{}_{}_{}",
        std::process::id(),
        db_num,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
            % 100000
    );

    let admin_pool = PgPool::connect("postgres://dragons:dragons@localhost:5432/postgres")
        .await
        .expect("Failed to connect to PostgreSQL. Is docker-compose.dev.yml running?");

    sqlx::query(&format!("CREATE DATABASE \"{}\"", db_name))
        .execute(&admin_pool)
        .await
        .expect("Failed to create test database");
    admin_pool.close().await;

    let database_url = format!("postgres://dragons:dragons@localhost:5432/{}", db_name);
    let pool = db::create_pool(&database_url)
        .await
        .expect("Failed to connect to test database");

    db::run_migrations(&pool)
        .await
        .expect("Failed to run migrations");

    let asset_dir = TempDir::new().expect("Failed to create temp dir");

    let config = Config {
        database_url,
        jwt_secret: "test-secret-key-for-integration-tests".to_string(),
        asset_storage_path: asset_dir.path().to_path_buf(),
        bind_address: "127.0.0.1:0".to_string(),
        max_upload_size_mb: 25,
    };

    let storage = asset_store::create_storage(config.asset_storage_path.clone());

    let state = AppState {
        pool: pool.clone(),
        config,
        storage: Arc::from(storage),
    };

    let app = server::build_app(state);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("Failed to bind");
    let addr = listener.local_addr().unwrap();

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    let client = Client::builder()
        .cookie_store(true)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();

    TestApp {
        addr,
        client,
        pool,
        _asset_dir: asset_dir,
        db_name,
    }
}

/// Register a user and return the response. Keeps cookies in the client jar.
pub async fn register_user(
    app: &TestApp,
    email: &str,
    password: &str,
    display_name: &str,
) -> reqwest::Response {
    let resp = app
        .client
        .post(app.url("/api/auth/register"))
        .json(&serde_json::json!({
            "email": email,
            "password": password,
            "display_name": display_name
        }))
        .send()
        .await
        .expect("Failed to send register request");

    assert!(
        resp.status().is_success(),
        "Registration failed with status {}",
        resp.status()
    );
    resp
}

/// Register + create a campaign, returning campaign JSON.
pub async fn create_test_campaign(app: &TestApp, email: &str, name: &str) -> serde_json::Value {
    register_user(app, email, "password123", "Test User").await;
    let resp = app
        .client
        .post(app.url("/api/campaigns"))
        .json(&serde_json::json!({ "name": name }))
        .send()
        .await
        .expect("Failed to create campaign");
    assert!(
        resp.status().is_success(),
        "Campaign creation failed with status {}",
        resp.status()
    );
    resp.json()
        .await
        .expect("Failed to parse campaign response")
}
