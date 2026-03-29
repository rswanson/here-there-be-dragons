use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub struct TokenRow {
    pub id: Uuid,
    pub layer_id: Uuid,
    pub name: String,
    pub asset_id: Option<Uuid>,
    pub owner_id: Option<Uuid>,
    pub x: f32,
    pub y: f32,
    pub size: i32,
    pub rotation: f32,
    pub bars_json: serde_json::Value,
    pub status_markers: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<TokenRow> for htbd_core::token::Token {
    fn from(row: TokenRow) -> Self {
        let bars: Vec<htbd_core::token::TokenBar> =
            serde_json::from_value(row.bars_json).unwrap_or_default();
        Self {
            id: row.id,
            layer_id: row.layer_id,
            name: row.name,
            asset_id: row.asset_id,
            owner_id: row.owner_id,
            x: row.x,
            y: row.y,
            size: row.size,
            rotation: row.rotation,
            bars,
            status_markers: row.status_markers,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn create_token(
    pool: &PgPool,
    layer_id: &Uuid,
    name: &str,
    asset_id: Option<&Uuid>,
    owner_id: Option<&Uuid>,
    x: f32,
    y: f32,
    size: i32,
    rotation: f32,
    bars_json: &serde_json::Value,
    status_markers: &[String],
) -> Result<TokenRow, sqlx::Error> {
    sqlx::query_as!(
        TokenRow,
        r#"INSERT INTO tokens (layer_id, name, asset_id, owner_id, x, y, size, rotation, bars_json, status_markers)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *"#,
        layer_id,
        name,
        asset_id,
        owner_id,
        x,
        y,
        size,
        rotation,
        bars_json,
        status_markers
    )
    .fetch_one(pool)
    .await
}

pub async fn find_by_id(pool: &PgPool, id: &Uuid) -> Result<Option<TokenRow>, sqlx::Error> {
    sqlx::query_as!(TokenRow, "SELECT * FROM tokens WHERE id = $1", id)
        .fetch_optional(pool)
        .await
}

pub async fn list_for_layer(pool: &PgPool, layer_id: &Uuid) -> Result<Vec<TokenRow>, sqlx::Error> {
    sqlx::query_as!(
        TokenRow,
        "SELECT * FROM tokens WHERE layer_id = $1 ORDER BY created_at ASC",
        layer_id
    )
    .fetch_all(pool)
    .await
}

pub async fn update_token_position(
    pool: &PgPool,
    id: &Uuid,
    x: f32,
    y: f32,
) -> Result<Option<TokenRow>, sqlx::Error> {
    sqlx::query_as!(
        TokenRow,
        r#"UPDATE tokens SET x = $2, y = $3, updated_at = now()
           WHERE id = $1 RETURNING *"#,
        id,
        x,
        y
    )
    .fetch_optional(pool)
    .await
}

#[allow(clippy::too_many_arguments)]
pub async fn update_token(
    pool: &PgPool,
    id: &Uuid,
    name: Option<&str>,
    asset_id: Option<Option<&Uuid>>,
    owner_id: Option<Option<&Uuid>>,
    x: Option<f32>,
    y: Option<f32>,
    size: Option<i32>,
    rotation: Option<f32>,
    bars_json: Option<&serde_json::Value>,
    status_markers: Option<&[String]>,
) -> Result<Option<TokenRow>, sqlx::Error> {
    sqlx::query_as!(
        TokenRow,
        r#"UPDATE tokens SET
            name = COALESCE($2, name),
            asset_id = CASE WHEN $3 THEN $4 ELSE asset_id END,
            owner_id = CASE WHEN $5 THEN $6 ELSE owner_id END,
            x = COALESCE($7, x),
            y = COALESCE($8, y),
            size = COALESCE($9, size),
            rotation = COALESCE($10, rotation),
            bars_json = COALESCE($11, bars_json),
            status_markers = COALESCE($12, status_markers),
            updated_at = now()
        WHERE id = $1
        RETURNING *"#,
        id,
        name,
        asset_id.is_some(),
        asset_id.flatten(),
        owner_id.is_some(),
        owner_id.flatten(),
        x,
        y,
        size,
        rotation,
        bars_json,
        status_markers
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_token(pool: &PgPool, id: &Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM tokens WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn get_token_auth_info(
    pool: &PgPool,
    token_id: &Uuid,
) -> Result<Option<(Uuid, Option<Uuid>)>, sqlx::Error> {
    let row = sqlx::query!(
        "SELECT layer_id, owner_id FROM tokens WHERE id = $1",
        token_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| (r.layer_id, r.owner_id)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;

    async fn setup_token_layer(pool: &PgPool) -> (Uuid, Uuid) {
        let user = crate::users::create_user(pool, "dm@test.com", "hash", "DM")
            .await
            .unwrap();
        let campaign = crate::campaigns::create_campaign(pool, "Campaign", user.id, "TOKENS01")
            .await
            .unwrap();
        let map = crate::maps::create_map(pool, &campaign.id, "Map")
            .await
            .unwrap();
        let layer = crate::map_layers::create_layer(pool, &map.id, "Tokens", "token", false)
            .await
            .unwrap();
        (layer.id, user.id)
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_create_and_find_token(pool: PgPool) {
        let (layer_id, user_id) = setup_token_layer(&pool).await;

        let bars = serde_json::json!([{"label": "HP", "current": 20.0, "max": 20.0, "color": "#ff0000", "visibility": "everyone"}]);
        let token = create_token(
            &pool,
            &layer_id,
            "Goblin",
            None,
            Some(&user_id),
            5.0,
            3.0,
            1,
            0.0,
            &bars,
            &["stunned".to_string()],
        )
        .await
        .unwrap();
        assert_eq!(token.name, "Goblin");
        assert_eq!(token.x, 5.0);
        assert_eq!(token.status_markers, vec!["stunned"]);

        let found = find_by_id(&pool, &token.id).await.unwrap().unwrap();
        assert_eq!(found.id, token.id);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_update_token_position(pool: PgPool) {
        let (layer_id, _) = setup_token_layer(&pool).await;
        let token = create_token(
            &pool,
            &layer_id,
            "Orc",
            None,
            None,
            0.0,
            0.0,
            2,
            0.0,
            &serde_json::json!([]),
            &[],
        )
        .await
        .unwrap();

        let updated = update_token_position(&pool, &token.id, 10.0, 15.0)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(updated.x, 10.0);
        assert_eq!(updated.y, 15.0);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_delete_token(pool: PgPool) {
        let (layer_id, _) = setup_token_layer(&pool).await;
        let token = create_token(
            &pool,
            &layer_id,
            "Deletable",
            None,
            None,
            0.0,
            0.0,
            1,
            0.0,
            &serde_json::json!([]),
            &[],
        )
        .await
        .unwrap();

        delete_token(&pool, &token.id).await.unwrap();
        assert!(find_by_id(&pool, &token.id).await.unwrap().is_none());
    }
}
