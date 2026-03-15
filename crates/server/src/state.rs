use asset_store::StorageBackend;
use sqlx::PgPool;
use std::sync::Arc;

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Config,
    pub storage: Arc<dyn StorageBackend>,
}
