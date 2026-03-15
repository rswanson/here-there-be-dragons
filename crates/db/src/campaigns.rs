use sqlx::PgPool;
use uuid::Uuid;

pub struct CampaignRow {
    pub id: Uuid,
    pub name: String,
    pub owner_id: Uuid,
    pub invite_code: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

pub struct CampaignMemberRow {
    pub campaign_id: Uuid,
    pub user_id: Uuid,
    pub role: String,
    pub joined_at: chrono::DateTime<chrono::Utc>,
    pub display_name: String,
}

pub async fn create_campaign(
    pool: &PgPool,
    name: &str,
    owner_id: Uuid,
    invite_code: &str,
) -> Result<CampaignRow, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let campaign = sqlx::query_as!(
        CampaignRow,
        r#"
        INSERT INTO campaigns (name, owner_id, invite_code)
        VALUES ($1, $2, $3)
        RETURNING id, name, owner_id, invite_code, created_at, updated_at
        "#,
        name,
        owner_id,
        invite_code,
    )
    .fetch_one(&mut *tx)
    .await?;

    // Auto-add owner as DM
    sqlx::query!(
        "INSERT INTO campaign_members (campaign_id, user_id, role) VALUES ($1, $2, 'dm')",
        campaign.id,
        owner_id,
    )
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(campaign)
}

pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<CampaignRow>, sqlx::Error> {
    sqlx::query_as!(
        CampaignRow,
        "SELECT id, name, owner_id, invite_code, created_at, updated_at FROM campaigns WHERE id = $1",
        id,
    )
    .fetch_optional(pool)
    .await
}

pub async fn find_by_invite_code(
    pool: &PgPool,
    invite_code: &str,
) -> Result<Option<CampaignRow>, sqlx::Error> {
    sqlx::query_as!(
        CampaignRow,
        "SELECT id, name, owner_id, invite_code, created_at, updated_at FROM campaigns WHERE invite_code = $1",
        invite_code,
    )
    .fetch_optional(pool)
    .await
}

pub async fn list_for_user(pool: &PgPool, user_id: Uuid) -> Result<Vec<CampaignRow>, sqlx::Error> {
    sqlx::query_as!(
        CampaignRow,
        r#"
        SELECT c.id, c.name, c.owner_id, c.invite_code, c.created_at, c.updated_at
        FROM campaigns c
        JOIN campaign_members cm ON c.id = cm.campaign_id
        WHERE cm.user_id = $1
        ORDER BY c.updated_at DESC
        "#,
        user_id,
    )
    .fetch_all(pool)
    .await
}

pub async fn add_member(
    pool: &PgPool,
    campaign_id: Uuid,
    user_id: Uuid,
    role: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO campaign_members (campaign_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        campaign_id,
        user_id,
        role,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn remove_member(
    pool: &PgPool,
    campaign_id: Uuid,
    user_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM campaign_members WHERE campaign_id = $1 AND user_id = $2 AND role != 'dm'",
        campaign_id,
        user_id,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_member_role(
    pool: &PgPool,
    campaign_id: Uuid,
    user_id: Uuid,
) -> Result<Option<String>, sqlx::Error> {
    let row = sqlx::query_scalar!(
        "SELECT role FROM campaign_members WHERE campaign_id = $1 AND user_id = $2",
        campaign_id,
        user_id,
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn list_members(
    pool: &PgPool,
    campaign_id: Uuid,
) -> Result<Vec<CampaignMemberRow>, sqlx::Error> {
    sqlx::query_as!(
        CampaignMemberRow,
        r#"
        SELECT cm.campaign_id, cm.user_id, cm.role, cm.joined_at, u.display_name
        FROM campaign_members cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.campaign_id = $1
        ORDER BY cm.joined_at
        "#,
        campaign_id,
    )
    .fetch_all(pool)
    .await
}
