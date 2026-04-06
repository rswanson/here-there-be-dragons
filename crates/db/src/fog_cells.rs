use sqlx::PgPool;
use uuid::Uuid;

pub async fn list_for_map(pool: &PgPool, map_id: &Uuid) -> Result<Vec<(i32, i32)>, sqlx::Error> {
    let rows = sqlx::query!("SELECT x, y FROM fog_cells WHERE map_id = $1", map_id)
        .fetch_all(pool)
        .await?;
    Ok(rows.into_iter().map(|r| (r.x, r.y)).collect())
}

pub async fn reveal_cells(
    pool: &PgPool,
    map_id: &Uuid,
    cells: &[(i32, i32)],
) -> Result<u64, sqlx::Error> {
    let mut count = 0u64;
    for (x, y) in cells {
        let result = sqlx::query!(
            r#"INSERT INTO fog_cells (map_id, x, y) VALUES ($1, $2, $3) ON CONFLICT (map_id, x, y) DO NOTHING"#,
            map_id,
            x,
            y
        )
        .execute(pool)
        .await?;
        count += result.rows_affected();
    }
    Ok(count)
}

pub async fn hide_cells(
    pool: &PgPool,
    map_id: &Uuid,
    cells: &[(i32, i32)],
) -> Result<u64, sqlx::Error> {
    let mut count = 0u64;
    for (x, y) in cells {
        let result = sqlx::query!(
            "DELETE FROM fog_cells WHERE map_id = $1 AND x = $2 AND y = $3",
            map_id,
            x,
            y
        )
        .execute(pool)
        .await?;
        count += result.rows_affected();
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;

    async fn setup_map(pool: &PgPool) -> Uuid {
        let user = crate::users::create_user(pool, "dm@fog.test", "hash", "DM")
            .await
            .unwrap();
        let campaign = crate::campaigns::create_campaign(pool, "Campaign", user.id, "FOG00001")
            .await
            .unwrap();
        let map = crate::maps::create_map(pool, &campaign.id, "Foggy")
            .await
            .unwrap();
        map.id
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_reveal_and_list(pool: PgPool) {
        let map_id = setup_map(&pool).await;

        let cells = vec![(0, 0), (1, 0), (0, 1)];
        let count = reveal_cells(&pool, &map_id, &cells).await.unwrap();
        assert_eq!(count, 3);

        let listed = list_for_map(&pool, &map_id).await.unwrap();
        assert_eq!(listed.len(), 3);
        assert!(listed.contains(&(0, 0)));
        assert!(listed.contains(&(1, 0)));
        assert!(listed.contains(&(0, 1)));
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_reveal_idempotent(pool: PgPool) {
        let map_id = setup_map(&pool).await;

        let cells = vec![(5, 5), (6, 5)];
        let first = reveal_cells(&pool, &map_id, &cells).await.unwrap();
        assert_eq!(first, 2);

        // Reveal same cells again — ON CONFLICT DO NOTHING, rows_affected = 0
        let second = reveal_cells(&pool, &map_id, &cells).await.unwrap();
        assert_eq!(second, 0);

        let listed = list_for_map(&pool, &map_id).await.unwrap();
        assert_eq!(listed.len(), 2);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_hide_cells(pool: PgPool) {
        let map_id = setup_map(&pool).await;

        let all_cells = vec![(0, 0), (1, 0), (2, 0)];
        reveal_cells(&pool, &map_id, &all_cells).await.unwrap();

        let to_hide = vec![(0, 0), (2, 0)];
        let hidden = hide_cells(&pool, &map_id, &to_hide).await.unwrap();
        assert_eq!(hidden, 2);

        let remaining = list_for_map(&pool, &map_id).await.unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0], (1, 0));
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_fog_cascades_on_map_delete(pool: PgPool) {
        let map_id = setup_map(&pool).await;

        let cells = vec![(0, 0), (1, 1), (2, 2)];
        reveal_cells(&pool, &map_id, &cells).await.unwrap();

        let listed = list_for_map(&pool, &map_id).await.unwrap();
        assert_eq!(listed.len(), 3);

        sqlx::query!("DELETE FROM maps WHERE id = $1", map_id)
            .execute(&pool)
            .await
            .unwrap();

        let after = list_for_map(&pool, &map_id).await.unwrap();
        assert!(after.is_empty());
    }
}
