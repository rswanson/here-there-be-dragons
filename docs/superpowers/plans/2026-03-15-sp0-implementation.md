# SP-0: Tech Stack & Foundation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational project skeleton — Rust workspace, React client, PostgreSQL database, auth system, asset library, and deployment pipeline — so subsequent sub-projects have a solid base to build on.

**Architecture:** Cargo workspace with 4 crates (core, db, asset-store, server) serving a React + Vite + TypeScript frontend. PostgreSQL for persistence, WebSockets for real-time, JWT for auth. Docker Compose for deployment.

**Tech Stack:** Rust (Axum, sqlx, tokio, serde, ts-rs), React 18 (Vite, Zustand, TanStack Query, Radix UI, PixiJS), PostgreSQL 16, Docker

---

## Chunk 1: Project Skeleton & Cargo Workspace

### Task 1: Initialize Repository & Root Files

**Files:**
- Create: `Cargo.toml`
- Create: `LICENSE`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Create workspace Cargo.toml**

```toml
[workspace]
resolver = "2"
members = [
    "crates/htbd-core",
    "crates/db",
    "crates/asset-store",
    "crates/server",
]

[workspace.package]
version = "0.1.0"
edition = "2024"
license = "AGPL-3.0"
repository = "https://github.com/rswanson/here-there-be-dragons"

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
tokio = { version = "1", features = ["full"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
thiserror = "2"
ts-rs = { version = "10", features = ["serde-json-impl", "uuid-impl", "chrono-impl"] }
sqlx = { version = "0.8", features = ["runtime-tokio", "postgres", "uuid", "chrono"] }
axum = { version = "0.8", features = ["ws", "multipart"] }
tower = "0.5"
tower-http = { version = "0.6", features = ["cors", "trace", "fs"] }
```

- [ ] **Step 2: Create .gitignore**

```
target/
node_modules/
.env
client/dist/
.sqlx/
*.swp
*.swo
.DS_Store
```

- [ ] **Step 3: Create .env.example**

```
DATABASE_URL=postgres://dragons:dragons@localhost:5432/dragons
JWT_SECRET=change-me-in-production
ASSET_STORAGE_PATH=./data/assets
BIND_ADDRESS=0.0.0.0:3000
MAX_UPLOAD_SIZE_MB=25
RUST_LOG=info,server=debug
```

- [ ] **Step 4: Create LICENSE**

Download AGPL-3.0 text:
```bash
curl -sL https://www.gnu.org/licenses/agpl-3.0.txt > LICENSE
```

- [ ] **Step 5: Commit**

```bash
git add Cargo.toml LICENSE .gitignore .env.example
git commit -m "feat: initialize workspace with root config files"
```

---

### Task 2: Create Core Crate

**Files:**
- Create: `crates/htbd-core/Cargo.toml`
- Create: `crates/htbd-core/src/lib.rs`
- Create: `crates/htbd-core/src/models.rs`
- Create: `crates/htbd-core/src/messages.rs`
- Create: `crates/htbd-core/src/auth.rs`

- [ ] **Step 1: Create crate Cargo.toml**

```toml
[package]
name = "htbd-core"
version.workspace = true
edition.workspace = true

[dependencies]
serde.workspace = true
serde_json.workspace = true
uuid.workspace = true
chrono.workspace = true
ts-rs.workspace = true
```

- [ ] **Step 2: Create domain models**

Create `crates/htbd-core/src/models.rs`:

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Campaign {
    pub id: Uuid,
    pub name: String,
    pub owner_id: Uuid,
    pub invite_code: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "lowercase")]
pub enum CampaignRole {
    Dm,
    Player,
}

impl std::fmt::Display for CampaignRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CampaignRole::Dm => write!(f, "dm"),
            CampaignRole::Player => write!(f, "player"),
        }
    }
}

impl std::str::FromStr for CampaignRole {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "dm" => Ok(CampaignRole::Dm),
            "player" => Ok(CampaignRole::Player),
            _ => Err(format!("invalid role: {s}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CampaignMember {
    pub campaign_id: Uuid,
    pub user_id: Uuid,
    pub role: CampaignRole,
    pub display_name: String,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Asset {
    pub id: Uuid,
    pub campaign_id: Uuid,
    pub uploaded_by: Uuid,
    pub filename: String,
    pub content_type: String,
    pub size_bytes: i64,
    pub created_at: DateTime<Utc>,
}
```

- [ ] **Step 3: Create WebSocket message types**

Create `crates/htbd-core/src/messages.rs`:

```rust
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

/// Messages sent from client to server
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "type", content = "payload")]
pub enum ClientMessage {
    Ping,
    // Future sub-projects add variants here
}

/// Messages sent from server to client
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "type", content = "payload")]
pub enum ServerMessage {
    Pong,
    Error { code: String, message: String },
    // Future sub-projects add variants here
}
```

- [ ] **Step 4: Create auth types**

Create `crates/htbd-core/src/auth.rs`:

```rust
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,
    pub exp: i64,
    pub iat: i64,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AuthResponse {
    pub user: super::models::User,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub display_name: String,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}
```

- [ ] **Step 5: Create lib.rs with re-exports and ts-rs export test**

Create `crates/htbd-core/src/lib.rs`:

```rust
pub mod auth;
pub mod messages;
pub mod models;

// Re-export commonly used types
pub use models::*;
pub use messages::*;

#[cfg(test)]
mod tests {
    use super::*;
    use ts_rs::TS;

    #[test]
    fn export_bindings() {
        let out_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../client/src/types");
        std::fs::create_dir_all(&out_dir).unwrap();

        // Models
        models::User::export_all_to(&out_dir).unwrap();
        models::Campaign::export_all_to(&out_dir).unwrap();
        models::CampaignRole::export_all_to(&out_dir).unwrap();
        models::CampaignMember::export_all_to(&out_dir).unwrap();
        models::Asset::export_all_to(&out_dir).unwrap();

        // Messages
        messages::ClientMessage::export_all_to(&out_dir).unwrap();
        messages::ServerMessage::export_all_to(&out_dir).unwrap();

        // Auth
        auth::AuthResponse::export_all_to(&out_dir).unwrap();
        auth::RegisterRequest::export_all_to(&out_dir).unwrap();
        auth::LoginRequest::export_all_to(&out_dir).unwrap();
    }
}
```

- [ ] **Step 6: Verify it compiles**

```bash
cargo check -p htbd-core
```
Expected: compiles with no errors.

- [ ] **Step 7: Commit**

```bash
git add crates/htbd-core/
git commit -m "feat: add core crate with domain types and WebSocket messages"
```

---

### Task 3: Create Database Crate with Migrations

**Files:**
- Create: `crates/db/Cargo.toml`
- Create: `crates/db/src/lib.rs`
- Create: `crates/db/src/users.rs`
- Create: `crates/db/src/campaigns.rs`
- Create: `crates/db/src/assets.rs`
- Create: `crates/db/src/refresh_tokens.rs`
- Create: `migrations/001_initial.sql`

- [ ] **Step 1: Create crate Cargo.toml**

```toml
[package]
name = "db"
version.workspace = true
edition.workspace = true

