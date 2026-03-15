pub mod local;

use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Asset not found: {0}")]
    NotFound(String),
}

#[async_trait::async_trait]
pub trait StorageBackend: Send + Sync {
    async fn store(&self, path: &str, data: &[u8]) -> Result<(), StorageError>;
    async fn retrieve(&self, path: &str) -> Result<Vec<u8>, StorageError>;
    async fn delete(&self, path: &str) -> Result<(), StorageError>;
    async fn exists(&self, path: &str) -> Result<bool, StorageError>;
}

/// Create the configured storage backend based on environment.
/// For now, always returns LocalStorage. S3 support added later.
pub fn create_storage(base_path: PathBuf) -> Box<dyn StorageBackend> {
    Box::new(local::LocalStorage::new(base_path))
}
