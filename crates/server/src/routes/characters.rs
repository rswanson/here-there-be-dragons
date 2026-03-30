use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use chrono::Utc;
use std::collections::HashMap;
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::character::*;
use htbd_core::models::CampaignRole;

use super::guards::{require_character_owner_or_dm, require_member};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/campaigns/{campaign_id}/characters",
            post(create_character).get(list_characters),
        )
        .route(
            "/characters/{id}",
            get(get_character)
                .put(update_character)
                .delete(delete_character),
        )
        .route("/characters/{id}/export", post(export_character))
        .route(
            "/campaigns/{campaign_id}/characters/import",
            post(import_character),
        )
}

async fn assemble_character(
    pool: &sqlx::PgPool,
    row: db::characters::CharacterRow,
) -> Result<Character, AppError> {
    let field_rows = db::character_fields::get_all_fields(pool, &row.id).await?;
    let fields = db::character_fields::rows_to_map(field_rows);
    let bonus_rows = db::character_bonuses::list_for_character(pool, &row.id).await?;
    let bonuses = db::character_bonuses::rows_to_bonus_map(bonus_rows);
    Ok(Character {
        id: row.id,
        campaign_id: row.campaign_id,
        owner_id: row.owner_id,
        game_system_id: row.game_system_id,
        name: row.name,
        portrait_asset_id: row.portrait_asset_id,
        visible_to_players: row.visible_to_players,
        fields,
        bonuses,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

async fn create_character(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(campaign_id): Path<Uuid>,
    Json(req): Json<CreateCharacterRequest>,
) -> Result<(StatusCode, Json<Character>), AppError> {
    require_member(&state, campaign_id, auth.user_id).await?;

    if req.name.is_empty() {
        return Err(AppError::BadRequest("Character name required".to_string()));
    }

    let system = state
        .game_systems
        .get(&req.game_system_id)
        .ok_or_else(|| AppError::BadRequest("Unknown game system".to_string()))?;

    let row = db::characters::create_character(
        &state.pool,
        &campaign_id,
        &auth.user_id,
        &req.game_system_id,
        &req.name,
        req.portrait_asset_id.as_ref(),
    )
    .await?;

    // Insert default fields from the game system
    let default_fields = system.default_fields();
    if !default_fields.is_empty() {
        db::character_fields::upsert_fields(&state.pool, &row.id, &default_fields).await?;
    }

    // Compute derived fields with empty bonuses and persist them
    let empty_bonuses: HashMap<String, Vec<htbd_core::game_system::BonusEntry>> = HashMap::new();
    let derived = system.compute_derived(&default_fields, &empty_bonuses);
    if !derived.is_empty() {
        db::character_fields::upsert_fields(&state.pool, &row.id, &derived).await?;
    }

    let character = assemble_character(&state.pool, row).await?;
    Ok((StatusCode::CREATED, Json(character)))
}

async fn list_characters(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(campaign_id): Path<Uuid>,
) -> Result<Json<Vec<Character>>, AppError> {
    let role = require_member(&state, campaign_id, auth.user_id).await?;

    let rows = db::characters::list_for_campaign(&state.pool, &campaign_id).await?;

    let mut characters = Vec::new();
    for row in rows {
        // DMs see all; players see visible chars + their own
        if role == CampaignRole::Dm || row.visible_to_players || row.owner_id == auth.user_id {
            let character = assemble_character(&state.pool, row).await?;
            characters.push(character);
        }
    }

    Ok(Json(characters))
}

async fn get_character(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Character>, AppError> {
    let row = db::characters::find_by_id(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;

    let role = require_member(&state, row.campaign_id, auth.user_id).await?;

    // Visibility check: DM sees all, owner sees own, others see if visible_to_players
    if role != CampaignRole::Dm && row.owner_id != auth.user_id && !row.visible_to_players {
        return Err(AppError::Forbidden);
    }

    let character = assemble_character(&state.pool, row).await?;
    Ok(Json(character))
}

async fn update_character(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateCharacterRequest>,
) -> Result<Json<Character>, AppError> {
    require_character_owner_or_dm(&state, &id, auth.user_id).await?;

    // portrait_asset_id: Option<Option<&Uuid>>
    // outer Some = "set/clear it", None = "don't change"
    // inner Some(&uuid) = "set to this uuid", inner None = "clear it"
    let portrait_ref: Option<Option<Uuid>> = req.portrait_asset_id;
    let portrait_arg: Option<Option<&Uuid>> = portrait_ref.as_ref().map(|o| o.as_ref());

    let updated_row = db::characters::update_character(
        &state.pool,
        &id,
        req.name.as_deref(),
        portrait_arg,
        req.visible_to_players,
    )
    .await?
    .ok_or(AppError::NotFound)?;

    let character = assemble_character(&state.pool, updated_row).await?;
    Ok(Json(character))
}

async fn delete_character(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    require_character_owner_or_dm(&state, &id, auth.user_id).await?;

    db::characters::delete_character(&state.pool, &id).await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn export_character(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let (_, _) = require_character_owner_or_dm(&state, &id, auth.user_id).await?;

    let row = db::characters::find_by_id(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;

    let system = state
        .game_systems
        .get(&row.game_system_id)
        .ok_or(AppError::NotFound)?;

    let field_rows = db::character_fields::get_all_fields(&state.pool, &id).await?;
    let fields = db::character_fields::rows_to_map(field_rows);
    let bonus_rows = db::character_bonuses::list_for_character(&state.pool, &id).await?;
    let bonuses = db::character_bonuses::rows_to_bonus_map(bonus_rows);

    let mut export = system.export_character(&fields, &bonuses);

    // Add name and exported_at to the JSON
    if let Some(obj) = export.as_object_mut() {
        obj.insert("name".to_string(), serde_json::Value::String(row.name));
        obj.insert(
            "exported_at".to_string(),
            serde_json::Value::String(Utc::now().to_rfc3339()),
        );
    }

    Ok(Json(export))
}

async fn import_character(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(campaign_id): Path<Uuid>,
    Json(body): Json<serde_json::Value>,
) -> Result<(StatusCode, Json<Character>), AppError> {
    require_member(&state, campaign_id, auth.user_id).await?;

    let game_system_id = body
        .get("game_system_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("game_system_id required".to_string()))?
        .to_string();

    let name = body
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("name required".to_string()))?
        .to_string();

    if name.is_empty() {
        return Err(AppError::BadRequest("Character name required".to_string()));
    }

    let system = state
        .game_systems
        .get(&game_system_id)
        .ok_or_else(|| AppError::BadRequest("Unknown game system".to_string()))?;

    let (fields, bonuses) = system
        .import_character(&body)
        .map_err(|e| AppError::BadRequest(format!("Import failed: {e}")))?;

    let row = db::characters::create_character(
        &state.pool,
        &campaign_id,
        &auth.user_id,
        &game_system_id,
        &name,
        None,
    )
    .await?;

    // Upsert fields
    if !fields.is_empty() {
        db::character_fields::upsert_fields(&state.pool, &row.id, &fields).await?;
    }

    // Add bonuses
    for (field_id, bonus_list) in &bonuses {
        for bonus in bonus_list {
            db::character_bonuses::add_bonus(
                &state.pool,
                &row.id,
                field_id,
                &bonus.source,
                &bonus.bonus_type,
                bonus.value as i32,
            )
            .await?;
        }
    }

    // Compute derived fields and persist them
    let field_rows = db::character_fields::get_all_fields(&state.pool, &row.id).await?;
    let current_fields = db::character_fields::rows_to_map(field_rows);
    let bonus_rows = db::character_bonuses::list_for_character(&state.pool, &row.id).await?;
    let current_bonuses = db::character_bonuses::rows_to_bonus_map(bonus_rows);
    let derived = system.compute_derived(&current_fields, &current_bonuses);
    if !derived.is_empty() {
        db::character_fields::upsert_fields(&state.pool, &row.id, &derived).await?;
    }

    let character = assemble_character(&state.pool, row).await?;
    Ok((StatusCode::CREATED, Json(character)))
}