[dependencies]
htbd-core = { path = "../htbd-core" }
sqlx.workspace = true
uuid.workspace = true
chrono.workspace = true
thiserror.workspace = true
tracing.workspace = true
```

- [ ] **Step 2: Create the initial migration**

Create `migrations/001_initial.sql`:

```sql
CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          TEXT UNIQUE NOT NULL,
    password_hash  TEXT NOT NULL,
    display_name   TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE campaigns (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT NOT NULL,
    owner_id       UUID NOT NULL REFERENCES users(id),
    invite_code    TEXT UNIQUE NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE campaign_members (
    campaign_id    UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role           TEXT NOT NULL CHECK (role IN ('dm', 'player')),
    joined_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (campaign_id, user_id)
);

CREATE UNIQUE INDEX one_dm_per_campaign ON campaign_members (campaign_id) WHERE role = 'dm';

CREATE TABLE refresh_tokens (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash     TEXT NOT NULL,
    expires_at     TIMESTAMPTZ NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE assets (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id    UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    uploaded_by    UUID NOT NULL REFERENCES users(id),
    filename       TEXT NOT NULL,
    content_type   TEXT NOT NULL,
    storage_path   TEXT NOT NULL,
    size_bytes     BIGINT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 3: Create users repository**

Create `crates/db/src/users.rs`:

```rust
use sqlx::PgPool;
use uuid::Uuid;

pub struct UserRow {
    pub id: Uuid,
    pub email: String,
    pub password_hash: String,
    pub display_name: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn create_user(
    pool: &PgPool,
    email: &str,
    password_hash: &str,
    display_name: &str,
) -> Result<UserRow, sqlx::Error> {
    sqlx::query_as!(
        UserRow,
        r#"
        INSERT INTO users (email, password_hash, display_name)
        VALUES ($1, $2, $3)
        RETURNING id, email, password_hash, display_name, created_at
        "#,
        email,
        password_hash,
        display_name,
    )
    .fetch_one(pool)
    .await
}

pub async fn find_by_email(pool: &PgPool, email: &str) -> Result<Option<UserRow>, sqlx::Error> {
    sqlx::query_as!(
        UserRow,
        "SELECT id, email, password_hash, display_name, created_at FROM users WHERE email = $1",
        email,
    )
    .fetch_optional(pool)
    .await
}

pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<UserRow>, sqlx::Error> {
    sqlx::query_as!(
        UserRow,
        "SELECT id, email, password_hash, display_name, created_at FROM users WHERE id = $1",
        id,
    )
    .fetch_optional(pool)
    .await
}
```

- [ ] **Step 4: Create campaigns repository**

Create `crates/db/src/campaigns.rs`:

```rust
use sqlx::PgPool;
use uuid::Uuid;

pub struct CampaignRow {
    pub id: Uuid,
    pub name: String,
    pub owner_id: Uuid,
    pub invite_code: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

pub struct CampaignMemberRow {
    pub campaign_id: Uuid,
    pub user_id: Uuid,
    pub role: String,
    pub joined_at: chrono::DateTime<chrono::Utc>,
    pub display_name: String,
}

pub async fn create_campaign(
    pool: &PgPool,
    name: &str,
    owner_id: Uuid,
    invite_code: &str,
) -> Result<CampaignRow, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let campaign = sqlx::query_as!(
        CampaignRow,
        r#"
        INSERT INTO campaigns (name, owner_id, invite_code)
        VALUES ($1, $2, $3)
        RETURNING id, name, owner_id, invite_code, created_at, updated_at
        "#,
        name,
        owner_id,
        invite_code,
    )
    .fetch_one(&mut *tx)
    .await?;

    // Auto-add owner as DM
    sqlx::query!(
        "INSERT INTO campaign_members (campaign_id, user_id, role) VALUES ($1, $2, 'dm')",
        campaign.id,
        owner_id,
    )
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(campaign)
}

pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<CampaignRow>, sqlx::Error> {
    sqlx::query_as!(
        CampaignRow,
        "SELECT id, name, owner_id, invite_code, created_at, updated_at FROM campaigns WHERE id = $1",
        id,
    )
    .fetch_optional(pool)
    .await
}

pub async fn find_by_invite_code(
    pool: &PgPool,
    invite_code: &str,
) -> Result<Option<CampaignRow>, sqlx::Error> {
    sqlx::query_as!(
        CampaignRow,
        "SELECT id, name, owner_id, invite_code, created_at, updated_at FROM campaigns WHERE invite_code = $1",
        invite_code,
    )
    .fetch_optional(pool)
    .await
}

pub async fn list_for_user(pool: &PgPool, user_id: Uuid) -> Result<Vec<CampaignRow>, sqlx::Error> {
    sqlx::query_as!(
        CampaignRow,
        r#"
        SELECT c.id, c.name, c.owner_id, c.invite_code, c.created_at, c.updated_at
        FROM campaigns c
        JOIN campaign_members cm ON c.id = cm.campaign_id
        WHERE cm.user_id = $1
        ORDER BY c.updated_at DESC
        "#,
        user_id,
    )
    .fetch_all(pool)
    .await
}

pub async fn add_member(
    pool: &PgPool,
    campaign_id: Uuid,
    user_id: Uuid,
    role: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO campaign_members (campaign_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        campaign_id,
        user_id,
        role,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn remove_member(
    pool: &PgPool,
    campaign_id: Uuid,
    user_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM campaign_members WHERE campaign_id = $1 AND user_id = $2 AND role != 'dm'",
        campaign_id,
        user_id,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_member_role(
    pool: &PgPool,
    campaign_id: Uuid,
    user_id: Uuid,
) -> Result<Option<String>, sqlx::Error> {
    let row = sqlx::query_scalar!(
        "SELECT role FROM campaign_members WHERE campaign_id = $1 AND user_id = $2",
        campaign_id,
        user_id,
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn list_members(
    pool: &PgPool,
    campaign_id: Uuid,
) -> Result<Vec<CampaignMemberRow>, sqlx::Error> {
    sqlx::query_as!(
        CampaignMemberRow,
        r#"
        SELECT cm.campaign_id, cm.user_id, cm.role, cm.joined_at, u.display_name
        FROM campaign_members cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.campaign_id = $1
        ORDER BY cm.joined_at
        "#,
        campaign_id,
    )
    .fetch_all(pool)
    .await
}
```

- [ ] **Step 5: Create assets repository**

Create `crates/db/src/assets.rs`:

```rust
use sqlx::PgPool;
use uuid::Uuid;

pub struct AssetRow {
    pub id: Uuid,
    pub campaign_id: Uuid,
    pub uploaded_by: Uuid,
    pub filename: String,
    pub content_type: String,
    pub storage_path: String,
    pub size_bytes: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn create_asset(
    pool: &PgPool,
    campaign_id: Uuid,
    uploaded_by: Uuid,
    filename: &str,
    content_type: &str,
    storage_path: &str,
    size_bytes: i64,
) -> Result<AssetRow, sqlx::Error> {
    sqlx::query_as!(
        AssetRow,
        r#"
        INSERT INTO assets (campaign_id, uploaded_by, filename, content_type, storage_path, size_bytes)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, campaign_id, uploaded_by, filename, content_type, storage_path, size_bytes, created_at
        "#,
        campaign_id,
        uploaded_by,
        filename,
        content_type,
        storage_path,
        size_bytes,
    )
    .fetch_one(pool)
    .await
}

pub async fn list_for_campaign(
    pool: &PgPool,
    campaign_id: Uuid,
    content_type_filter: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<Vec<AssetRow>, sqlx::Error> {
    sqlx::query_as!(
        AssetRow,
        r#"
        SELECT id, campaign_id, uploaded_by, filename, content_type, storage_path, size_bytes, created_at
        FROM assets
        WHERE campaign_id = $1
        AND ($2::text IS NULL OR content_type LIKE $2)
        ORDER BY created_at DESC
        LIMIT $3 OFFSET $4
        "#,
        campaign_id,
        content_type_filter,
        limit,
        offset,
    )
    .fetch_all(pool)
    .await
}

pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<AssetRow>, sqlx::Error> {
    sqlx::query_as!(
        AssetRow,
        "SELECT id, campaign_id, uploaded_by, filename, content_type, storage_path, size_bytes, created_at FROM assets WHERE id = $1",
        id,
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_asset(pool: &PgPool, id: Uuid) -> Result<Option<AssetRow>, sqlx::Error> {
    sqlx::query_as!(
        AssetRow,
        r#"
        DELETE FROM assets WHERE id = $1
        RETURNING id, campaign_id, uploaded_by, filename, content_type, storage_path, size_bytes, created_at
        "#,
        id,
    )
    .fetch_optional(pool)
    .await
}
```

- [ ] **Step 6: Create refresh tokens repository**

Create `crates/db/src/refresh_tokens.rs`:

```rust
use sqlx::PgPool;
use uuid::Uuid;

pub struct RefreshTokenRow {
    pub id: Uuid,
    pub user_id: Uuid,
    pub token_hash: String,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn create_refresh_token(
    pool: &PgPool,
    user_id: Uuid,
    token_hash: &str,
    expires_at: chrono::DateTime<chrono::Utc>,
) -> Result<RefreshTokenRow, sqlx::Error> {
    sqlx::query_as!(
        RefreshTokenRow,
        r#"
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
        RETURNING id, user_id, token_hash, expires_at, created_at
        "#,
        user_id,
        token_hash,
        expires_at,
    )
    .fetch_one(pool)
    .await
}

pub async fn find_by_hash(
    pool: &PgPool,
    token_hash: &str,
) -> Result<Option<RefreshTokenRow>, sqlx::Error> {
    sqlx::query_as!(
        RefreshTokenRow,
        "SELECT id, user_id, token_hash, expires_at, created_at FROM refresh_tokens WHERE token_hash = $1",
        token_hash,
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_token(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM refresh_tokens WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_all_for_user(pool: &PgPool, user_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query!("DELETE FROM refresh_tokens WHERE user_id = $1", user_id)
        .execute(pool)
        .await?;
    Ok(())
}
```

- [ ] **Step 7: Create db lib.rs**

Create `crates/db/src/lib.rs`:

```rust
pub mod assets;
pub mod campaigns;
pub mod refresh_tokens;
pub mod users;

use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

pub async fn create_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(20)
        .connect(database_url)
        .await
}

pub async fn run_migrations(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("../../migrations").run(pool).await
}
```

- [ ] **Step 8: Verify it compiles**

```bash
cargo check -p db
```
Expected: compiles (sqlx queries will be checked at test time against a live DB).

- [ ] **Step 9: Commit**

```bash
git add crates/db/ migrations/
git commit -m "feat: add db crate with migrations and repositories"
```

---

### Task 4: Create Asset Store Crate

**Files:**
- Create: `crates/asset-store/Cargo.toml`
- Create: `crates/asset-store/src/lib.rs`
- Create: `crates/asset-store/src/local.rs`

- [ ] **Step 1: Create crate Cargo.toml**

```toml
[package]
name = "asset-store"
version.workspace = true
edition.workspace = true

[dependencies]
tokio.workspace = true
thiserror.workspace = true
tracing.workspace = true
async-trait = "0.1"
```

- [ ] **Step 2: Create StorageBackend trait**

Create `crates/asset-store/src/lib.rs`:

```rust
pub mod local;

use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Asset not found: {0}")]
    NotFound(String),
}

#[async_trait::async_trait]
pub trait StorageBackend: Send + Sync {
    async fn store(&self, path: &str, data: &[u8]) -> Result<(), StorageError>;
    async fn retrieve(&self, path: &str) -> Result<Vec<u8>, StorageError>;
    async fn delete(&self, path: &str) -> Result<(), StorageError>;
    async fn exists(&self, path: &str) -> Result<bool, StorageError>;
}

/// Create the configured storage backend based on environment.
/// For now, always returns LocalStorage. S3 support added later.
pub fn create_storage(base_path: PathBuf) -> Box<dyn StorageBackend> {
    Box::new(local::LocalStorage::new(base_path))
}
```

- [ ] **Step 3: Create local filesystem implementation**

Create `crates/asset-store/src/local.rs`:

```rust
use crate::{StorageBackend, StorageError};
use std::path::PathBuf;

pub struct LocalStorage {
    base_path: PathBuf,
}

impl LocalStorage {
    pub fn new(base_path: PathBuf) -> Self {
        Self { base_path }
    }

    fn full_path(&self, path: &str) -> PathBuf {
        self.base_path.join(path)
    }
}

#[async_trait::async_trait]
impl StorageBackend for LocalStorage {
    async fn store(&self, path: &str, data: &[u8]) -> Result<(), StorageError> {
        let full_path = self.full_path(path);
        if let Some(parent) = full_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(&full_path, data).await?;
        Ok(())
    }

    async fn retrieve(&self, path: &str) -> Result<Vec<u8>, StorageError> {
        let full_path = self.full_path(path);
        if !full_path.exists() {
            return Err(StorageError::NotFound(path.to_string()));
        }
        Ok(tokio::fs::read(&full_path).await?)
    }

    async fn delete(&self, path: &str) -> Result<(), StorageError> {
        let full_path = self.full_path(path);
        if full_path.exists() {
            tokio::fs::remove_file(&full_path).await?;
        }
        Ok(())
    }

    async fn exists(&self, path: &str) -> Result<bool, StorageError> {
        Ok(self.full_path(path).exists())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_store_and_retrieve() {
        let dir = TempDir::new().unwrap();
        let storage = LocalStorage::new(dir.path().to_path_buf());

        storage.store("test/file.txt", b"hello world").await.unwrap();
        let data = storage.retrieve("test/file.txt").await.unwrap();
        assert_eq!(data, b"hello world");
    }

    #[tokio::test]
    async fn test_delete() {
        let dir = TempDir::new().unwrap();
        let storage = LocalStorage::new(dir.path().to_path_buf());

        storage.store("file.txt", b"data").await.unwrap();
        assert!(storage.exists("file.txt").await.unwrap());

        storage.delete("file.txt").await.unwrap();
        assert!(!storage.exists("file.txt").await.unwrap());
    }

    #[tokio::test]
    async fn test_retrieve_not_found() {
        let dir = TempDir::new().unwrap();
        let storage = LocalStorage::new(dir.path().to_path_buf());

        let result = storage.retrieve("nonexistent.txt").await;
        assert!(matches!(result, Err(StorageError::NotFound(_))));
    }
}
```

Add `tempfile` as a dev dependency in `crates/asset-store/Cargo.toml`:

```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 4: Run tests**

```bash
cargo test -p asset-store
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/asset-store/
git commit -m "feat: add asset-store crate with local filesystem backend"
```

---

### Task 4a: Set Up Dev Database & Generate sqlx Offline Data

**IMPORTANT:** This task MUST be completed before any server crate work. The `db` crate uses `sqlx::query_as!` macros which require either a live database or `.sqlx/` offline data to compile.

**Files:**
- Create: `docker/docker-compose.dev.yml`

- [ ] **Step 1: Create dev compose file**

Create `docker/docker-compose.dev.yml`:

```yaml
services:
  db:
    image: postgres:16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: dragons
      POSTGRES_PASSWORD: dragons
      POSTGRES_DB: dragons
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

- [ ] **Step 2: Start the database and run migrations**

```bash
docker compose -f docker/docker-compose.dev.yml up -d
export DATABASE_URL=postgres://dragons:dragons@localhost:5432/dragons
cargo sqlx migrate run --source migrations
```

- [ ] **Step 3: Generate sqlx offline data**

```bash
cargo sqlx prepare --workspace
```

This creates the `.sqlx/` directory. Commit it so CI and other developers can build without a live database.

- [ ] **Step 4: Verify the db crate compiles**

```bash
SQLX_OFFLINE=true cargo check -p db
```

- [ ] **Step 5: Commit**

```bash
git add docker/docker-compose.dev.yml .sqlx/
git commit -m "feat: add dev database setup and sqlx offline data"
```

---

## Chunk 2: Server Crate — Config, State, Error Handling, Auth

### Task 5: Server Crate Skeleton

**Files:**
- Create: `crates/server/Cargo.toml`
- Create: `crates/server/src/main.rs`
- Create: `crates/server/src/config.rs`
- Create: `crates/server/src/state.rs`
- Create: `crates/server/src/error.rs`
- Create: `crates/server/src/routes/mod.rs`
- Create: `crates/server/src/middleware/mod.rs`

- [ ] **Step 1: Create server Cargo.toml**

```toml
[package]
name = "server"
version.workspace = true
edition.workspace = true

[dependencies]
htbd-core = { path = "../htbd-core" }
db = { path = "../db" }
asset-store = { path = "../asset-store" }

axum.workspace = true
tokio.workspace = true
tower.workspace = true
tower-http.workspace = true
serde.workspace = true
serde_json.workspace = true
uuid.workspace = true
chrono.workspace = true
tracing.workspace = true
tracing-subscriber.workspace = true
sqlx.workspace = true
thiserror.workspace = true

rust-argon2 = "2"
jsonwebtoken = "9"
rand = "0.8"
sha2 = "0.10"
hex = "0.4"
axum-extra = { version = "0.10", features = ["cookie"] }
```

- [ ] **Step 2: Create config.rs**

```rust
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub asset_storage_path: PathBuf,
    pub bind_address: String,
    pub max_upload_size_mb: usize,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: std::env::var("DATABASE_URL")
                .expect("DATABASE_URL must be set"),
            jwt_secret: std::env::var("JWT_SECRET")
                .expect("JWT_SECRET must be set"),
            asset_storage_path: PathBuf::from(
                std::env::var("ASSET_STORAGE_PATH")
                    .unwrap_or_else(|_| "./data/assets".to_string()),
            ),
            bind_address: std::env::var("BIND_ADDRESS")
                .unwrap_or_else(|_| "0.0.0.0:3000".to_string()),
            max_upload_size_mb: std::env::var("MAX_UPLOAD_SIZE_MB")
                .unwrap_or_else(|_| "25".to_string())
                .parse()
                .expect("MAX_UPLOAD_SIZE_MB must be a number"),
        }
    }

    pub fn max_upload_bytes(&self) -> usize {
        self.max_upload_size_mb * 1024 * 1024
    }
}
```

- [ ] **Step 3: Create error.rs**

```rust
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Not found")]
    NotFound,
    #[error("Unauthorized")]
    Unauthorized,
    #[error("Forbidden")]
    Forbidden,
    #[error("Bad request: {0}")]
    BadRequest(String),
    #[error("Conflict: {0}")]
    Conflict(String),
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("Storage error: {0}")]
    Storage(#[from] asset_store::StorageError),
    #[error("Internal error: {0}")]
    Internal(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::NotFound => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, self.to_string()),
            AppError::Forbidden => (StatusCode::FORBIDDEN, self.to_string()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, msg.clone()),
            AppError::Database(e) => {
                tracing::error!("Database error: {e}");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
            AppError::Storage(e) => {
                tracing::error!("Storage error: {e}");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
            AppError::Internal(msg) => {
                tracing::error!("Internal error: {msg}");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
        };

        let body = json!({ "error": message });
        (status, axum::Json(body)).into_response()
    }
}
```

- [ ] **Step 4: Create state.rs**

```rust
use asset_store::StorageBackend;
use sqlx::PgPool;
use std::sync::Arc;

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Config,
    pub storage: Arc<dyn StorageBackend>,
}
```

- [ ] **Step 5: Create route and middleware stubs**

Create `crates/server/src/routes/mod.rs`:

```rust
pub mod auth;
pub mod assets;
pub mod campaigns;
pub mod ws;

use axum::Router;
use crate::state::AppState;

pub fn api_routes() -> Router<AppState> {
    Router::new()
        .nest("/auth", auth::routes())
        .nest("/campaigns", campaigns::routes())
        .nest("/assets", assets::routes())
        .nest("/ws", ws::routes())
}
```

Create `crates/server/src/middleware/mod.rs`:

```rust
pub mod auth;
```

- [ ] **Step 6: Create main.rs**

```rust
mod config;
mod error;
mod middleware;
mod routes;
mod state;

use axum::Router;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

use config::Config;
use state::AppState;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let config = Config::from_env();
    tracing::info!("Starting server on {}", config.bind_address);

    let pool = db::create_pool(&config.database_url)
        .await
        .expect("Failed to connect to database");

    db::run_migrations(&pool)
        .await
        .expect("Failed to run migrations");

    let storage = asset_store::create_storage(config.asset_storage_path.clone());

    let state = AppState {
        pool,
        config: config.clone(),
        storage: Arc::from(storage),
    };

    let app = Router::new()
        .nest("/api", routes::api_routes())
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive()) // Tighten in production
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&config.bind_address)
        .await
        .expect("Failed to bind");

    tracing::info!("Listening on {}", config.bind_address);
    axum::serve(listener, app).await.expect("Server failed");
}
```

- [ ] **Step 7: Create placeholder route files so it compiles**

Create `crates/server/src/routes/auth.rs`:
```rust
use axum::Router;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
}
```

Create `crates/server/src/routes/campaigns.rs`:
```rust
use axum::Router;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
}
```

Create `crates/server/src/routes/assets.rs`:
```rust
use axum::Router;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
}
```

Create `crates/server/src/routes/ws.rs`:
```rust
use axum::Router;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
}
```

Create `crates/server/src/middleware/auth.rs`:
```rust
// Auth middleware — implemented in Task 6
```

- [ ] **Step 8: Verify it compiles**

```bash
cargo check -p server
```
Expected: compiles with no errors.

- [ ] **Step 9: Commit**

```bash
git add crates/server/
git commit -m "feat: add server crate skeleton with config, state, error handling"
```

---

### Task 6: Auth Middleware & Routes

**Files:**
- Modify: `crates/server/src/middleware/auth.rs`
- Modify: `crates/server/src/routes/auth.rs`

- [ ] **Step 1: Implement JWT auth middleware**

Write `crates/server/src/middleware/auth.rs`:

```rust
use axum::{
    extract::{FromRequestParts, State},
    http::request::Parts,
};
use axum_extra::extract::CookieJar;
use jsonwebtoken::{decode, DecodingKey, Validation};
use uuid::Uuid;

use htbd_core::auth::Claims;
use crate::error::AppError;
use crate::state::AppState;

/// Extractor that validates the JWT access token from cookies.
/// Use this in route handlers: `auth: AuthUser`
pub struct AuthUser {
    pub user_id: Uuid,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let jar = CookieJar::from_request_parts(parts, state)
            .await
            .map_err(|_| AppError::Unauthorized)?;

        let token = jar
            .get("access_token")
            .map(|c| c.value().to_string())
            .ok_or(AppError::Unauthorized)?;

        let token_data = decode::<Claims>(
            &token,
            &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| AppError::Unauthorized)?;

        Ok(AuthUser {
            user_id: token_data.claims.sub,
        })
    }
}

pub fn create_access_token(jwt_secret: &str, user_id: Uuid) -> Result<String, AppError> {
    let now = chrono::Utc::now();
    let claims = Claims {
        sub: user_id,
        iat: now.timestamp(),
        exp: (now + chrono::Duration::minutes(15)).timestamp(),
    };
    jsonwebtoken::encode(
        &jsonwebtoken::Header::default(),
        &claims,
        &jsonwebtoken::EncodingKey::from_secret(jwt_secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(e.to_string()))
}

pub fn generate_refresh_token() -> String {
    use rand::Rng;
    let bytes: [u8; 32] = rand::thread_rng().gen();
    hex::encode(bytes)
}

pub fn hash_token(token: &str) -> String {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}
```

- [ ] **Step 2: Implement auth routes**

Write `crates/server/src/routes/auth.rs`:

```rust
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use chrono::{Duration, Utc};

use htbd_core::auth::{AuthResponse, LoginRequest, RegisterRequest};
use htbd_core::models::User;
use crate::error::AppError;
use crate::middleware::auth::{create_access_token, generate_refresh_token, hash_token};
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/refresh", post(refresh))
        .route("/logout", post(logout))
        .route("/me", get(me))
}

async fn me(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<AuthResponse>, AppError> {
    let row = db::users::find_by_id(&state.pool, auth.user_id)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(AuthResponse {
        user: User {
            id: row.id,
            email: row.email,
            display_name: row.display_name,
            created_at: row.created_at,
        },
    }))
}

async fn register(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(req): Json<RegisterRequest>,
) -> Result<(CookieJar, Json<AuthResponse>), AppError> {
    // Validate input
    if req.email.is_empty() || !req.email.contains('@') {
        return Err(AppError::BadRequest("Invalid email".to_string()));
    }
    if req.password.len() < 8 {
        return Err(AppError::BadRequest("Password must be at least 8 characters".to_string()));
    }
    if req.display_name.is_empty() {
        return Err(AppError::BadRequest("Display name required".to_string()));
    }

    // Check if email already exists
    if db::users::find_by_email(&state.pool, &req.email).await?.is_some() {
        return Err(AppError::Conflict("Email already registered".to_string()));
    }

    // Hash password
    let password_hash = argon2::hash_encoded(
        req.password.as_bytes(),
        &rand::random::<[u8; 16]>(),
        &argon2::Config::default(),
    )
    .map_err(|e| AppError::Internal(e.to_string()))?;

    // Create user
    let row = db::users::create_user(&state.pool, &req.email, &password_hash, &req.display_name).await?;

    let user = User {
        id: row.id,
        email: row.email,
        display_name: row.display_name,
        created_at: row.created_at,
    };

    // Issue tokens
    let jar = issue_tokens(&state, jar, user.id).await?;

    Ok((jar, Json(AuthResponse { user })))
}

async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(req): Json<LoginRequest>,
) -> Result<(CookieJar, Json<AuthResponse>), AppError> {
    let row = db::users::find_by_email(&state.pool, &req.email)
        .await?
        .ok_or(AppError::Unauthorized)?;

    let valid = argon2::verify_encoded(&row.password_hash, req.password.as_bytes())
        .unwrap_or(false);

    if !valid {
        return Err(AppError::Unauthorized);
    }

    let user = User {
        id: row.id,
        email: row.email,
        display_name: row.display_name,
        created_at: row.created_at,
    };

    let jar = issue_tokens(&state, jar, user.id).await?;

    Ok((jar, Json(AuthResponse { user })))
}

async fn refresh(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<CookieJar, AppError> {
    let refresh_token = jar
        .get("refresh_token")
        .map(|c| c.value().to_string())
        .ok_or(AppError::Unauthorized)?;

    let token_hash = hash_token(&refresh_token);
    let stored = db::refresh_tokens::find_by_hash(&state.pool, &token_hash)
        .await?
        .ok_or(AppError::Unauthorized)?;

    if stored.expires_at < Utc::now() {
        db::refresh_tokens::delete_token(&state.pool, stored.id).await?;
        return Err(AppError::Unauthorized);
    }

    // Rotate: delete old, issue new
    db::refresh_tokens::delete_token(&state.pool, stored.id).await?;

    let jar = issue_tokens(&state, jar, stored.user_id).await?;
    Ok(jar)
}

async fn logout(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<CookieJar, AppError> {
    if let Some(refresh_cookie) = jar.get("refresh_token") {
        let token_hash = hash_token(refresh_cookie.value());
        if let Some(stored) = db::refresh_tokens::find_by_hash(&state.pool, &token_hash).await? {
            db::refresh_tokens::delete_token(&state.pool, stored.id).await?;
        }
    }

    let jar = jar
        .remove(Cookie::from("access_token"))
        .remove(Cookie::from("refresh_token"));

    Ok(jar)
}

async fn issue_tokens(
    state: &AppState,
    jar: CookieJar,
    user_id: uuid::Uuid,
) -> Result<CookieJar, AppError> {
    let access_token = create_access_token(&state.config.jwt_secret, user_id)?;

    let refresh_token = generate_refresh_token();
    let token_hash = hash_token(&refresh_token);
    let expires_at = Utc::now() + Duration::days(7);

    db::refresh_tokens::create_refresh_token(&state.pool, user_id, &token_hash, expires_at).await?;

    let access_cookie = Cookie::build(("access_token", access_token))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(time::Duration::minutes(15));

    let refresh_cookie = Cookie::build(("refresh_token", refresh_token))
        .path("/api/auth/refresh")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(time::Duration::days(7));

    Ok(jar.add(access_cookie).add(refresh_cookie))
}
```

Add `time` dependency to `crates/server/Cargo.toml`:
```toml
time = "0.3"
```

- [ ] **Step 3: Verify it compiles**

```bash
cargo check -p server
```

- [ ] **Step 4: Commit**

```bash
git add crates/server/
git commit -m "feat: implement auth routes (register, login, refresh, logout)"
```

---

### Task 7: Campaign Routes

**Files:**
- Modify: `crates/server/src/routes/campaigns.rs`

- [ ] **Step 1: Implement campaign routes**

Write `crates/server/src/routes/campaigns.rs`:

```rust
use axum::{
    extract::{Path, State},
    routing::{get, post, delete},
    Json, Router,
};
use serde::Deserialize;
use uuid::Uuid;

use htbd_core::models::{Campaign, CampaignMember, CampaignRole};
use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_campaigns).post(create_campaign))
        .route("/{id}", get(get_campaign))
        .route("/{id}/members", get(list_members))
        .route("/{id}/members/{user_id}", delete(remove_member))
        .route("/join/{invite_code}", post(join_campaign))
}

#[derive(Deserialize)]
struct CreateCampaignRequest {
    name: String,
}

async fn create_campaign(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateCampaignRequest>,
) -> Result<Json<Campaign>, AppError> {
    if req.name.is_empty() {
        return Err(AppError::BadRequest("Campaign name required".to_string()));
    }

    let invite_code = generate_invite_code();
    let row = db::campaigns::create_campaign(&state.pool, &req.name, auth.user_id, &invite_code).await?;

    Ok(Json(Campaign {
        id: row.id,
        name: row.name,
        owner_id: row.owner_id,
        invite_code: row.invite_code,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }))
}

async fn list_campaigns(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<Vec<Campaign>>, AppError> {
    let rows = db::campaigns::list_for_user(&state.pool, auth.user_id).await?;
    let campaigns = rows.into_iter().map(|r| Campaign {
        id: r.id,
        name: r.name,
        owner_id: r.owner_id,
        invite_code: r.invite_code,
        created_at: r.created_at,
        updated_at: r.updated_at,
    }).collect();
    Ok(Json(campaigns))
}

async fn get_campaign(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Campaign>, AppError> {
    // Verify membership
    require_member(&state, id, auth.user_id).await?;

    let row = db::campaigns::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(Campaign {
        id: row.id,
        name: row.name,
        owner_id: row.owner_id,
        invite_code: row.invite_code,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }))
}

async fn list_members(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<CampaignMember>>, AppError> {
    require_member(&state, id, auth.user_id).await?;

    let rows = db::campaigns::list_members(&state.pool, id).await?;
    let members = rows.into_iter().map(|r| CampaignMember {
        campaign_id: r.campaign_id,
        user_id: r.user_id,
        role: r.role.parse().unwrap_or(CampaignRole::Player),
        display_name: r.display_name,
        joined_at: r.joined_at,
    }).collect();
    Ok(Json(members))
}

async fn join_campaign(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(invite_code): Path<String>,
) -> Result<Json<Campaign>, AppError> {
    let row = db::campaigns::find_by_invite_code(&state.pool, &invite_code)
        .await?
        .ok_or(AppError::NotFound)?;

    db::campaigns::add_member(&state.pool, row.id, auth.user_id, "player").await?;

    Ok(Json(Campaign {
        id: row.id,
        name: row.name,
        owner_id: row.owner_id,
        invite_code: row.invite_code,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }))
}

async fn remove_member(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((campaign_id, user_id)): Path<(Uuid, Uuid)>,
) -> Result<(), AppError> {
    require_dm(&state, campaign_id, auth.user_id).await?;
    db::campaigns::remove_member(&state.pool, campaign_id, user_id).await?;
    Ok(())
}

// --- Helpers ---

async fn require_member(state: &AppState, campaign_id: Uuid, user_id: Uuid) -> Result<String, AppError> {
    db::campaigns::get_member_role(&state.pool, campaign_id, user_id)
        .await?
        .ok_or(AppError::Forbidden)
}

async fn require_dm(state: &AppState, campaign_id: Uuid, user_id: Uuid) -> Result<(), AppError> {
    let role = require_member(state, campaign_id, user_id).await?;
    if role != "dm" {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

fn generate_invite_code() -> String {
    use rand::Rng;
    let bytes: [u8; 8] = rand::thread_rng().gen();
    hex::encode(bytes)
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cargo check -p server
```

- [ ] **Step 3: Commit**

```bash
git add crates/server/src/routes/campaigns.rs
git commit -m "feat: implement campaign CRUD, invite, and member management routes"
```

---

## Chunk 3: Asset Routes, WebSocket, and Dev Database Setup

### Task 8: Asset Upload & Serve Routes

**Files:**
- Modify: `crates/server/src/routes/assets.rs`

- [ ] **Step 1: Implement asset routes**

Write `crates/server/src/routes/assets.rs`:

```rust
use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    routing::{get, post, delete},
    Json, Router,
};
use serde::Deserialize;
use uuid::Uuid;

use htbd_core::models::Asset;
use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/campaigns/{campaign_id}", post(upload_asset).get(list_assets))
        .route("/{id}", get(serve_asset).delete(delete_asset))
}

const ALLOWED_CONTENT_TYPES: &[&str] = &[
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/svg+xml",
    "application/pdf",
];

async fn upload_asset(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(campaign_id): Path<Uuid>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<Asset>), AppError> {
    // Verify DM role
    let role = db::campaigns::get_member_role(&state.pool, campaign_id, auth.user_id)
        .await?
        .ok_or(AppError::Forbidden)?;
    if role != "dm" {
        return Err(AppError::Forbidden);
    }

    let field = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
        .ok_or_else(|| AppError::BadRequest("No file provided".to_string()))?;

    let filename = field.file_name()
        .unwrap_or("unknown")
        .to_string();
    let content_type = field.content_type()
        .unwrap_or("application/octet-stream")
        .to_string();

    if !ALLOWED_CONTENT_TYPES.contains(&content_type.as_str()) {
        return Err(AppError::BadRequest(format!("Unsupported file type: {content_type}")));
    }

    let data = field.bytes()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    if data.len() > state.config.max_upload_bytes() {
        return Err(AppError::BadRequest(format!(
            "File too large (max {}MB)",
            state.config.max_upload_size_mb
        )));
    }

    // Store file
    let asset_id = Uuid::new_v4();
    let storage_path = format!("{campaign_id}/{asset_id}/{filename}");
    state.storage.store(&storage_path, &data).await?;

    // Save metadata
    let row = db::assets::create_asset(
        &state.pool,
        campaign_id,
        auth.user_id,
        &filename,
        &content_type,
        &storage_path,
        data.len() as i64,
    )
    .await?;

    let asset = Asset {
        id: row.id,
        campaign_id: row.campaign_id,
        uploaded_by: row.uploaded_by,
        filename: row.filename,
        content_type: row.content_type,
        size_bytes: row.size_bytes,
        created_at: row.created_at,
    };

    Ok((StatusCode::CREATED, Json(asset)))
}

#[derive(Deserialize)]
struct ListAssetsQuery {
    content_type: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

async fn list_assets(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(campaign_id): Path<Uuid>,
    Query(query): Query<ListAssetsQuery>,
) -> Result<Json<Vec<Asset>>, AppError> {
    db::campaigns::get_member_role(&state.pool, campaign_id, auth.user_id)
        .await?
        .ok_or(AppError::Forbidden)?;

    let rows = db::assets::list_for_campaign(
        &state.pool,
        campaign_id,
        query.content_type.as_deref(),
        query.limit.unwrap_or(50),
        query.offset.unwrap_or(0),
    )
    .await?;

    let assets = rows.into_iter().map(|r| Asset {
        id: r.id,
        campaign_id: r.campaign_id,
        uploaded_by: r.uploaded_by,
        filename: r.filename,
        content_type: r.content_type,
        size_bytes: r.size_bytes,
        created_at: r.created_at,
    }).collect();

    Ok(Json(assets))
}

async fn serve_asset(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let row = db::assets::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;

    // Verify membership
    db::campaigns::get_member_role(&state.pool, row.campaign_id, auth.user_id)
        .await?
        .ok_or(AppError::Forbidden)?;

    let data = state.storage.retrieve(&row.storage_path).await?;

    Ok((
        [
            (header::CONTENT_TYPE, row.content_type),
            (header::CONTENT_DISPOSITION, format!("inline; filename=\"{}\"", row.filename)),
        ],
        data,
    ))
}

async fn delete_asset(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let row = db::assets::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;

    // Verify DM role
    let role = db::campaigns::get_member_role(&state.pool, row.campaign_id, auth.user_id)
        .await?
        .ok_or(AppError::Forbidden)?;
    if role != "dm" {
        return Err(AppError::Forbidden);
    }

    // Delete from storage
    state.storage.delete(&row.storage_path).await?;

    // Delete metadata
    db::assets::delete_asset(&state.pool, id).await?;

    Ok(StatusCode::NO_CONTENT)
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cargo check -p server
```

- [ ] **Step 3: Commit**

```bash
git add crates/server/src/routes/assets.rs
git commit -m "feat: implement asset upload, list, serve, and delete routes"
```

---

### Task 9: WebSocket Handler

**Files:**
- Modify: `crates/server/src/routes/ws.rs`

- [ ] **Step 1: Implement WebSocket upgrade and echo handler**

Write `crates/server/src/routes/ws.rs`:

```rust
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};

use htbd_core::messages::{ClientMessage, ServerMessage};
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new().route("/", get(ws_upgrade))
}

async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(_state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(handle_socket)
}

async fn handle_socket(mut socket: WebSocket) {
    while let Some(Ok(msg)) = socket.next().await {
        match msg {
            Message::Text(text) => {
                let parsed: Result<ClientMessage, _> = serde_json::from_str(&text);
                match parsed {
                    Ok(ClientMessage::Ping) => {
                        let response = serde_json::to_string(&ServerMessage::Pong).unwrap();
                        if socket.send(Message::Text(response.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        let error = ServerMessage::Error {
                            code: "INVALID_MESSAGE".to_string(),
                            message: e.to_string(),
                        };
                        let response = serde_json::to_string(&error).unwrap();
                        if socket.send(Message::Text(response.into())).await.is_err() {
                            break;
                        }
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
}
```

Add `futures-util` to `crates/server/Cargo.toml`:

```toml
futures-util = "0.3"
```

- [ ] **Step 2: Verify it compiles**

```bash
cargo check -p server
```

- [ ] **Step 3: Commit**

```bash
git add crates/server/
git commit -m "feat: implement WebSocket handler with ping/pong and typed messages"
```

---

---

## Chunk 4: React Client Foundation

### Task 11: Initialize React + Vite + TypeScript Client

**Files:**
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/vite.config.ts`
- Create: `client/index.html`
- Create: `client/src/main.tsx`
- Create: `client/src/App.tsx`
- Create: `client/src/vite-env.d.ts`

- [ ] **Step 1: Initialize client**

```bash
cd client && npm create vite@latest . -- --template react-ts
```

If the directory already exists, adjust as needed. The key outcome is a working Vite + React + TypeScript setup.

- [ ] **Step 2: Install dependencies**

```bash
cd client && npm install \
  @tanstack/react-query \
  zustand \
  react-router-dom \
  @radix-ui/react-dialog \
  @radix-ui/react-dropdown-menu \
  @radix-ui/react-tabs \
  @radix-ui/react-visually-hidden \
  pixi.js
```

- [ ] **Step 3: Configure Vite proxy**

Write `client/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
```

- [ ] **Step 4: Generate TypeScript types from Rust**

```bash
cd .. && cargo test -p htbd-core export_bindings
```

Verify `client/src/types/` contains generated `.ts` files.

- [ ] **Step 5: Verify client builds**

```bash
cd client && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add client/
git commit -m "feat: initialize React + Vite + TypeScript client with dependencies"
```

---

### Task 12: Design Tokens & Global Styles

**Files:**
- Create: `client/src/styles/tokens.css`
- Create: `client/src/styles/global.css`

- [ ] **Step 1: Create design tokens**

Write `client/src/styles/tokens.css`:

```css
:root {
  /* Colors — colorblind-safe palette */
  --color-bg-primary: #1a1a2e;
  --color-bg-secondary: #16213e;
  --color-bg-surface: #0f3460;
  --color-bg-elevated: #1a1a3e;

  --color-text-primary: #e0e0e0;
  --color-text-secondary: #a0a0b0;
  --color-text-muted: #707080;

  --color-accent: #e94560;
  --color-accent-hover: #ff6b81;
  --color-success: #2ecc71;
  --color-warning: #f39c12;
  --color-error: #e74c3c;

  /* These pass WCAG AA on dark backgrounds */
  --color-interactive: #5dade2;
  --color-interactive-hover: #85c1e9;

  /* Spacing */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;

  /* Typography */
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --font-size-sm: 0.875rem;
  --font-size-md: 1rem;
  --font-size-lg: 1.25rem;
  --font-size-xl: 1.5rem;

  /* Borders */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* Focus — always visible, never color-only */
  --focus-ring: 0 0 0 2px var(--color-interactive), 0 0 0 4px var(--color-bg-primary);
}
```

- [ ] **Step 2: Create global styles**

Write `client/src/styles/global.css`:

```css
@import './tokens.css';

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-family: var(--font-body);
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
  background-color: var(--color-bg-primary);
  line-height: 1.6;
}

/* Accessible focus styles — always visible, never removed */
:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

/* Skip link for keyboard navigation */
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: var(--color-accent);
  color: white;
  padding: var(--space-sm) var(--space-md);
  z-index: 100;
  transition: top 0.2s;
}

.skip-link:focus {
  top: 0;
}

/* Utility: visually hidden but accessible to screen readers */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

a {
  color: var(--color-interactive);
  text-decoration: none;
}

a:hover {
  color: var(--color-interactive-hover);
}

button {
  font-family: inherit;
  cursor: pointer;
}
```

- [ ] **Step 3: Import global styles in main.tsx**

Write `client/src/main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/global.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
```

- [ ] **Step 4: Commit**

```bash
git add client/src/styles/ client/src/main.tsx
git commit -m "feat: add design tokens, global styles, and app providers"
```

---

### Task 13: Zustand Stores & API Client

**Files:**
- Create: `client/src/state/session.ts`
- Create: `client/src/state/ui.ts`
- Create: `client/src/state/prefs.ts`
- Create: `client/src/api/client.ts`
- Create: `client/src/api/ws.ts`

- [ ] **Step 1: Create session store**

Write `client/src/state/session.ts`:

```typescript
import { create } from 'zustand'
import type { User } from '../types/User'

interface SessionState {
  user: User | null
  setUser: (user: User | null) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}))
