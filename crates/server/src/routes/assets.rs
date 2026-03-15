use axum::{
    Json, Router,
    extract::{Multipart, Path, Query, State},
    http::{StatusCode, header},
    response::IntoResponse,
    routing::{get, post},
};
use serde::Deserialize;
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::models::Asset;

use super::guards::{require_dm, require_member};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/campaigns/{campaign_id}",
            post(upload_asset).get(list_assets),
        )
        .route("/{id}", get(serve_asset).delete(delete_asset))
}

const ALLOWED_CONTENT_TYPES: &[&str] = &[
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/svg+xml",
    "application/pdf",
];

async fn upload_asset(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(campaign_id): Path<Uuid>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<Asset>), AppError> {
    require_dm(&state, campaign_id, auth.user_id).await?;

    let field = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
        .ok_or_else(|| AppError::BadRequest("No file provided".to_string()))?;

    let filename = field.file_name().unwrap_or("unknown").to_string();
    let content_type = field
        .content_type()
        .unwrap_or("application/octet-stream")
        .to_string();

    if !ALLOWED_CONTENT_TYPES.contains(&content_type.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Unsupported file type: {content_type}"
        )));
    }

    let data = field
        .bytes()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    if data.len() > state.config.max_upload_bytes() {
        return Err(AppError::BadRequest(format!(
            "File too large (max {}MB)",
            state.config.max_upload_size_mb
        )));
    }

    let asset_id = Uuid::new_v4();
    let storage_path = format!("{campaign_id}/{asset_id}/{filename}");
    state.storage.store(&storage_path, &data).await?;

    let row = db::assets::create_asset(
        &state.pool,
        campaign_id,
        auth.user_id,
        &filename,
        &content_type,
        &storage_path,
        data.len() as i64,
    )
    .await?;

    Ok((StatusCode::CREATED, Json(Asset::from(row))))
}

#[derive(Deserialize)]
struct ListAssetsQuery {
    content_type: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

async fn list_assets(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(campaign_id): Path<Uuid>,
    Query(query): Query<ListAssetsQuery>,
) -> Result<Json<Vec<Asset>>, AppError> {
    require_member(&state, campaign_id, auth.user_id).await?;

    let rows = db::assets::list_for_campaign(
        &state.pool,
        campaign_id,
        query.content_type.as_deref(),
        query.limit.unwrap_or(50),
        query.offset.unwrap_or(0),
    )
    .await?;

    Ok(Json(rows.into_iter().map(Asset::from).collect()))
}

async fn serve_asset(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let row = db::assets::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;

    require_member(&state, row.campaign_id, auth.user_id).await?;

    let data = state.storage.retrieve(&row.storage_path).await?;

    Ok((
        [
            (header::CONTENT_TYPE, row.content_type),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{}\"", row.filename),
            ),
        ],
        data,
    ))
}

async fn delete_asset(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let row = db::assets::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;

    require_dm(&state, row.campaign_id, auth.user_id).await?;

    state.storage.delete(&row.storage_path).await?;
    db::assets::delete_asset(&state.pool, id).await?;

    Ok(StatusCode::NO_CONTENT)
}
