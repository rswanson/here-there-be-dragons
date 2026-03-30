pub mod assets;
pub mod campaigns;
pub mod character_bonuses;
pub mod character_fields;
pub mod characters;
pub mod drawings;
pub mod map_images;
pub mod map_layers;
pub mod maps;
pub mod refresh_tokens;
pub mod tokens;
pub mod users;

use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;

pub async fn create_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(20)
        .connect(database_url)
        .await
}

pub async fn run_migrations(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("../../migrations").run(pool).await
}
