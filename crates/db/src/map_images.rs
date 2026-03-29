use sqlx::PgPool;
use uuid::Uuid;

pub struct MapImageRow {
    pub id: Uuid,
    pub layer_id: Uuid,
    pub asset_id: Uuid,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub rotation: f32,
    pub opacity: f32,
}

impl From<MapImageRow> for htbd_core::map::MapImage {
    fn from(row: MapImageRow) -> Self {
        Self {
            id: row.id,
            layer_id: row.layer_id,
            asset_id: row.asset_id,
            x: row.x,
            y: row.y,
            width: row.width,
            height: row.height,
            rotation: row.rotation,
            opacity: row.opacity,
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn place_image(
    pool: &PgPool,
    layer_id: &Uuid,
    asset_id: &Uuid,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    rotation: f32,
    opacity: f32,
) -> Result<MapImageRow, sqlx::Error> {
    sqlx::query_as!(
        MapImageRow,
        r#"INSERT INTO map_images (layer_id, asset_id, x, y, width, height, rotation, opacity)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *"#,
        layer_id,
        asset_id,
        x,
        y,
        width,
        height,
        rotation,
        opacity
    )
    .fetch_one(pool)
    .await
}

pub async fn find_by_id(pool: &PgPool, id: &Uuid) -> Result<Option<MapImageRow>, sqlx::Error> {
    sqlx::query_as!(MapImageRow, "SELECT * FROM map_images WHERE id = $1", id)
        .fetch_optional(pool)
        .await
}

pub async fn list_for_layer(
    pool: &PgPool,
    layer_id: &Uuid,
) -> Result<Vec<MapImageRow>, sqlx::Error> {
    sqlx::query_as!(
        MapImageRow,
        "SELECT * FROM map_images WHERE layer_id = $1",
        layer_id
    )
    .fetch_all(pool)
    .await
}

#[allow(clippy::too_many_arguments)]
pub async fn update_image(
    pool: &PgPool,
    id: &Uuid,
    x: Option<f32>,
    y: Option<f32>,
    width: Option<f32>,
    height: Option<f32>,
    rotation: Option<f32>,
    opacity: Option<f32>,
) -> Result<Option<MapImageRow>, sqlx::Error> {
    sqlx::query_as!(
        MapImageRow,
        r#"UPDATE map_images SET
            x = COALESCE($2, x),
            y = COALESCE($3, y),
            width = COALESCE($4, width),
            height = COALESCE($5, height),
            rotation = COALESCE($6, rotation),
            opacity = COALESCE($7, opacity)
        WHERE id = $1
        RETURNING *"#,
        id,
        x,
        y,
        width,
        height,
        rotation,
        opacity
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_image(pool: &PgPool, id: &Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM map_images WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn get_layer_id_for_image(
    pool: &PgPool,
    image_id: &Uuid,
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar!("SELECT layer_id FROM map_images WHERE id = $1", image_id)
        .fetch_optional(pool)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;

    async fn setup_layer(pool: &PgPool) -> (Uuid, Uuid, Uuid) {
        let user = crate::users::create_user(pool, "dm@test.com", "hash", "DM")
            .await
            .unwrap();
        let campaign = crate::campaigns::create_campaign(pool, "Campaign", user.id, "MAPIMG01")
            .await
            .unwrap();
        let map = crate::maps::create_map(pool, &campaign.id, "Map")
            .await
            .unwrap();
        let layer =
            crate::map_layers::create_layer(pool, &map.id, "Background", "map_image", false)
                .await
                .unwrap();
        let asset = crate::assets::create_asset(
            pool,
            campaign.id,
            user.id,
            "map.png",
            "image/png",
            "path/map.png",
            1024,
        )
        .await
        .unwrap();
        (layer.id, asset.id, campaign.id)
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_place_and_list_images(pool: PgPool) {
        let (layer_id, asset_id, _) = setup_layer(&pool).await;

        let img = place_image(&pool, &layer_id, &asset_id, 0.0, 0.0, 30.0, 20.0, 0.0, 1.0)
            .await
            .unwrap();
        assert_eq!(img.width, 30.0);

        let images = list_for_layer(&pool, &layer_id).await.unwrap();
        assert_eq!(images.len(), 1);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_update_image(pool: PgPool) {
        let (layer_id, asset_id, _) = setup_layer(&pool).await;
        let img = place_image(&pool, &layer_id, &asset_id, 0.0, 0.0, 30.0, 20.0, 0.0, 1.0)
            .await
            .unwrap();

        let updated = update_image(&pool, &img.id, Some(5.0), Some(5.0), None, None, None, None)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(updated.x, 5.0);
        assert_eq!(updated.y, 5.0);
        assert_eq!(updated.width, 30.0);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_delete_image(pool: PgPool) {
        let (layer_id, asset_id, _) = setup_layer(&pool).await;
        let img = place_image(&pool, &layer_id, &asset_id, 0.0, 0.0, 30.0, 20.0, 0.0, 1.0)
            .await
            .unwrap();

        delete_image(&pool, &img.id).await.unwrap();
        let images = list_for_layer(&pool, &layer_id).await.unwrap();
        assert!(images.is_empty());
    }
}
