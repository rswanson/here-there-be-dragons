use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

pub struct FieldValueRow {
    pub character_id: Uuid,
    pub field_id: String,
    pub value: serde_json::Value,
}

pub async fn get_all_fields(
    pool: &PgPool,
    character_id: &Uuid,
) -> Result<Vec<FieldValueRow>, sqlx::Error> {
    sqlx::query_as!(
        FieldValueRow,
        "SELECT character_id, field_id, value FROM character_field_values WHERE character_id = $1 ORDER BY field_id ASC",
        character_id
    )
    .fetch_all(pool)
    .await
}

pub async fn upsert_fields(
    pool: &PgPool,
    character_id: &Uuid,
    fields: &HashMap<String, serde_json::Value>,
) -> Result<(), sqlx::Error> {
    for (field_id, value) in fields {
        sqlx::query!(
            r#"INSERT INTO character_field_values (character_id, field_id, value)
               VALUES ($1, $2, $3)
               ON CONFLICT (character_id, field_id) DO UPDATE SET value = EXCLUDED.value"#,
            character_id,
            field_id,
            value,
        )
        .execute(pool)
        .await?;
    }
    Ok(())
}

pub async fn delete_all_fields(pool: &PgPool, character_id: &Uuid) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM character_field_values WHERE character_id = $1",
        character_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub fn rows_to_map(rows: Vec<FieldValueRow>) -> HashMap<String, serde_json::Value> {
    rows.into_iter().map(|r| (r.field_id, r.value)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;

    async fn setup_character(pool: &PgPool) -> Uuid {
        let user = crate::users::create_user(pool, "dm@test.com", "hash", "DM")
            .await
            .unwrap();
        let campaign = crate::campaigns::create_campaign(pool, "Test Campaign", user.id, "dnd5e")
            .await
            .unwrap();
        let character = crate::characters::create_character(
            pool,
            &campaign.id,
            &user.id,
            "dnd5e",
            "TestChar",
            None,
        )
        .await
        .unwrap();
        character.id
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_upsert_and_get_fields(pool: PgPool) {
        let character_id = setup_character(&pool).await;

        let mut fields = HashMap::new();
        fields.insert("strength".to_string(), serde_json::json!(18));
        fields.insert("dexterity".to_string(), serde_json::json!(14));

        upsert_fields(&pool, &character_id, &fields).await.unwrap();

        let rows = get_all_fields(&pool, &character_id).await.unwrap();
        assert_eq!(rows.len(), 2);

        let map = rows_to_map(rows);
        assert_eq!(map["strength"], serde_json::json!(18));
        assert_eq!(map["dexterity"], serde_json::json!(14));
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_upsert_overwrites_existing(pool: PgPool) {
        let character_id = setup_character(&pool).await;

        let mut fields = HashMap::new();
        fields.insert("strength".to_string(), serde_json::json!(10));
        upsert_fields(&pool, &character_id, &fields).await.unwrap();

        fields.insert("strength".to_string(), serde_json::json!(20));
        upsert_fields(&pool, &character_id, &fields).await.unwrap();

        let rows = get_all_fields(&pool, &character_id).await.unwrap();
        let map = rows_to_map(rows);
        assert_eq!(map["strength"], serde_json::json!(20));
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_delete_all_fields(pool: PgPool) {
        let character_id = setup_character(&pool).await;

        let mut fields = HashMap::new();
        fields.insert("hp".to_string(), serde_json::json!(50));
        upsert_fields(&pool, &character_id, &fields).await.unwrap();

        delete_all_fields(&pool, &character_id).await.unwrap();

        let rows = get_all_fields(&pool, &character_id).await.unwrap();
        assert!(rows.is_empty());
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_rows_to_map(pool: PgPool) {
        let character_id = setup_character(&pool).await;

        let mut fields = HashMap::new();
        fields.insert("ac".to_string(), serde_json::json!(15));
        fields.insert("initiative".to_string(), serde_json::json!(3));
        upsert_fields(&pool, &character_id, &fields).await.unwrap();

        let rows = get_all_fields(&pool, &character_id).await.unwrap();
        let map = rows_to_map(rows);
        assert_eq!(map.len(), 2);
        assert_eq!(map["ac"], serde_json::json!(15));
    }
}
