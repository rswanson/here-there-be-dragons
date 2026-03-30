use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub struct EncounterRow {
    pub id: Uuid,
    pub campaign_id: Uuid,
    pub active: bool,
    pub current_turn_index: i32,
    pub round_number: i32,
    pub created_at: DateTime<Utc>,
}

pub struct CombatantRow {
    pub id: Uuid,
    pub encounter_id: Uuid,
    pub character_id: Option<Uuid>,
    pub name: String,
    pub initiative_value: i32,
    pub sort_order: i32,
    pub is_active: bool,
}

pub async fn create_encounter(
    pool: &PgPool,
    campaign_id: &Uuid,
) -> Result<EncounterRow, sqlx::Error> {
    sqlx::query_as!(
        EncounterRow,
        r#"INSERT INTO initiative_encounters (campaign_id)
           VALUES ($1)
           RETURNING *"#,
        campaign_id,
    )
    .fetch_one(pool)
    .await
}

pub async fn get_active_encounter(
    pool: &PgPool,
    campaign_id: &Uuid,
) -> Result<Option<EncounterRow>, sqlx::Error> {
    sqlx::query_as!(
        EncounterRow,
        "SELECT * FROM initiative_encounters WHERE campaign_id = $1 AND active = true",
        campaign_id,
    )
    .fetch_optional(pool)
    .await
}

pub async fn deactivate_encounter(pool: &PgPool, encounter_id: &Uuid) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE initiative_encounters SET active = false WHERE id = $1",
        encounter_id,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_encounter_turn(
    pool: &PgPool,
    encounter_id: &Uuid,
    current_turn_index: i32,
    round_number: i32,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE initiative_encounters SET current_turn_index = $2, round_number = $3 WHERE id = $1",
        encounter_id,
        current_turn_index,
        round_number,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn add_combatant(
    pool: &PgPool,
    encounter_id: &Uuid,
    character_id: Option<&Uuid>,
    name: &str,
    initiative_value: i32,
    sort_order: i32,
) -> Result<CombatantRow, sqlx::Error> {
    sqlx::query_as!(
        CombatantRow,
        r#"INSERT INTO initiative_combatants (encounter_id, character_id, name, initiative_value, sort_order)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *"#,
        encounter_id,
        character_id,
        name,
        initiative_value,
        sort_order,
    )
    .fetch_one(pool)
    .await
}

pub async fn list_combatants(
    pool: &PgPool,
    encounter_id: &Uuid,
) -> Result<Vec<CombatantRow>, sqlx::Error> {
    sqlx::query_as!(
        CombatantRow,
        "SELECT * FROM initiative_combatants WHERE encounter_id = $1 ORDER BY sort_order ASC",
        encounter_id,
    )
    .fetch_all(pool)
    .await
}

pub async fn update_combatant_initiative(
    pool: &PgPool,
    combatant_id: &Uuid,
    initiative_value: i32,
    sort_order: i32,
) -> Result<Option<CombatantRow>, sqlx::Error> {
    sqlx::query_as!(
        CombatantRow,
        r#"UPDATE initiative_combatants SET initiative_value = $2, sort_order = $3
           WHERE id = $1
           RETURNING *"#,
        combatant_id,
        initiative_value,
        sort_order,
    )
    .fetch_optional(pool)
    .await
}

pub async fn remove_combatant(pool: &PgPool, combatant_id: &Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        "DELETE FROM initiative_combatants WHERE id = $1",
        combatant_id,
    )
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn get_combatant_encounter_id(
    pool: &PgPool,
    combatant_id: &Uuid,
) -> Result<Option<Uuid>, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT encounter_id FROM initiative_combatants WHERE id = $1",
        combatant_id,
    )
    .fetch_optional(pool)
    .await
}

