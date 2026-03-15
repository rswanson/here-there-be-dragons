use axum::{
    extract::{Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use uuid::Uuid;

use htbd_core::models::Asset;
use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/campaigns/{campaign_id}", post(upload_asset).get(list_assets))
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
    let role = db::campaigns::get_member_role(&state.pool, campaign_id, auth.user_id)
        .await?
        .ok_or(AppError::Forbidden)?;
    if role != "dm" {
        return Err(AppError::Forbidden);
    }

    let field = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
        .ok_or_else(|| AppError::BadRequest("No file provided".to_string()))?;

    let filename = field.file_name()
        .unwrap_or("unknown")
        .to_string();
    let content_type = field.content_type()
        .unwrap_or("application/octet-stream")
        .to_string();

    if !ALLOWED_CONTENT_TYPES.contains(&content_type.as_str()) {
        return Err(AppError::BadRequest(format!("Unsupported file type: {content_type}")));
    }

    let data = field.bytes()
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

    let asset = Asset {
        id: row.id,
        campaign_id: row.campaign_id,
        uploaded_by: row.uploaded_by,
        filename: row.filename,
        content_type: row.content_type,
        size_bytes: row.size_bytes,
        created_at: row.created_at,
    };

    Ok((StatusCode::CREATED, Json(asset)))
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
    db::campaigns::get_member_role(&state.pool, campaign_id, auth.user_id)
        .await?
        .ok_or(AppError::Forbidden)?;

    let rows = db::assets::list_for_campaign(
        &state.pool,
        campaign_id,
        query.content_type.as_deref(),
        query.limit.unwrap_or(50),
        query.offset.unwrap_or(0),
    )
    .await?;

    let assets = rows.into_iter().map(|r| Asset {
        id: r.id,
        campaign_id: r.campaign_id,
        uploaded_by: r.uploaded_by,
        filename: r.filename,
        content_type: r.content_type,
        size_bytes: r.size_bytes,
        created_at: r.created_at,
    }).collect();

    Ok(Json(assets))
}

async fn serve_asset(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let row = db::assets::find_by_id(&state.pool, id)
        .await?
        .ok_or(AppError::NotFound)?;

    db::campaigns::get_member_role(&state.pool, row.campaign_id, auth.user_id)
        .await?
        .ok_or(AppError::Forbidden)?;

    let data = state.storage.retrieve(&row.storage_path).await?;

    Ok((
        [
            (header::CONTENT_TYPE, row.content_type),
            (header::CONTENT_DISPOSITION, format!("inline; filename=\"{}\"", row.filename)),
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

    let role = db::campaigns::get_member_role(&state.pool, row.campaign_id, auth.user_id)
        .await?
        .ok_or(AppError::Forbidden)?;
    if role != "dm" {
        return Err(AppError::Forbidden);
    }

    state.storage.delete(&row.storage_path).await?;
    db::assets::delete_asset(&state.pool, id).await?;

    Ok(StatusCode::NO_CONTENT)
}
