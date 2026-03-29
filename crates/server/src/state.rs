use asset_store::StorageBackend;
use sqlx::PgPool;
use std::sync::Arc;

use crate::config::Config;
use crate::session::SessionManager;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Config,
    pub storage: Arc<dyn StorageBackend>,
    pub session_manager: Arc<SessionManager>,
}
