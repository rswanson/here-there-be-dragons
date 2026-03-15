use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub asset_storage_path: PathBuf,
    pub bind_address: String,
    pub max_upload_size_mb: usize,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: std::env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            jwt_secret: std::env::var("JWT_SECRET").expect("JWT_SECRET must be set"),
            asset_storage_path: PathBuf::from(
                std::env::var("ASSET_STORAGE_PATH").unwrap_or_else(|_| "./data/assets".to_string()),
            ),
            bind_address: std::env::var("BIND_ADDRESS")
                .unwrap_or_else(|_| "0.0.0.0:3000".to_string()),
            max_upload_size_mb: std::env::var("MAX_UPLOAD_SIZE_MB")
                .unwrap_or_else(|_| "25".to_string())
                .parse()
                .expect("MAX_UPLOAD_SIZE_MB must be a number"),
        }
    }

    pub fn max_upload_bytes(&self) -> usize {
        self.max_upload_size_mb * 1024 * 1024
    }
}
