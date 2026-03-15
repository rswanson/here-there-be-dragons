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

impl From<AssetRow> for htbd_core::models::Asset {
    fn from(row: AssetRow) -> Self {
        Self {
            id: row.id,
            campaign_id: row.campaign_id,
            uploaded_by: row.uploaded_by,
            filename: row.filename,
            content_type: row.content_type,
            size_bytes: row.size_bytes,
            created_at: row.created_at,
        }
    }
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
