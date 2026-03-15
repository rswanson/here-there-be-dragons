use crate::{StorageBackend, StorageError};
use std::path::PathBuf;

pub struct LocalStorage {
    base_path: PathBuf,
}

impl LocalStorage {
    pub fn new(base_path: PathBuf) -> Self {
        Self { base_path }
    }

    fn full_path(&self, path: &str) -> PathBuf {
        self.base_path.join(path)
    }
}

#[async_trait::async_trait]
impl StorageBackend for LocalStorage {
    async fn store(&self, path: &str, data: &[u8]) -> Result<(), StorageError> {
        let full_path = self.full_path(path);
        if let Some(parent) = full_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(&full_path, data).await?;
        Ok(())
    }

    async fn retrieve(&self, path: &str) -> Result<Vec<u8>, StorageError> {
        let full_path = self.full_path(path);
        if !full_path.exists() {
            return Err(StorageError::NotFound(path.to_string()));
        }
        Ok(tokio::fs::read(&full_path).await?)
    }

    async fn delete(&self, path: &str) -> Result<(), StorageError> {
        let full_path = self.full_path(path);
        if full_path.exists() {
            tokio::fs::remove_file(&full_path).await?;
        }
        Ok(())
    }

    async fn exists(&self, path: &str) -> Result<bool, StorageError> {
        Ok(self.full_path(path).exists())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_store_and_retrieve() {
        let dir = TempDir::new().unwrap();
        let storage = LocalStorage::new(dir.path().to_path_buf());

        storage.store("test/file.txt", b"hello world").await.unwrap();
        let data = storage.retrieve("test/file.txt").await.unwrap();
        assert_eq!(data, b"hello world");
    }

    #[tokio::test]
    async fn test_delete() {
        let dir = TempDir::new().unwrap();
        let storage = LocalStorage::new(dir.path().to_path_buf());

        storage.store("file.txt", b"data").await.unwrap();
        assert!(storage.exists("file.txt").await.unwrap());

        storage.delete("file.txt").await.unwrap();
        assert!(!storage.exists("file.txt").await.unwrap());
    }

    #[tokio::test]
    async fn test_retrieve_not_found() {
        let dir = TempDir::new().unwrap();
        let storage = LocalStorage::new(dir.path().to_path_buf());

        let result = storage.retrieve("nonexistent.txt").await;
        assert!(matches!(result, Err(StorageError::NotFound(_))));
    }
}
