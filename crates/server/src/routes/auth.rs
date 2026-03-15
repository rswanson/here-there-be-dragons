use axum::{
    Json, Router,
    extract::State,
    routing::{get, post},
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use chrono::{TimeDelta, Utc};

use crate::error::AppError;
use crate::middleware::auth::{AuthUser, create_access_token, generate_refresh_token, hash_token};
use crate::state::AppState;
use htbd_core::auth::{AuthResponse, LoginRequest, RegisterRequest};
use htbd_core::models::User;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/refresh", post(refresh))
        .route("/logout", post(logout))
        .route("/me", get(me))
}

async fn me(State(state): State<AppState>, auth: AuthUser) -> Result<Json<AuthResponse>, AppError> {
    let row = db::users::find_by_id(&state.pool, auth.user_id)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(AuthResponse {
        user: User::from(row),
    }))
}

async fn register(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(req): Json<RegisterRequest>,
) -> Result<(CookieJar, Json<AuthResponse>), AppError> {
    if req.email.is_empty() || !req.email.contains('@') {
        return Err(AppError::BadRequest("Invalid email".to_string()));
    }
    if req.password.len() < 8 {
        return Err(AppError::BadRequest(
            "Password must be at least 8 characters".to_string(),
        ));
    }
    if req.display_name.is_empty() {
        return Err(AppError::BadRequest("Display name required".to_string()));
    }

    if db::users::find_by_email(&state.pool, &req.email)
        .await?
        .is_some()
    {
        return Err(AppError::Conflict("Email already registered".to_string()));
    }

    let password_hash = argon2::hash_encoded(
        req.password.as_bytes(),
        &rand::random::<[u8; 16]>(),
        &argon2::Config::default(),
    )
    .map_err(|e| AppError::Internal(e.to_string()))?;

    let row =
        db::users::create_user(&state.pool, &req.email, &password_hash, &req.display_name).await?;

    let user = User::from(row);

    let jar = issue_tokens(&state, jar, user.id).await?;
    Ok((jar, Json(AuthResponse { user })))
}

async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(req): Json<LoginRequest>,
) -> Result<(CookieJar, Json<AuthResponse>), AppError> {
    let row = db::users::find_by_email(&state.pool, &req.email)
        .await?
        .ok_or(AppError::Unauthorized)?;

    let valid =
        argon2::verify_encoded(&row.password_hash, req.password.as_bytes()).unwrap_or(false);

    if !valid {
        return Err(AppError::Unauthorized);
    }

    let user = User::from(row);

    let jar = issue_tokens(&state, jar, user.id).await?;
    Ok((jar, Json(AuthResponse { user })))
}

async fn refresh(State(state): State<AppState>, jar: CookieJar) -> Result<CookieJar, AppError> {
    let refresh_token = jar
        .get("refresh_token")
        .map(|c| c.value().to_string())
        .ok_or(AppError::Unauthorized)?;

    let token_hash = hash_token(&refresh_token);
    let stored = db::refresh_tokens::find_by_hash(&state.pool, &token_hash)
        .await?
        .ok_or(AppError::Unauthorized)?;

    if stored.expires_at < Utc::now() {
        db::refresh_tokens::delete_token(&state.pool, stored.id).await?;
        return Err(AppError::Unauthorized);
    }

    db::refresh_tokens::delete_token(&state.pool, stored.id).await?;
    let jar = issue_tokens(&state, jar, stored.user_id).await?;
    Ok(jar)
}

async fn logout(State(state): State<AppState>, jar: CookieJar) -> Result<CookieJar, AppError> {
    if let Some(refresh_cookie) = jar.get("refresh_token") {
        let token_hash = hash_token(refresh_cookie.value());
        if let Some(stored) = db::refresh_tokens::find_by_hash(&state.pool, &token_hash).await? {
            db::refresh_tokens::delete_token(&state.pool, stored.id).await?;
        }
    }

    let jar = jar
        .remove(Cookie::from("access_token"))
        .remove(Cookie::from("refresh_token"));

    Ok(jar)
}

async fn issue_tokens(
    state: &AppState,
    jar: CookieJar,
    user_id: uuid::Uuid,
) -> Result<CookieJar, AppError> {
    let access_token = create_access_token(&state.config.jwt_secret, user_id)?;

    let refresh_token = generate_refresh_token();
    let token_hash = hash_token(&refresh_token);
    let expires_at = Utc::now() + TimeDelta::days(7);

    db::refresh_tokens::create_refresh_token(&state.pool, user_id, &token_hash, expires_at).await?;

    let access_cookie = Cookie::build(("access_token", access_token))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(time::Duration::minutes(15));

    let refresh_cookie = Cookie::build(("refresh_token", refresh_token))
        .path("/api/auth")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(time::Duration::days(7));

    Ok(jar.add(access_cookie).add(refresh_cookie))
}
