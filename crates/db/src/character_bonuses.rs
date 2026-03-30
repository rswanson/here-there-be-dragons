use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

pub struct BonusRow {
    pub id: Uuid,
    pub character_id: Uuid,
    pub field_id: String,
    pub source: String,
    pub bonus_type: String,
    pub value: i32,
}

pub async fn list_for_character(
    pool: &PgPool,
    character_id: &Uuid,
) -> Result<Vec<BonusRow>, sqlx::Error> {
    sqlx::query_as!(
        BonusRow,
        "SELECT * FROM character_bonuses WHERE character_id = $1 ORDER BY field_id ASC",
        character_id
    )
    .fetch_all(pool)
    .await
}

pub async fn list_for_character_field(
    pool: &PgPool,
    character_id: &Uuid,
    field_id: &str,
) -> Result<Vec<BonusRow>, sqlx::Error> {
    sqlx::query_as!(
        BonusRow,
        "SELECT * FROM character_bonuses WHERE character_id = $1 AND field_id = $2",
        character_id,
        field_id,
    )
    .fetch_all(pool)
    .await
}

pub async fn add_bonus(
    pool: &PgPool,
    character_id: &Uuid,
    field_id: &str,
    source: &str,
    bonus_type: &str,
    value: i32,
) -> Result<BonusRow, sqlx::Error> {
    sqlx::query_as!(
        BonusRow,
        r#"INSERT INTO character_bonuses (character_id, field_id, source, bonus_type, value)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *"#,
        character_id,
        field_id,
        source,
        bonus_type,
        value,
    )
    .fetch_one(pool)
    .await
}

pub async fn update_bonus(
    pool: &PgPool,
    bonus_id: &Uuid,
    source: Option<&str>,
    bonus_type: Option<&str>,
    value: Option<i32>,
) -> Result<Option<BonusRow>, sqlx::Error> {
    sqlx::query_as!(
        BonusRow,
        r#"UPDATE character_bonuses SET
            source = COALESCE($2, source),
            bonus_type = COALESCE($3, bonus_type),
            value = COALESCE($4, value)
        WHERE id = $1
        RETURNING *"#,
        bonus_id,
        source,
        bonus_type,
        value,
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_bonus(pool: &PgPool, bonus_id: &Uuid) -> Result<bool, sqlx::Error> {
    let result: sqlx::postgres::PgQueryResult =
        sqlx::query!("DELETE FROM character_bonuses WHERE id = $1", bonus_id)
            .execute(pool)
            .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn find_bonus_by_id(
    pool: &PgPool,
    bonus_id: &Uuid,
) -> Result<Option<BonusRow>, sqlx::Error> {
    sqlx::query_as!(
        BonusRow,
        "SELECT * FROM character_bonuses WHERE id = $1",
        bonus_id
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_all_for_character(
    pool: &PgPool,
    character_id: &Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM character_bonuses WHERE character_id = $1",
        character_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub fn rows_to_bonus_map(
    rows: Vec<BonusRow>,
) -> HashMap<String, Vec<htbd_core::game_system::BonusEntry>> {
    let mut map: HashMap<String, Vec<htbd_core::game_system::BonusEntry>> = HashMap::new();
    for row in rows {
        let entry = htbd_core::game_system::BonusEntry {
            id: row.id,
            source: row.source,
            bonus_type: row.bonus_type,
            value: row.value as i64,
        };
        map.entry(row.field_id).or_default().push(entry);
    }
    map
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
            "BonusChar",
            None,
        )
        .await
        .unwrap();
        character.id
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_add_and_list_bonuses(pool: PgPool) {
        let character_id = setup_character(&pool).await;

        let bonus = add_bonus(&pool, &character_id, "strength", "racial", "enhancement", 2)
            .await
            .unwrap();
        assert_eq!(bonus.source, "racial");
        assert_eq!(bonus.value, 2);

        let list = list_for_character(&pool, &character_id).await.unwrap();
        assert_eq!(list.len(), 1);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_list_for_character_field(pool: PgPool) {
        let character_id = setup_character(&pool).await;

        add_bonus(&pool, &character_id, "strength", "racial", "enhancement", 2)
            .await
            .unwrap();
        add_bonus(&pool, &character_id, "dexterity", "belt", "enhancement", 4)
            .await
            .unwrap();

        let str_bonuses = list_for_character_field(&pool, &character_id, "strength")
            .await
            .unwrap();
        assert_eq!(str_bonuses.len(), 1);
        assert_eq!(str_bonuses[0].field_id, "strength");
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_update_bonus(pool: PgPool) {
        let character_id = setup_character(&pool).await;

        let bonus = add_bonus(&pool, &character_id, "strength", "racial", "enhancement", 2)
            .await
            .unwrap();

        let updated = update_bonus(&pool, &bonus.id, None, None, Some(4))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(updated.value, 4);
        assert_eq!(updated.source, "racial");
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_delete_bonus(pool: PgPool) {
        let character_id = setup_character(&pool).await;

        let bonus = add_bonus(&pool, &character_id, "hp", "con", "untyped", 10)
            .await
            .unwrap();

        let deleted = delete_bonus(&pool, &bonus.id).await.unwrap();
        assert!(deleted);

        let not_found = find_bonus_by_id(&pool, &bonus.id).await.unwrap();
        assert!(not_found.is_none());
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_delete_all_for_character(pool: PgPool) {
        let character_id = setup_character(&pool).await;

        add_bonus(&pool, &character_id, "strength", "a", "enhancement", 2)
            .await
            .unwrap();
        add_bonus(&pool, &character_id, "strength", "b", "morale", 1)
            .await
            .unwrap();

        delete_all_for_character(&pool, &character_id)
            .await
            .unwrap();

        let list = list_for_character(&pool, &character_id).await.unwrap();
        assert!(list.is_empty());
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_rows_to_bonus_map(pool: PgPool) {
        let character_id = setup_character(&pool).await;

        add_bonus(&pool, &character_id, "strength", "racial", "enhancement", 2)
            .await
            .unwrap();
        add_bonus(&pool, &character_id, "strength", "item", "morale", 1)
            .await
            .unwrap();
        add_bonus(&pool, &character_id, "dexterity", "feat", "enhancement", 3)
            .await
            .unwrap();

        let rows = list_for_character(&pool, &character_id).await.unwrap();
        let map = rows_to_bonus_map(rows);

        assert_eq!(map["strength"].len(), 2);
        assert_eq!(map["dexterity"].len(), 1);
        assert_eq!(map["dexterity"][0].value, 3);
    }
}