pub async fn find_combatant_by_id(
    pool: &PgPool,
    combatant_id: &Uuid,
) -> Result<Option<CombatantRow>, sqlx::Error> {
    sqlx::query_as!(
        CombatantRow,
        "SELECT * FROM initiative_combatants WHERE id = $1",
        combatant_id,
    )
    .fetch_optional(pool)
    .await
}

pub fn rows_to_encounter(
    row: EncounterRow,
    combatants: Vec<CombatantRow>,
) -> htbd_core::initiative::Encounter {
    htbd_core::initiative::Encounter {
        id: row.id,
        campaign_id: row.campaign_id,
        active: row.active,
        current_turn_index: row.current_turn_index,
        round_number: row.round_number,
        combatants: combatants.into_iter().map(row_to_combatant).collect(),
        created_at: row.created_at,
    }
}

pub fn row_to_combatant(row: CombatantRow) -> htbd_core::initiative::Combatant {
    htbd_core::initiative::Combatant {
        id: row.id,
        encounter_id: row.encounter_id,
        character_id: row.character_id,
        name: row.name,
        initiative_value: row.initiative_value,
        sort_order: row.sort_order,
        is_active: row.is_active,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;

    async fn setup_campaign(pool: &PgPool) -> Uuid {
        let user = crate::users::create_user(pool, "dm@test.com", "hash", "DM")
            .await
            .unwrap();
        let campaign = crate::campaigns::create_campaign(pool, "Test Campaign", user.id, "dnd5e")
            .await
            .unwrap();
        campaign.id
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_encounter_lifecycle(pool: PgPool) {
        let campaign_id = setup_campaign(&pool).await;

        // No active encounter yet
        let none = get_active_encounter(&pool, &campaign_id).await.unwrap();
        assert!(none.is_none());

        // Create encounter
        let enc = create_encounter(&pool, &campaign_id).await.unwrap();
        assert_eq!(enc.campaign_id, campaign_id);
        assert!(enc.active);
        assert_eq!(enc.current_turn_index, 0);
        assert_eq!(enc.round_number, 1);

        // Active encounter found
        let active = get_active_encounter(&pool, &campaign_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(active.id, enc.id);

        // Update turn
        update_encounter_turn(&pool, &enc.id, 2, 3).await.unwrap();
        let updated = get_active_encounter(&pool, &campaign_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(updated.current_turn_index, 2);
        assert_eq!(updated.round_number, 3);

        // Deactivate
        deactivate_encounter(&pool, &enc.id).await.unwrap();
        let gone = get_active_encounter(&pool, &campaign_id).await.unwrap();
        assert!(gone.is_none());
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_combatant_crud(pool: PgPool) {
        let campaign_id = setup_campaign(&pool).await;
        let enc = create_encounter(&pool, &campaign_id).await.unwrap();

        // Add combatants
        let c1 = add_combatant(&pool, &enc.id, None, "Goblin", 14, 0)
            .await
            .unwrap();
        let c2 = add_combatant(&pool, &enc.id, None, "Hero", 18, 1)
            .await
            .unwrap();

        assert_eq!(c1.name, "Goblin");
        assert_eq!(c2.initiative_value, 18);

        // List combatants ordered by sort_order
        let list = list_combatants(&pool, &enc.id).await.unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].name, "Goblin");
        assert_eq!(list[1].name, "Hero");

        // Find by id
        let found = find_combatant_by_id(&pool, &c1.id).await.unwrap().unwrap();
        assert_eq!(found.name, "Goblin");

        // Get encounter_id for auth lookup
        let enc_id = get_combatant_encounter_id(&pool, &c1.id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(enc_id, enc.id);

        // Update initiative
        let updated = update_combatant_initiative(&pool, &c1.id, 5, 2)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(updated.initiative_value, 5);
        assert_eq!(updated.sort_order, 2);

        // Remove combatant
        let removed = remove_combatant(&pool, &c2.id).await.unwrap();
        assert!(removed);

        let remaining = list_combatants(&pool, &enc.id).await.unwrap();
        assert_eq!(remaining.len(), 1);
    }
}
