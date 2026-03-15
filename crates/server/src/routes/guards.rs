use uuid::Uuid;

use crate::error::AppError;
use crate::state::AppState;
use htbd_core::models::CampaignRole;

pub async fn require_member(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
) -> Result<CampaignRole, AppError> {
    let role_str = db::campaigns::get_member_role(&state.pool, campaign_id, user_id)
        .await?
        .ok_or(AppError::Forbidden)?;
    role_str.parse().map_err(|_| AppError::Forbidden)
}

pub async fn require_dm(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    let role = require_member(state, campaign_id, user_id).await?;
    if role != CampaignRole::Dm {
        return Err(AppError::Forbidden);
    }
    Ok(())
}
