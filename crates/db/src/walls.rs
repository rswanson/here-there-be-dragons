use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub struct WallRow {
    pub id: Uuid,
    pub map_id: Uuid,
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
    pub wall_type: String,
    pub door_state: String,
    pub created_at: DateTime<Utc>,
}

impl From<WallRow> for htbd_core::wall::Wall {
    fn from(row: WallRow) -> Self {
        Self {
            id: row.id,
            map_id: row.map_id,
            x1: row.x1,
            y1: row.y1,
            x2: row.x2,
            y2: row.y2,
            wall_type: serde_json::from_value(serde_json::Value::String(row.wall_type))
                .unwrap_or(htbd_core::wall::WallType::Wall),
            door_state: serde_json::from_value(serde_json::Value::String(row.door_state))
                .unwrap_or(htbd_core::wall::DoorState::Closed),
            created_at: row.created_at,
        }
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn create_wall(
    pool: &PgPool,
    map_id: &Uuid,
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    wall_type: &str,
    door_state: &str,
) -> Result<WallRow, sqlx::Error> {
    sqlx::query_as!(
        WallRow,
        r#"INSERT INTO walls (map_id, x1, y1, x2, y2, wall_type, door_state)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *"#,
        map_id,
        x1,
        y1,
        x2,
        y2,
        wall_type,
        door_state
    )
    .fetch_one(pool)
    .await
}

pub async fn list_for_map(pool: &PgPool, map_id: &Uuid) -> Result<Vec<WallRow>, sqlx::Error> {
    sqlx::query_as!(
        WallRow,
        "SELECT * FROM walls WHERE map_id = $1 ORDER BY created_at ASC",
        map_id
    )
    .fetch_all(pool)
    .await
}

pub async fn find_by_id(pool: &PgPool, id: &Uuid) -> Result<Option<WallRow>, sqlx::Error> {
    sqlx::query_as!(WallRow, "SELECT * FROM walls WHERE id = $1", id)
        .fetch_optional(pool)
        .await
}

#[allow(clippy::too_many_arguments)]
pub async fn update_wall(
    pool: &PgPool,
    id: &Uuid,
    x1: Option<f32>,
    y1: Option<f32>,
    x2: Option<f32>,
    y2: Option<f32>,
    wall_type: Option<&str>,
    door_state: Option<&str>,
) -> Result<Option<WallRow>, sqlx::Error> {
    sqlx::query_as!(
        WallRow,
        r#"UPDATE walls SET
            x1 = COALESCE($2, x1),
            y1 = COALESCE($3, y1),
            x2 = COALESCE($4, x2),
            y2 = COALESCE($5, y2),
            wall_type = COALESCE($6, wall_type),
            door_state = COALESCE($7, door_state)
        WHERE id = $1
        RETURNING *"#,
        id,
        x1,
        y1,
        x2,
        y2,
        wall_type,
        door_state
    )
    .fetch_optional(pool)
    .await
}

pub async fn update_door_state(
    pool: &PgPool,
    id: &Uuid,
    door_state: &str,
) -> Result<Option<WallRow>, sqlx::Error> {
    sqlx::query_as!(
        WallRow,
        r#"UPDATE walls SET door_state = $2 WHERE id = $1 RETURNING *"#,
        id,
        door_state
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_wall(pool: &PgPool, id: &Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM walls WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn delete_walls(pool: &PgPool, ids: &[Uuid]) -> Result<u64, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM walls WHERE id = ANY($1)", ids)
        .execute(pool)
        .await?;
    Ok(result.rows_affected())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;

    async fn setup_map(pool: &PgPool) -> (Uuid, Uuid) {
        let user = crate::users::create_user(pool, "dm@walls.test", "hash", "DM")
            .await
            .unwrap();
        let campaign = crate::campaigns::create_campaign(pool, "Campaign", user.id, "WALLS001")
            .await
            .unwrap();
        let map = crate::maps::create_map(pool, &campaign.id, "Dungeon")
            .await
            .unwrap();
        (map.id, user.id)
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_create_and_list_walls(pool: PgPool) {
        let (map_id, _) = setup_map(&pool).await;

        let wall = create_wall(&pool, &map_id, 0.0, 0.0, 100.0, 0.0, "wall", "closed")
            .await
            .unwrap();
        assert_eq!(wall.wall_type, "wall");
        assert_eq!(wall.x1, 0.0);
        assert_eq!(wall.x2, 100.0);

        create_wall(&pool, &map_id, 0.0, 0.0, 0.0, 100.0, "door", "closed")
            .await
            .unwrap();

        let walls = list_for_map(&pool, &map_id).await.unwrap();
        assert_eq!(walls.len(), 2);

        let found = find_by_id(&pool, &wall.id).await.unwrap().unwrap();
        assert_eq!(found.id, wall.id);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_update_wall(pool: PgPool) {
        let (map_id, _) = setup_map(&pool).await;

        let wall = create_wall(&pool, &map_id, 0.0, 0.0, 10.0, 10.0, "wall", "closed")
            .await
            .unwrap();

        let updated = update_wall(
            &pool,
            &wall.id,
            Some(5.0),
            Some(5.0),
            None,
            None,
            Some("door"),
            None,
        )
        .await
        .unwrap()
        .unwrap();

        assert_eq!(updated.x1, 5.0);
        assert_eq!(updated.y1, 5.0);
        assert_eq!(updated.x2, 10.0);
        assert_eq!(updated.wall_type, "door");
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_update_door_state(pool: PgPool) {
        let (map_id, _) = setup_map(&pool).await;

        let wall = create_wall(&pool, &map_id, 0.0, 0.0, 10.0, 0.0, "door", "closed")
            .await
            .unwrap();
        assert_eq!(wall.door_state, "closed");

        let updated = update_door_state(&pool, &wall.id, "open")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(updated.door_state, "open");
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_delete_walls(pool: PgPool) {
        let (map_id, _) = setup_map(&pool).await;

        let w1 = create_wall(&pool, &map_id, 0.0, 0.0, 10.0, 0.0, "wall", "closed")
            .await
            .unwrap();
        let w2 = create_wall(&pool, &map_id, 0.0, 0.0, 0.0, 10.0, "wall", "closed")
            .await
            .unwrap();
        let w3 = create_wall(&pool, &map_id, 10.0, 0.0, 10.0, 10.0, "wall", "closed")
            .await
            .unwrap();

        let deleted = delete_walls(&pool, &[w1.id, w2.id]).await.unwrap();
        assert_eq!(deleted, 2);

        let remaining = list_for_map(&pool, &map_id).await.unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, w3.id);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_walls_cascade_on_map_delete(pool: PgPool) {
        let (map_id, _) = setup_map(&pool).await;

        create_wall(&pool, &map_id, 0.0, 0.0, 10.0, 0.0, "wall", "closed")
            .await
            .unwrap();
        create_wall(&pool, &map_id, 0.0, 0.0, 0.0, 10.0, "wall", "closed")
            .await
            .unwrap();

        let walls = list_for_map(&pool, &map_id).await.unwrap();
        assert_eq!(walls.len(), 2);

        sqlx::query!("DELETE FROM maps WHERE id = $1", map_id)
            .execute(&pool)
            .await
            .unwrap();

        let walls_after = list_for_map(&pool, &map_id).await.unwrap();
        assert!(walls_after.is_empty());
    }
}
