pub mod stub;

use htbd_core::game_system::{GameSystem, GameSystemInfo};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Clone)]
pub struct GameSystemRegistry {
    systems: HashMap<String, Arc<dyn GameSystem>>,
}

impl GameSystemRegistry {
    pub fn new() -> Self {
        Self {
            systems: HashMap::new(),
        }
    }

    pub fn register(&mut self, system: Arc<dyn GameSystem>) {
        self.systems.insert(system.id().to_string(), system);
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn GameSystem>> {
        self.systems.get(id).cloned()
    }

    pub fn list(&self) -> Vec<GameSystemInfo> {
        self.systems.values().map(|s| s.info()).collect()
    }

    pub fn default_registry() -> Self {
        let mut registry = Self::new();
        registry.register(Arc::new(stub::StubGameSystem));
        registry
    }
}

impl Default for GameSystemRegistry {
    fn default() -> Self {
        Self::new()
    }
}
