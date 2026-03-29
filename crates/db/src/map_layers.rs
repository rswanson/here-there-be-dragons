use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub struct MapLayerRow {
    pub id: Uuid,
    pub map_id: Uuid,
    pub name: String,
    pub layer_type: String,
    pub sort_order: i32,
    pub visible: bool,
    pub locked: bool,
    pub opacity: f32,
    pub dm_only: bool,
    pub created_at: DateTime<Utc>,
}

impl From<MapLayerRow> for htbd_core::map::MapLayer {
    fn from(row: MapLayerRow) -> Self {
        Self {
            id: row.id,
            map_id: row.map_id,
            name: row.name,
            layer_type: serde_json::from_value(serde_json::Value::String(row.layer_type))
                .unwrap_or(htbd_core::map::LayerType::Drawing),
            sort_order: row.sort_order,
            visible: row.visible,
            locked: row.locked,
            opacity: row.opacity,
            dm_only: row.dm_only,
            created_at: row.created_at,
        }
    }
}

pub async fn create_layer(
    pool: &PgPool,
    map_id: &Uuid,
    name: &str,
    layer_type: &str,
    dm_only: bool,
) -> Result<MapLayerRow, sqlx::Error> {
    let max_order: Option<i32> = sqlx::query_scalar!(
        "SELECT MAX(sort_order) FROM map_layers WHERE map_id = $1",
        map_id
    )
    .fetch_one(pool)
    .await?;

    let sort_order = max_order.unwrap_or(-1) + 1;

    sqlx::query_as!(
        MapLayerRow,
        r#"INSERT INTO map_layers (map_id, name, layer_type, sort_order, dm_only)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *"#,
        map_id,
        name,
        layer_type,
        sort_order,
        dm_only
    )
    .fetch_one(pool)
    .await
}

pub async fn create_default_layers(
    pool: &PgPool,
    map_id: &Uuid,
) -> Result<Vec<MapLayerRow>, sqlx::Error> {
    let bg = create_layer(pool, map_id, "Background", "map_image", false).await?;
    let tokens = create_layer(pool, map_id, "Tokens", "token", false).await?;
    let dm = create_layer(pool, map_id, "DM Notes", "drawing", true).await?;
    Ok(vec![bg, tokens, dm])
}

pub async fn find_by_id(pool: &PgPool, id: &Uuid) -> Result<Option<MapLayerRow>, sqlx::Error> {
    sqlx::query_as!(MapLayerRow, "SELECT * FROM map_layers WHERE id = $1", id)
        .fetch_optional(pool)
        .await
}

pub async fn list_for_map(pool: &PgPool, map_id: &Uuid) -> Result<Vec<MapLayerRow>, sqlx::Error> {
    sqlx::query_as!(
        MapLayerRow,
        "SELECT * FROM map_layers WHERE map_id = $1 ORDER BY sort_order ASC",
        map_id
    )
    .fetch_all(pool)
    .await
}

pub async fn list_for_map_player(
    pool: &PgPool,
    map_id: &Uuid,
) -> Result<Vec<MapLayerRow>, sqlx::Error> {
    sqlx::query_as!(
        MapLayerRow,
        "SELECT * FROM map_layers WHERE map_id = $1 AND dm_only = false ORDER BY sort_order ASC",
        map_id
    )
    .fetch_all(pool)
    .await
}

pub async fn update_layer(
    pool: &PgPool,
    id: &Uuid,
    name: Option<&str>,
    visible: Option<bool>,
    locked: Option<bool>,
    opacity: Option<f32>,
    dm_only: Option<bool>,
) -> Result<Option<MapLayerRow>, sqlx::Error> {
    sqlx::query_as!(
        MapLayerRow,
        r#"UPDATE map_layers SET
            name = COALESCE($2, name),
            visible = COALESCE($3, visible),
            locked = COALESCE($4, locked),
            opacity = COALESCE($5, opacity),
            dm_only = COALESCE($6, dm_only)
        WHERE id = $1
        RETURNING *"#,
        id,
        name,
        visible,
        locked,
        opacity,
        dm_only
    )
    .fetch_optional(pool)
    .await
}

pub async fn reorder_layers(
    pool: &PgPool,
    map_id: &Uuid,
    layer_ids: &[Uuid],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    for (i, layer_id) in layer_ids.iter().enumerate() {
        sqlx::query!(
            "UPDATE map_layers SET sort_order = $1 WHERE id = $2 AND map_id = $3",
            i as i32,
            layer_id,
            map_id
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await
}

pub async fn delete_layer(pool: &PgPool, id: &Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM map_layers WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn get_map_id_for_layer(
    pool: &PgPool,
    layer_id: &Uuid,
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar!("SELECT map_id FROM map_layers WHERE id = $1", layer_id)
        .fetch_optional(pool)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;

    async fn setup_map(pool: &PgPool) -> (uuid::Uuid, uuid::Uuid) {
        let user = crate::users::create_user(pool, "dm@test.com", "hash", "DM")
            .await
            .unwrap();
        let campaign = crate::campaigns::create_campaign(pool, "Campaign", user.id, "LAYERS01")
            .await
            .unwrap();
        let map = crate::maps::create_map(pool, &campaign.id, "Map")
            .await
            .unwrap();
        (campaign.id, map.id)
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_create_default_layers(pool: PgPool) {
        let (_, map_id) = setup_map(&pool).await;
        let layers = create_default_layers(&pool, &map_id).await.unwrap();
        assert_eq!(layers.len(), 3);
        assert_eq!(layers[0].name, "Background");
        assert_eq!(layers[0].layer_type, "map_image");
        assert_eq!(layers[1].name, "Tokens");
        assert_eq!(layers[1].layer_type, "token");
        assert_eq!(layers[2].name, "DM Notes");
        assert!(layers[2].dm_only);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_create_and_list_layers(pool: PgPool) {
        let (_, map_id) = setup_map(&pool).await;
        create_layer(&pool, &map_id, "Custom", "drawing", false)
            .await
            .unwrap();
        create_layer(&pool, &map_id, "Enemies", "token", true)
            .await
            .unwrap();

        let layers = list_for_map(&pool, &map_id).await.unwrap();
        assert_eq!(layers.len(), 2);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_reorder_layers(pool: PgPool) {
        let (_, map_id) = setup_map(&pool).await;
        let layers = create_default_layers(&pool, &map_id).await.unwrap();
        let ids: Vec<Uuid> = vec![layers[2].id, layers[0].id, layers[1].id];

        reorder_layers(&pool, &map_id, &ids).await.unwrap();

        let reordered = list_for_map(&pool, &map_id).await.unwrap();
        assert_eq!(reordered[0].id, layers[2].id);
        assert_eq!(reordered[0].sort_order, 0);
        assert_eq!(reordered[1].id, layers[0].id);
        assert_eq!(reordered[1].sort_order, 1);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_list_for_map_excludes_dm_only(pool: PgPool) {
        let (_, map_id) = setup_map(&pool).await;
        create_default_layers(&pool, &map_id).await.unwrap();

        let player_layers = list_for_map_player(&pool, &map_id).await.unwrap();
        assert_eq!(player_layers.len(), 2);
        assert!(player_layers.iter().all(|l| !l.dm_only));
    }
}