```

- [ ] **Step 2: Create UI store**

Write `client/src/state/ui.ts`:

```typescript
import { create } from 'zustand'

interface UiState {
  sidebarOpen: boolean
  activeTool: string | null
  selectedTokenId: string | null
  toggleSidebar: () => void
  setActiveTool: (tool: string | null) => void
  setSelectedToken: (id: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  activeTool: null,
  selectedTokenId: null,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setSelectedToken: (id) => set({ selectedTokenId: id }),
}))
```

- [ ] **Step 3: Create preferences store**

Write `client/src/state/prefs.ts`:

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PrefsState {
  theme: 'dark' // Only dark for now
  reducedMotion: boolean
  setReducedMotion: (value: boolean) => void
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      reducedMotion: false,
      setReducedMotion: (value) => set({ reducedMotion: value }),
    }),
    { name: 'htbd-prefs' },
  ),
)
```

- [ ] **Step 4: Create REST API client**

Write `client/src/api/client.ts`:

```typescript
const BASE_URL = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include', // Send cookies
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (res.status === 401) {
    // Try refresh
    const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (refreshRes.ok) {
      // Retry original request
      const retryRes = await fetch(`${BASE_URL}${path}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        ...options,
      })
      if (!retryRes.ok) throw new ApiError(retryRes.status, await retryRes.text())
      return retryRes.json()
    }
    throw new ApiError(401, 'Session expired')
  }

  if (!res.ok) {
    throw new ApiError(res.status, await res.text())
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export const api = {
  auth: {
    register: (data: { email: string; password: string; display_name: string }) =>
      request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    me: () => request('/auth/me'),
  },
  campaigns: {
    list: () => request('/campaigns'),
    create: (data: { name: string }) =>
      request('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: string) => request(`/campaigns/${id}`),
    join: (inviteCode: string) =>
      request(`/campaigns/join/${inviteCode}`, { method: 'POST' }),
    members: (id: string) => request(`/campaigns/${id}/members`),
    removeMember: (campaignId: string, userId: string) =>
      request(`/campaigns/${campaignId}/members/${userId}`, { method: 'DELETE' }),
  },
  assets: {
    list: (campaignId: string, params?: { content_type?: string; limit?: number; offset?: number }) => {
      const searchParams = new URLSearchParams()
      if (params?.content_type) searchParams.set('content_type', params.content_type)
      if (params?.limit) searchParams.set('limit', String(params.limit))
      if (params?.offset) searchParams.set('offset', String(params.offset))
      const qs = searchParams.toString()
      return request(`/assets/campaigns/${campaignId}${qs ? `?${qs}` : ''}`)
    },
    upload: async (campaignId: string, file: File) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${BASE_URL}/assets/campaigns/${campaignId}`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      if (!res.ok) throw new ApiError(res.status, await res.text())
      return res.json()
    },
    delete: (id: string) =>
      request(`/assets/${id}`, { method: 'DELETE' }),
    url: (id: string) => `${BASE_URL}/assets/${id}`,
  },
}
```

- [ ] **Step 5: Create WebSocket client**

Write `client/src/api/ws.ts`:

```typescript
import type { ClientMessage } from '../types/ClientMessage'
import type { ServerMessage } from '../types/ServerMessage'

type MessageHandler = (message: ServerMessage) => void

export class WsClient {
  private ws: WebSocket | null = null
  private handlers: Set<MessageHandler> = new Set()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  connect(sessionId: string) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/api/ws?session=${sessionId}`

    this.ws = new WebSocket(url)

    this.ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data)
        this.handlers.forEach((handler) => handler(message))
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }

    this.ws.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.connect(sessionId), 3000)
    }

    this.ws.onerror = (e) => {
      console.error('WebSocket error:', e)
    }
  }

  send(message: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }

  subscribe(handler: MessageHandler) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }
}

