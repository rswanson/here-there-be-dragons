use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub struct CharacterRow {
    pub id: Uuid,
    pub campaign_id: Uuid,
    pub owner_id: Uuid,
    pub game_system_id: String,
    pub name: String,
    pub portrait_asset_id: Option<Uuid>,
    pub visible_to_players: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub async fn create_character(
    pool: &PgPool,
    campaign_id: &Uuid,
    owner_id: &Uuid,
    game_system_id: &str,
    name: &str,
    portrait_asset_id: Option<&Uuid>,
) -> Result<CharacterRow, sqlx::Error> {
    sqlx::query_as!(
        CharacterRow,
        r#"INSERT INTO characters (campaign_id, owner_id, game_system_id, name, portrait_asset_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *"#,
        campaign_id,
        owner_id,
        game_system_id,
        name,
        portrait_asset_id,
    )
    .fetch_one(pool)
    .await
}

pub async fn find_by_id(pool: &PgPool, id: &Uuid) -> Result<Option<CharacterRow>, sqlx::Error> {
    sqlx::query_as!(CharacterRow, "SELECT * FROM characters WHERE id = $1", id)
        .fetch_optional(pool)
        .await
}

pub async fn list_for_campaign(
    pool: &PgPool,
    campaign_id: &Uuid,
) -> Result<Vec<CharacterRow>, sqlx::Error> {
    sqlx::query_as!(
        CharacterRow,
        "SELECT * FROM characters WHERE campaign_id = $1 ORDER BY created_at ASC",
        campaign_id
    )
    .fetch_all(pool)
    .await
}

pub async fn update_character(
    pool: &PgPool,
    id: &Uuid,
    name: Option<&str>,
    portrait_asset_id: Option<Option<&Uuid>>,
    visible_to_players: Option<bool>,
) -> Result<Option<CharacterRow>, sqlx::Error> {
    sqlx::query_as!(
        CharacterRow,
        r#"UPDATE characters SET
            name = COALESCE($2, name),
            portrait_asset_id = CASE WHEN $3 THEN $4 ELSE portrait_asset_id END,
            visible_to_players = COALESCE($5, visible_to_players),
            updated_at = now()
        WHERE id = $1
        RETURNING *"#,
        id,
        name,
        portrait_asset_id.is_some(),
        portrait_asset_id.flatten(),
        visible_to_players,
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_character(pool: &PgPool, id: &Uuid) -> Result<bool, sqlx::Error> {
    let result: sqlx::postgres::PgQueryResult =
        sqlx::query!("DELETE FROM characters WHERE id = $1", id)
            .execute(pool)
            .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn get_character_auth_info(
    pool: &PgPool,
    character_id: &Uuid,
) -> Result<Option<(Uuid, Uuid)>, sqlx::Error> {
    let row = sqlx::query!(
        "SELECT campaign_id, owner_id FROM characters WHERE id = $1",
        character_id
    )
    .fetch_optional(pool)
    .await?
    .map(|r| (r.campaign_id, r.owner_id));
    Ok(row)
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
    async fn test_create_and_find_character(pool: PgPool) {
        let (campaign_id, owner_id) = setup_campaign(&pool).await;

        let character = create_character(&pool, &campaign_id, &owner_id, "dnd5e", "Gandalf", None)
            .await
            .unwrap();

        assert_eq!(character.name, "Gandalf");
        assert_eq!(character.campaign_id, campaign_id);
        assert_eq!(character.owner_id, owner_id);
        assert_eq!(character.game_system_id, "dnd5e");
        assert!(character.visible_to_players);
        assert!(character.portrait_asset_id.is_none());

        let found = find_by_id(&pool, &character.id).await.unwrap().unwrap();
        assert_eq!(found.id, character.id);
        assert_eq!(found.name, "Gandalf");
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_list_for_campaign(pool: PgPool) {
        let (campaign_id, owner_id) = setup_campaign(&pool).await;

        create_character(&pool, &campaign_id, &owner_id, "dnd5e", "Fighter", None)
            .await
            .unwrap();
        create_character(&pool, &campaign_id, &owner_id, "dnd5e", "Wizard", None)
            .await
            .unwrap();

        let list = list_for_campaign(&pool, &campaign_id).await.unwrap();
        assert_eq!(list.len(), 2);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_update_character(pool: PgPool) {
        let (campaign_id, owner_id) = setup_campaign(&pool).await;

        let character = create_character(&pool, &campaign_id, &owner_id, "dnd5e", "OldName", None)
            .await
            .unwrap();

        let updated = update_character(&pool, &character.id, Some("NewName"), None, Some(false))
            .await
            .unwrap()
            .unwrap();

        assert_eq!(updated.name, "NewName");
        assert!(!updated.visible_to_players);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_delete_character(pool: PgPool) {
        let (campaign_id, owner_id) = setup_campaign(&pool).await;

        let character = create_character(&pool, &campaign_id, &owner_id, "dnd5e", "Doomed", None)
            .await
            .unwrap();

        let deleted = delete_character(&pool, &character.id).await.unwrap();
        assert!(deleted);

        let not_found = find_by_id(&pool, &character.id).await.unwrap();
        assert!(not_found.is_none());
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_get_character_auth_info(pool: PgPool) {
        let (campaign_id, owner_id) = setup_campaign(&pool).await;

        let character = create_character(&pool, &campaign_id, &owner_id, "dnd5e", "Hero", None)
            .await
            .unwrap();

        let auth = get_character_auth_info(&pool, &character.id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(auth.0, campaign_id);
        assert_eq!(auth.1, owner_id);
    }
}
