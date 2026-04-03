use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub struct HandoutRow {
    pub id: Uuid,
    pub campaign_id: Uuid,
    pub title: String,
    pub content: String,
    pub visibility: String,
    pub player_ids: Vec<Uuid>,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub async fn create_handout(
    pool: &PgPool,
    campaign_id: &Uuid,
    title: &str,
    content: &str,
    visibility: &str,
    player_ids: &[Uuid],
    created_by: &Uuid,
) -> Result<HandoutRow, sqlx::Error> {
    sqlx::query_as!(
        HandoutRow,
        r#"INSERT INTO handouts (campaign_id, title, content, visibility, player_ids, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *"#,
        campaign_id,
        title,
        content,
        visibility,
        player_ids,
        created_by,
    )
    .fetch_one(pool)
    .await
}

pub async fn find_by_id(pool: &PgPool, id: &Uuid) -> Result<Option<HandoutRow>, sqlx::Error> {
    sqlx::query_as!(HandoutRow, "SELECT * FROM handouts WHERE id = $1", id)
        .fetch_optional(pool)
        .await
}

pub async fn list_for_campaign(
    pool: &PgPool,
    campaign_id: &Uuid,
) -> Result<Vec<HandoutRow>, sqlx::Error> {
    sqlx::query_as!(
        HandoutRow,
        "SELECT * FROM handouts WHERE campaign_id = $1 ORDER BY created_at ASC",
        campaign_id,
    )
    .fetch_all(pool)
    .await
}

pub async fn update_handout(
    pool: &PgPool,
    id: &Uuid,
    title: Option<&str>,
    content: Option<&str>,
    visibility: Option<&str>,
    player_ids: Option<&[Uuid]>,
) -> Result<Option<HandoutRow>, sqlx::Error> {
    sqlx::query_as!(
        HandoutRow,
        r#"UPDATE handouts SET
            title = COALESCE($2, title),
            content = COALESCE($3, content),
            visibility = COALESCE($4, visibility),
            player_ids = CASE WHEN $5 THEN $6 ELSE player_ids END,
            updated_at = now()
        WHERE id = $1
        RETURNING *"#,
        id,
        title,
        content,
        visibility,
        player_ids.is_some(),
        player_ids.unwrap_or(&[]),
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_handout(pool: &PgPool, id: &Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM handouts WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub fn row_to_handout(row: HandoutRow) -> htbd_core::handout::Handout {
    htbd_core::handout::Handout {
        id: row.id,
        campaign_id: row.campaign_id,
        title: row.title,
        content: row.content,
        visibility: row
            .visibility
            .parse()
            .unwrap_or(htbd_core::handout::HandoutVisibility::DmOnly),
        player_ids: row.player_ids,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

pub fn row_to_summary(row: &HandoutRow) -> htbd_core::handout::HandoutSummary {
    htbd_core::handout::HandoutSummary {
        id: row.id,
        title: row.title.clone(),
        visibility: row
            .visibility
            .parse()
            .unwrap_or(htbd_core::handout::HandoutVisibility::DmOnly),
        player_ids: row.player_ids.clone(),
        updated_at: row.updated_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;

    async fn setup_campaign(pool: &PgPool) -> (Uuid, Uuid) {
        let user = crate::users::create_user(pool, "dm@test.com", "hash", "DM")
            .await
            .unwrap();
        let campaign = crate::campaigns::create_campaign(pool, "Test Campaign", user.id, "dnd5e")
            .await
            .unwrap();
        (campaign.id, user.id)
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_create_and_find_handout(pool: PgPool) {
        let (campaign_id, user_id) = setup_campaign(&pool).await;

        let handout = create_handout(
            &pool,
            &campaign_id,
            "Secret Map",
            "Here be dragons.",
            "dm_only",
            &[],
            &user_id,
        )
        .await
        .unwrap();

        assert_eq!(handout.title, "Secret Map");
        assert_eq!(handout.visibility, "dm_only");

        let found = find_by_id(&pool, &handout.id).await.unwrap().unwrap();
        assert_eq!(found.id, handout.id);
        assert_eq!(found.content, "Here be dragons.");
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_list_handouts(pool: PgPool) {
        let (campaign_id, user_id) = setup_campaign(&pool).await;

        create_handout(&pool, &campaign_id, "A", "", "everyone", &[], &user_id)
            .await
            .unwrap();
        create_handout(&pool, &campaign_id, "B", "", "dm_only", &[], &user_id)
            .await
            .unwrap();

        let list = list_for_campaign(&pool, &campaign_id).await.unwrap();
        assert_eq!(list.len(), 2);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_update_handout(pool: PgPool) {
        let (campaign_id, user_id) = setup_campaign(&pool).await;

        let handout = create_handout(
            &pool,
            &campaign_id,
            "Old Title",
            "Old Content",
            "dm_only",
            &[],
            &user_id,
        )
        .await
        .unwrap();

        let updated = update_handout(
            &pool,
            &handout.id,
            Some("New Title"),
            None,
            Some("everyone"),
            None,
        )
        .await
        .unwrap()
        .unwrap();

        assert_eq!(updated.title, "New Title");
        assert_eq!(updated.content, "Old Content");
        assert_eq!(updated.visibility, "everyone");
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_delete_handout(pool: PgPool) {
        let (campaign_id, user_id) = setup_campaign(&pool).await;

        let handout = create_handout(&pool, &campaign_id, "Doomed", "", "dm_only", &[], &user_id)
            .await
            .unwrap();

        let deleted = delete_handout(&pool, &handout.id).await.unwrap();
        assert!(deleted);

        let not_found = find_by_id(&pool, &handout.id).await.unwrap();
        assert!(not_found.is_none());
    }
}
