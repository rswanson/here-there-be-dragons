use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub struct ChatMessageRow {
    pub id: Uuid,
    pub campaign_id: Uuid,
    pub sender_user_id: Uuid,
    pub character_id: Option<Uuid>,
    pub message_type: String,
    pub content: String,
    pub whisper_target_ids: Vec<Uuid>,
    pub created_at: DateTime<Utc>,
}

pub async fn insert_message(
    pool: &PgPool,
    campaign_id: &Uuid,
    sender_user_id: &Uuid,
    character_id: Option<&Uuid>,
    message_type: &str,
    content: &str,
    whisper_target_ids: &[Uuid],
) -> Result<ChatMessageRow, sqlx::Error> {
    sqlx::query_as!(
        ChatMessageRow,
        r#"INSERT INTO chat_messages (campaign_id, sender_user_id, character_id, message_type, content, whisper_target_ids)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *"#,
        campaign_id,
        sender_user_id,
        character_id,
        message_type,
        content,
        whisper_target_ids,
    )
    .fetch_one(pool)
    .await
}

pub async fn get_recent_messages(
    pool: &PgPool,
    campaign_id: &Uuid,
    user_id: &Uuid,
    limit: i64,
) -> Result<Vec<ChatMessageRow>, sqlx::Error> {
    sqlx::query_as!(
        ChatMessageRow,
        r#"SELECT * FROM chat_messages
           WHERE campaign_id = $1
             AND (message_type != 'whisper' OR sender_user_id = $2 OR $2 = ANY(whisper_target_ids))
           ORDER BY created_at DESC
           LIMIT $3"#,
        campaign_id,
        user_id,
        limit,
    )
    .fetch_all(pool)
    .await
}

pub async fn get_messages_before(
    pool: &PgPool,
    campaign_id: &Uuid,
    user_id: &Uuid,
    before_id: &Uuid,
    limit: i64,
) -> Result<Vec<ChatMessageRow>, sqlx::Error> {
    sqlx::query_as!(
        ChatMessageRow,
        r#"SELECT * FROM chat_messages
           WHERE campaign_id = $1
             AND created_at < (SELECT created_at FROM chat_messages WHERE id = $3)
             AND (message_type != 'whisper' OR sender_user_id = $2 OR $2 = ANY(whisper_target_ids))
           ORDER BY created_at DESC
           LIMIT $4"#,
        campaign_id,
        user_id,
        before_id,
        limit,
    )
    .fetch_all(pool)
    .await
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
    async fn test_insert_and_retrieve_messages(pool: PgPool) {
        let (campaign_id, user_id) = setup_campaign(&pool).await;

        let msg = insert_message(
            &pool,
            &campaign_id,
            &user_id,
            None,
            "ooc",
            "Hello world",
            &[],
        )
        .await
        .unwrap();

        assert_eq!(msg.campaign_id, campaign_id);
        assert_eq!(msg.sender_user_id, user_id);
        assert_eq!(msg.message_type, "ooc");
        assert_eq!(msg.content, "Hello world");
        assert!(msg.whisper_target_ids.is_empty());

        let recent = get_recent_messages(&pool, &campaign_id, &user_id, 10)
            .await
            .unwrap();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].id, msg.id);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_whisper_filtering(pool: PgPool) {
        let (campaign_id, sender_id) = setup_campaign(&pool).await;
        let target = crate::users::create_user(&pool, "target@test.com", "hash", "Target")
            .await
            .unwrap();
        let outsider = crate::users::create_user(&pool, "out@test.com", "hash", "Outsider")
            .await
            .unwrap();

        insert_message(
            &pool,
            &campaign_id,
            &sender_id,
            None,
            "whisper",
            "secret",
            &[target.id],
        )
        .await
        .unwrap();

        // Sender sees whisper
        let sender_msgs = get_recent_messages(&pool, &campaign_id, &sender_id, 10)
            .await
            .unwrap();
        assert_eq!(sender_msgs.len(), 1);

        // Target sees whisper
        let target_msgs = get_recent_messages(&pool, &campaign_id, &target.id, 10)
            .await
            .unwrap();
        assert_eq!(target_msgs.len(), 1);

        // Outsider does NOT see whisper
        let outsider_msgs = get_recent_messages(&pool, &campaign_id, &outsider.id, 10)
            .await
            .unwrap();
        assert_eq!(outsider_msgs.len(), 0);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_pagination_before(pool: PgPool) {
        let (campaign_id, user_id) = setup_campaign(&pool).await;

        // Insert 3 messages
        let _m1 = insert_message(&pool, &campaign_id, &user_id, None, "ooc", "first", &[])
            .await
            .unwrap();
        let _m2 = insert_message(&pool, &campaign_id, &user_id, None, "ooc", "second", &[])
            .await
            .unwrap();
        let m3 = insert_message(&pool, &campaign_id, &user_id, None, "ooc", "third", &[])
            .await
            .unwrap();

        // Get messages before m3 (should return m1 and m2)
        let before = get_messages_before(&pool, &campaign_id, &user_id, &m3.id, 10)
            .await
            .unwrap();
        assert_eq!(before.len(), 2);
        // ordered DESC so second comes first
        assert_eq!(before[0].content, "second");
        assert_eq!(before[1].content, "first");
    }
}