export const wsClient = new WsClient()
```

- [ ] **Step 6: Commit**

```bash
git add client/src/state/ client/src/api/
git commit -m "feat: add Zustand stores, REST API client, and WebSocket client"
```

---

## Chunk 5: React Pages & Components

### Task 14: App Shell, Routing, and Auth Pages

**Files:**
- Create: `client/src/App.tsx`
- Create: `client/src/components/Layout.tsx`
- Create: `client/src/components/ProtectedRoute.tsx`
- Create: `client/src/pages/Login.tsx`
- Create: `client/src/pages/Register.tsx`
- Create: `client/src/pages/Campaigns.tsx`

- [ ] **Step 1: Create app router**

Write `client/src/App.tsx`:

```tsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Campaigns } from './pages/Campaigns'
import { Campaign } from './pages/Campaign'

export default function App() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/campaigns/:id" element={<Campaign />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/campaigns" replace />} />
      </Routes>
    </>
  )
}
```

- [ ] **Step 2: Create Layout component**

Write `client/src/components/Layout.tsx`:

```tsx
import { Outlet, Link } from 'react-router-dom'
import { useSessionStore } from '../state/session'
import { api } from '../api/client'

export function Layout() {
  const user = useSessionStore((s) => s.user)
  const setUser = useSessionStore((s) => s.setUser)

  const handleLogout = async () => {
    await api.auth.logout()
    setUser(null)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        role="banner"
        style={{
          padding: 'var(--space-sm) var(--space-md)',
          background: 'var(--color-bg-secondary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Link to="/campaigns" style={{ fontWeight: 'bold', fontSize: 'var(--font-size-lg)' }}>
          Here There Be Dragons
        </Link>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <span>{user.display_name}</span>
            <button onClick={handleLogout}>Logout</button>
          </div>
        )}
      </header>
      <main id="main-content" role="main" style={{ flex: 1 }}>
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Create ProtectedRoute**

Write `client/src/components/ProtectedRoute.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useSessionStore } from '../state/session'
import { api } from '../api/client'

export function ProtectedRoute() {
  const user = useSessionStore((s) => s.user)
  const setUser = useSessionStore((s) => s.setUser)
  const [loading, setLoading] = useState(!user)

  useEffect(() => {
    if (!user) {
      api.auth.me()
        .then((res: any) => setUser(res.user))
        .catch(() => setUser(null))
        .finally(() => setLoading(false))
    }
  }, [user, setUser])

  if (loading) return <p>Loading...</p>
  if (!user) return <Navigate to="/login" replace />

  return <Outlet />
}
```

- [ ] **Step 4: Create Login page**

Write `client/src/pages/Login.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useSessionStore } from '../state/session'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const setUser = useSessionStore((s) => s.setUser)
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const res: any = await api.auth.login({ email, password })
      setUser(res.user)
      navigate('/campaigns')
    } catch (err: any) {
      setError(err.message || 'Login failed')
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '4rem auto', padding: 'var(--space-lg)' }}>
      <h1>Login</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <label>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{ width: '100%', padding: 'var(--space-sm)', marginTop: 'var(--space-xs)' }}
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{ width: '100%', padding: 'var(--space-sm)', marginTop: 'var(--space-xs)' }}
          />
        </label>
        {error && <p role="alert" style={{ color: 'var(--color-error)' }}>{error}</p>}
        <button type="submit">Login</button>
      </form>
      <p style={{ marginTop: 'var(--space-md)' }}>
        No account? <Link to="/register">Register</Link>
      </p>
    </div>
  )
}
```

- [ ] **Step 5: Create Register page**

Write `client/src/pages/Register.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useSessionStore } from '../state/session'

export function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const setUser = useSessionStore((s) => s.setUser)
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const res: any = await api.auth.register({ email, password, display_name: displayName })
      setUser(res.user)
      navigate('/campaigns')
    } catch (err: any) {
      setError(err.message || 'Registration failed')
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '4rem auto', padding: 'var(--space-lg)' }}>
      <h1>Register</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <label>
          <span>Display Name</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            autoComplete="name"
            style={{ width: '100%', padding: 'var(--space-sm)', marginTop: 'var(--space-xs)' }}
          />
        </label>
        <label>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{ width: '100%', padding: 'var(--space-sm)', marginTop: 'var(--space-xs)' }}
          />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            style={{ width: '100%', padding: 'var(--space-sm)', marginTop: 'var(--space-xs)' }}
          />
        </label>
        {error && <p role="alert" style={{ color: 'var(--color-error)' }}>{error}</p>}
        <button type="submit">Register</button>
      </form>
      <p style={{ marginTop: 'var(--space-md)' }}>
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </div>
  )
}
```

- [ ] **Step 6: Create Campaigns list page**

Write `client/src/pages/Campaigns.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Campaign } from '../types/Campaign'

export function Campaigns() {
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState('')
  const [joinCode, setJoinCode] = useState('')

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ['campaigns'],
    queryFn: () => api.campaigns.list() as Promise<Campaign[]>,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => api.campaigns.create({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      setNewName('')
    },
  })

  const joinMutation = useMutation({
    mutationFn: (code: string) => api.campaigns.join(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      setJoinCode('')
    },
  })

  const handleCreate = (e: FormEvent) => {
    e.preventDefault()
    if (newName.trim()) createMutation.mutate(newName.trim())
  }

  const handleJoin = (e: FormEvent) => {
    e.preventDefault()
    if (joinCode.trim()) joinMutation.mutate(joinCode.trim())
  }

  if (isLoading) return <p style={{ padding: 'var(--space-lg)' }}>Loading...</p>

  return (
    <div style={{ padding: 'var(--space-lg)', maxWidth: 800, margin: '0 auto' }}>
      <h1>Campaigns</h1>

      <section style={{ marginTop: 'var(--space-lg)' }}>
        <h2>Create Campaign</h2>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Campaign name"
            required
            style={{ flex: 1, padding: 'var(--space-sm)' }}
          />
          <button type="submit">Create</button>
        </form>
      </section>

      <section style={{ marginTop: 'var(--space-lg)' }}>
        <h2>Join Campaign</h2>
        <form onSubmit={handleJoin} style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Invite code"
            required
            style={{ flex: 1, padding: 'var(--space-sm)' }}
          />
          <button type="submit">Join</button>
        </form>
      </section>

      <section style={{ marginTop: 'var(--space-lg)' }}>
        <h2>Your Campaigns</h2>
        {campaigns?.length === 0 && <p>No campaigns yet.</p>}
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {campaigns?.map((c) => (
            <li key={c.id}>
              <Link
                to={`/campaigns/${c.id}`}
                style={{
                  display: 'block',
                  padding: 'var(--space-md)',
                  background: 'var(--color-bg-surface)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
```

- [ ] **Step 7: Create Campaign page stub with PixiJS canvas**

Write `client/src/pages/Campaign.tsx`:

```tsx
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { CanvasView } from '../canvas/CanvasView'
import type { Campaign as CampaignType } from '../types/Campaign'

export function Campaign() {
  const { id } = useParams<{ id: string }>()

  const { data: campaign, isLoading } = useQuery<CampaignType>({
    queryKey: ['campaign', id],
    queryFn: () => api.campaigns.get(id!) as Promise<CampaignType>,
    enabled: !!id,
  })

  if (isLoading) return <p style={{ padding: 'var(--space-lg)' }}>Loading...</p>
  if (!campaign) return <p style={{ padding: 'var(--space-lg)' }}>Campaign not found.</p>

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 50px)' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <CanvasView />
      </div>
      <aside
        role="complementary"
        aria-label="Campaign sidebar"
        style={{
          width: 300,
          background: 'var(--color-bg-secondary)',
          padding: 'var(--space-md)',
          overflowY: 'auto',
        }}
      >
        <h2>{campaign.name}</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          Invite code: {campaign.invite_code}
        </p>
        {/* Asset browser, members list, etc. will go here */}
      </aside>
    </div>
  )
}
```

- [ ] **Step 8: Commit**

```bash
git add client/src/
git commit -m "feat: add app routing, auth pages, campaigns page, and campaign view"
```

---

### Task 15: PixiJS Canvas Initialization

**Files:**
- Create: `client/src/canvas/engine.ts`
- Create: `client/src/canvas/CanvasView.tsx`

- [ ] **Step 1: Create PixiJS engine wrapper**

Write `client/src/canvas/engine.ts`:

```typescript
import { Application } from 'pixi.js'

export async function createCanvasApp(canvas: HTMLCanvasElement): Promise<Application> {
  const app = new Application()

  await app.init({
    canvas,
    resizeTo: canvas.parentElement ?? undefined,
    background: '#1a1a2e',
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  })

  return app
}
```

- [ ] **Step 2: Create CanvasView React component**

Write `client/src/canvas/CanvasView.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { Application } from 'pixi.js'
import { createCanvasApp } from './engine'

export function CanvasView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const appRef = useRef<Application | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let mounted = true

    createCanvasApp(canvas).then((app) => {
      if (!mounted) {
        app.destroy()
        return
      }
      appRef.current = app
    })

    return () => {
      mounted = false
      appRef.current?.destroy()
      appRef.current = null
    }
  }, [])

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      {/* Parallel DOM for screen reader accessibility */}
      <div
        role="application"
        aria-label="Battle map canvas"
        aria-roledescription="virtual tabletop"
        className="sr-only"
        tabIndex={0}
      >
        <p>Empty canvas. Grid and tokens will appear here when a map is loaded.</p>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Verify client builds**

```bash
cd client && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add client/src/canvas/
git commit -m "feat: add PixiJS canvas initialization with accessibility parallel DOM"
```

---

### Task 15a: Asset Browser Component

**Files:**
- Create: `client/src/components/AssetBrowser.tsx`

- [ ] **Step 1: Create asset browser dialog component**

Write `client/src/components/AssetBrowser.tsx`:

```tsx
import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Asset } from '../types/Asset'

interface AssetBrowserProps {
  campaignId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AssetBrowser({ campaignId, open, onOpenChange }: AssetBrowserProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState<string | undefined>(undefined)
  const [dragOver, setDragOver] = useState(false)

  const { data: assets, isLoading } = useQuery<Asset[]>({
    queryKey: ['assets', campaignId, filter],
    queryFn: () => api.assets.list(campaignId, { content_type: filter }) as Promise<Asset[]>,
    enabled: open,
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.assets.upload(campaignId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets', campaignId] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.assets.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets', campaignId] }),
  })

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    files.forEach((file) => uploadMutation.mutate(file))
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    files.forEach((file) => uploadMutation.mutate(file))
    e.target.value = ''
  }

  const handleDelete = (asset: Asset) => {
    if (window.confirm(`Delete "${asset.filename}"?`)) {
      deleteMutation.mutate(asset.id)
    }
  }

  const filters = [
    { label: 'All', value: undefined },
    { label: 'Maps', value: 'image/%' },
    { label: 'PDFs', value: 'application/pdf' },
  ]

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.7)',
        }} />
        <Dialog.Content
          aria-describedby={undefined}
          style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--color-bg-elevated)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-lg)',
            width: '80vw', maxWidth: 800, maxHeight: '80vh',
            overflow: 'auto',
          }}
        >
          <Dialog.Title style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-md)' }}>
            Asset Library
          </Dialog.Title>

          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
            {filters.map((f) => (
              <button
                key={f.label}
                onClick={() => setFilter(f.value)}
                style={{
                  padding: 'var(--space-xs) var(--space-sm)',
                  background: filter === f.value ? 'var(--color-interactive)' : 'var(--color-bg-surface)',
                  border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-primary)',
                }}
                aria-pressed={filter === f.value}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragOver ? 'var(--color-interactive)' : 'var(--color-text-muted)'}`,
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-lg)',
              textAlign: 'center',
              marginBottom: 'var(--space-md)',
              cursor: 'pointer',
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Upload files by clicking or dragging"
            onKeyDown={(e) => { if (e.key === 'Enter') fileInputRef.current?.click() }}
          >
            <p>Drag and drop files here, or click to browse</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/svg+xml,application/pdf"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>

          {isLoading && <p>Loading assets...</p>}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: 'var(--space-sm)',
          }}>
            {assets?.map((asset) => (
              <div
                key={asset.id}
                style={{
                  background: 'var(--color-bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-sm)',
                  textAlign: 'center',
                }}
              >
                {asset.content_type.startsWith('image/') ? (
                  <img
                    src={api.assets.url(asset.id)}
                    alt={asset.filename}
                    style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
                  />
                ) : (
                  <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span>PDF</span>
                  </div>
                )}
                <p style={{ fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {asset.filename}
                </p>
                <button
                  onClick={() => handleDelete(asset)}
                  style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-error)', background: 'none', border: 'none', marginTop: 'var(--space-xs)' }}
                  aria-label={`Delete ${asset.filename}`}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>

          <Dialog.Close asChild>
            <button
              aria-label="Close"
              style={{ position: 'absolute', top: 'var(--space-sm)', right: 'var(--space-sm)', background: 'none', border: 'none', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-lg)' }}
            >
              ×
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

**Note on thumbnails:** The spec mentions thumbnail generation for images. This is deferred from SP-0 — the asset browser renders images directly via `<img>` tags pointing at the serve endpoint. Thumbnail generation (server-side image resizing and caching) will be added as a follow-up task when performance requires it, avoiding an image processing dependency (e.g., `image` crate) in the initial foundation.

- [ ] **Step 2: Add asset browser to Campaign page**

Update `client/src/pages/Campaign.tsx` sidebar to include:

```tsx
import { useState } from 'react'
import { AssetBrowser } from '../components/AssetBrowser'

// Inside the aside element, add:
const [assetBrowserOpen, setAssetBrowserOpen] = useState(false)

// In the JSX:
<button onClick={() => setAssetBrowserOpen(true)}>Asset Library</button>
<AssetBrowser
  campaignId={id!}
  open={assetBrowserOpen}
  onOpenChange={setAssetBrowserOpen}
/>
```

- [ ] **Step 3: Verify client builds**

```bash
cd client && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/AssetBrowser.tsx client/src/pages/Campaign.tsx
git commit -m "feat: add asset browser component with upload, grid view, and delete"
```

---

## Chunk 6: Deployment & CI

### Task 16: Docker Compose & Dockerfile

**Files:**
- Create: `docker/Dockerfile`
- Create: `docker/docker-compose.yml`

- [ ] **Step 1: Create production Dockerfile**

Write `docker/Dockerfile`:

```dockerfile
# Stage 1: Build Rust server
FROM rust:1.84 AS rust-builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY crates/ crates/
COPY migrations/ migrations/
COPY .sqlx/ .sqlx/
ENV SQLX_OFFLINE=true
RUN cargo build --release -p server

# Stage 2: Build React client
FROM node:20 AS client-builder
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ .
RUN npm run build

# Stage 3: Runtime
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=rust-builder /app/target/release/server /usr/local/bin/server
COPY --from=client-builder /app/client/dist /srv/client
COPY migrations/ /srv/migrations

ENV ASSET_STORAGE_PATH=/data/assets
ENV BIND_ADDRESS=0.0.0.0:3000

EXPOSE 3000
CMD ["server"]
```

- [ ] **Step 2: Create production docker-compose.yml**

Write `docker/docker-compose.yml`:

```yaml
services:
  app:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://dragons:dragons@db:5432/dragons
      - JWT_SECRET=${JWT_SECRET:-change-me-in-production}
      - ASSET_STORAGE_PATH=/data/assets
      - BIND_ADDRESS=0.0.0.0:3000
      - RUST_LOG=info
    volumes:
      - assets:/data/assets
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: dragons
      POSTGRES_PASSWORD: dragons
      POSTGRES_DB: dragons
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dragons"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  assets:
  pgdata:
```

- [ ] **Step 3: Update server main.rs to serve static files**

Add static file serving to `crates/server/src/main.rs`. After the Router is built, add:

```rust
use tower_http::services::ServeDir;

// In the app builder, after .nest("/api", ...), add:
// .fallback_service(ServeDir::new("/srv/client").fallback(ServeFile::new("/srv/client/index.html")))
```

The full modification: in `main.rs`, change the `app` construction to:

```rust
    let app = Router::new()
        .nest("/api", routes::api_routes())
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(state)
        .fallback_service(
            tower_http::services::ServeDir::new(
                std::env::var("CLIENT_DIR").unwrap_or_else(|_| "/srv/client".to_string()),
            )
            .fallback(tower_http::services::ServeFile::new(
                format!("{}/index.html", std::env::var("CLIENT_DIR").unwrap_or_else(|_| "/srv/client".to_string())),
            )),
        );
```

- [ ] **Step 4: Commit**

```bash
git add docker/ crates/server/src/main.rs
git commit -m "feat: add Docker Compose production deployment and static file serving"
```

---

### Task 17: GitHub Actions CI Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create CI workflow**

Write `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  CARGO_TERM_COLOR: always
  SQLX_OFFLINE: true

jobs:
  rust:
    name: Rust checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt

      - uses: Swatinem/rust-cache@v2

      - name: Check formatting
        run: cargo fmt --all -- --check

      - name: Clippy
        run: cargo clippy --workspace -- -D warnings

      - name: Run tests
        run: cargo test --workspace

      - name: Verify sqlx offline data
        run: cargo sqlx prepare --check --workspace

  client:
    name: Client checks
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: client
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: client/package-lock.json

      - run: npm ci
      - run: npm run lint
      - run: npm run build

  docker:
    name: Docker build
    runs-on: ubuntu-latest
    needs: [rust, client]
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker image
        run: docker build -f docker/Dockerfile -t htbd:latest .
```

- [ ] **Step 2: Commit**

```bash
git add .github/
git commit -m "feat: add GitHub Actions CI pipeline (Rust, client, Docker)"
```

---

### Task 18: Final Verification

- [ ] **Step 1: Run the full backend test suite**

```bash
cargo test --workspace
```
Expected: all tests pass.

- [ ] **Step 2: Build the client**

```bash
cd client && npm run build
```
Expected: builds successfully.

- [ ] **Step 3: Start the dev database and server**

```bash
docker compose -f docker/docker-compose.dev.yml up -d
export DATABASE_URL=postgres://dragons:dragons@localhost:5432/dragons
export JWT_SECRET=dev-secret
export ASSET_STORAGE_PATH=./data/assets
cargo run -p server
```

In another terminal:
```bash
cd client && npm run dev
```

- [ ] **Step 4: Manual smoke test**

1. Open `http://localhost:5173`
2. Register a new account
3. Login
4. Create a campaign
5. See the campaign page with the PixiJS canvas (dark background)
6. Note the invite code in the sidebar

- [ ] **Step 5: Commit any final adjustments**

```bash
git add -A
git commit -m "feat: SP-0 foundation complete — end-to-end smoke test passing"
```
