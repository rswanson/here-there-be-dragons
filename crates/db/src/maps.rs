use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub struct MapRow {
    pub id: Uuid,
    pub campaign_id: Uuid,
    pub name: String,
    pub grid_enabled: bool,
    pub grid_size_px: i32,
    pub grid_color: String,
    pub grid_opacity: f32,
    pub grid_line_width: f32,
    pub grid_scale: f32,
    pub grid_scale_unit: String,
    pub snap_mode: String,
    pub diagonal_mode: String,
    pub width_squares: i32,
    pub height_squares: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<MapRow> for htbd_core::map::Map {
    fn from(row: MapRow) -> Self {
        Self {
            id: row.id,
            campaign_id: row.campaign_id,
            name: row.name,
            grid_enabled: row.grid_enabled,
            grid_size_px: row.grid_size_px,
            grid_color: row.grid_color,
            grid_opacity: row.grid_opacity,
            grid_line_width: row.grid_line_width,
            grid_scale: row.grid_scale,
            grid_scale_unit: row.grid_scale_unit,
            snap_mode: serde_json::from_value(serde_json::Value::String(row.snap_mode))
                .unwrap_or(htbd_core::map::SnapMode::Center),
            diagonal_mode: serde_json::from_value(serde_json::Value::String(row.diagonal_mode))
                .unwrap_or(htbd_core::map::DiagonalMode::DndStandard),
            width_squares: row.width_squares,
            height_squares: row.height_squares,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

pub async fn create_map(
    pool: &PgPool,
    campaign_id: &Uuid,
    name: &str,
) -> Result<MapRow, sqlx::Error> {
    sqlx::query_as!(
        MapRow,
        r#"INSERT INTO maps (campaign_id, name)
           VALUES ($1, $2)
           RETURNING *"#,
        campaign_id,
        name
    )
    .fetch_one(pool)
    .await
}

pub async fn find_by_id(pool: &PgPool, id: &Uuid) -> Result<Option<MapRow>, sqlx::Error> {
    sqlx::query_as!(MapRow, "SELECT * FROM maps WHERE id = $1", id)
        .fetch_optional(pool)
        .await
}

pub async fn list_for_campaign(
    pool: &PgPool,
    campaign_id: &Uuid,
) -> Result<Vec<MapRow>, sqlx::Error> {
    sqlx::query_as!(
        MapRow,
        "SELECT * FROM maps WHERE campaign_id = $1 ORDER BY created_at DESC",
        campaign_id
    )
    .fetch_all(pool)
    .await
}

#[allow(clippy::too_many_arguments)]
pub async fn update_map(
    pool: &PgPool,
    id: &Uuid,
    name: Option<&str>,
    grid_enabled: Option<bool>,
    grid_size_px: Option<i32>,
    grid_color: Option<&str>,
    grid_opacity: Option<f32>,
    grid_line_width: Option<f32>,
    grid_scale: Option<f32>,
    grid_scale_unit: Option<&str>,
    snap_mode: Option<&str>,
    diagonal_mode: Option<&str>,
    width_squares: Option<i32>,
    height_squares: Option<i32>,
) -> Result<Option<MapRow>, sqlx::Error> {
    sqlx::query_as!(
        MapRow,
        r#"UPDATE maps SET
            name = COALESCE($2, name),
            grid_enabled = COALESCE($3, grid_enabled),
            grid_size_px = COALESCE($4, grid_size_px),
            grid_color = COALESCE($5, grid_color),
            grid_opacity = COALESCE($6, grid_opacity),
            grid_line_width = COALESCE($7, grid_line_width),
            grid_scale = COALESCE($8, grid_scale),
            grid_scale_unit = COALESCE($9, grid_scale_unit),
            snap_mode = COALESCE($10, snap_mode),
            diagonal_mode = COALESCE($11, diagonal_mode),
            width_squares = COALESCE($12, width_squares),
            height_squares = COALESCE($13, height_squares),
            updated_at = now()
        WHERE id = $1
        RETURNING *"#,
        id,
        name,
        grid_enabled,
        grid_size_px,
        grid_color,
        grid_opacity,
        grid_line_width,
        grid_scale,
        grid_scale_unit,
        snap_mode,
        diagonal_mode,
        width_squares,
        height_squares
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_map(pool: &PgPool, id: &Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM maps WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_create_and_find_map(pool: PgPool) {
        let user = crate::users::create_user(&pool, "dm@test.com", "hash", "DM")
            .await
            .unwrap();
        let campaign =
            crate::campaigns::create_campaign(&pool, "Test Campaign", user.id, "INVITE01")
                .await
                .unwrap();

        let map = create_map(&pool, &campaign.id, "Tavern").await.unwrap();
        assert_eq!(map.name, "Tavern");
        assert!(map.grid_enabled);
        assert_eq!(map.grid_size_px, 70);
        assert_eq!(map.width_squares, 30);
        assert_eq!(map.height_squares, 20);

        let found = find_by_id(&pool, &map.id).await.unwrap().unwrap();
        assert_eq!(found.id, map.id);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_list_maps_for_campaign(pool: PgPool) {
        let user = crate::users::create_user(&pool, "dm@test.com", "hash", "DM")
            .await
            .unwrap();
        let campaign =
            crate::campaigns::create_campaign(&pool, "Test Campaign", user.id, "INVITE02")
                .await
                .unwrap();

        create_map(&pool, &campaign.id, "Map A").await.unwrap();
        create_map(&pool, &campaign.id, "Map B").await.unwrap();

        let maps = list_for_campaign(&pool, &campaign.id).await.unwrap();
        assert_eq!(maps.len(), 2);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_update_map(pool: PgPool) {
        let user = crate::users::create_user(&pool, "dm@test.com", "hash", "DM")
            .await
            .unwrap();
        let campaign =
            crate::campaigns::create_campaign(&pool, "Test Campaign", user.id, "INVITE03")
                .await
                .unwrap();
        let map = create_map(&pool, &campaign.id, "Old Name").await.unwrap();

        let updated = update_map(
            &pool,
            &map.id,
            Some("New Name"),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(updated.name, "New Name");
        assert!(updated.grid_enabled); // unchanged
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_delete_map(pool: PgPool) {
        let user = crate::users::create_user(&pool, "dm@test.com", "hash", "DM")
            .await
            .unwrap();
        let campaign =
            crate::campaigns::create_campaign(&pool, "Test Campaign", user.id, "INVITE04")
                .await
                .unwrap();
        let map = create_map(&pool, &campaign.id, "Deletable").await.unwrap();

        delete_map(&pool, &map.id).await.unwrap();
        let found = find_by_id(&pool, &map.id).await.unwrap();
        assert!(found.is_none());
    }
}
