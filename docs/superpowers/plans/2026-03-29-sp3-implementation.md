# SP-3: Game System Plugin Architecture — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the game-system-agnostic plugin architecture: `GameSystem` trait, character sheet schema, bonus stacking system, character CRUD, real-time field updates, and a generic sheet renderer.

**Architecture:** The `GameSystem` trait lives in `htbd-core` (no I/O dependencies). A `GameSystemRegistry` in `server` holds compiled-in plugins. Characters are campaign-scoped with field values stored as individual rows (JSONB) and bonus entries in a dedicated table. The client uses a generic schema-driven renderer with layout hints. Field updates flow through WebSocket with server-authoritative derived field computation.

**Tech Stack:** Rust (htbd-core types, db queries, server routes), PostgreSQL (sqlx migrations), React + TypeScript (Zustand store, schema-driven renderer), Radix UI (Dialog, Tabs), WebSocket (field update broadcast).

---

## File Map

### Backend — New Files

| File | Responsibility |
|------|---------------|
| `crates/htbd-core/src/game_system.rs` | `GameSystem` trait, `SheetSchema`, `FieldDef`, `FieldType`, `SectionLayout`, `BonusEntry`, `BonusTypeDef`, related types |
| `crates/htbd-core/src/character.rs` | `Character`, `CreateCharacterRequest`, `UpdateCharacterRequest`, `CharacterFieldsUpdate`, `CharacterExport` types |
| `crates/db/src/characters.rs` | Character CRUD queries (sqlx) |
| `crates/db/src/character_fields.rs` | Field value read/write queries |
| `crates/db/src/character_bonuses.rs` | Bonus entry CRUD queries |
| `crates/server/src/game_system/mod.rs` | `GameSystemRegistry`, registration logic |
| `crates/server/src/game_system/stub.rs` | `StubGameSystem` implementing the trait |
| `crates/server/src/routes/characters.rs` | REST endpoints for character CRUD, import/export |
| `crates/server/src/routes/game_systems.rs` | REST endpoints for listing systems and fetching schemas |
| `migrations/005_characters.sql` | Characters, field values, bonuses tables, token FK |

### Backend — Modified Files

| File | Changes |
|------|---------|
| `crates/htbd-core/src/lib.rs` | Add `pub mod game_system; pub mod character;` + ts-rs exports |
| `crates/htbd-core/src/messages.rs` | Add character/bonus WebSocket message variants |
| `crates/db/src/lib.rs` | Add `pub mod characters; pub mod character_fields; pub mod character_bonuses;` |
| `crates/server/src/lib.rs` | Add `pub mod game_system;` |
| `crates/server/src/state.rs` | Add `GameSystemRegistry` to `AppState` |
| `crates/server/src/routes/mod.rs` | Mount character and game system routes |
| `crates/server/src/routes/ws.rs` | Handle character field update and bonus messages |
| `crates/server/src/routes/guards.rs` | Add `require_character_owner_or_dm` guard |

### Frontend — New Files

| File | Responsibility |
|------|---------------|
| `client/src/types/Character.ts` | Generated character types |
| `client/src/types/SheetSchema.ts` | Generated schema types |
| `client/src/types/BonusEntry.ts` | Generated bonus types |
| `client/src/types/GameSystemInfo.ts` | Generated system info type |
| `client/src/api/characters.ts` | REST client for character endpoints |
| `client/src/api/game-systems.ts` | REST client for game system endpoints |
| `client/src/state/characters.ts` | Zustand character store |
| `client/src/state/__tests__/characters.test.ts` | Character store unit tests |
| `client/src/components/CharacterSheet.tsx` | Top-level sheet component |
| `client/src/components/CharacterSheet/SheetSection.tsx` | Section layout switcher |
| `client/src/components/CharacterSheet/FieldWidget.tsx` | Field type → input component |
| `client/src/components/CharacterSheet/BonusStackedWidget.tsx` | Collapsible bonus breakdown |
| `client/src/components/CharacterSheet/AddBonusPopover.tsx` | Bonus entry creation form |
| `client/src/components/CharacterCreateDialog.tsx` | Character creation wizard dialog |
| `client/src/components/CharacterList.tsx` | Campaign character browser |

### Frontend — Modified Files

| File | Changes |
|------|---------|
| `client/src/api/dispatcher.ts` | Add character message handlers |
| `client/src/pages/Campaign.tsx` | Load characters, mount CharacterList + CharacterSheet panel |

---

## Task Breakdown

### Task 1: Database Migration

**Files:**
- Create: `migrations/005_characters.sql`

- [ ] **Step 1: Write the migration**

```sql
-- migrations/005_characters.sql

-- Character entity: campaign-scoped, owned by a user
CREATE TABLE characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id),
    game_system_id TEXT NOT NULL,
    name TEXT NOT NULL,
    portrait_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
    visible_to_players BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_characters_campaign ON characters(campaign_id);
CREATE INDEX idx_characters_owner ON characters(owner_id);

-- Field values: one row per field per character (JSONB for flexibility)
CREATE TABLE character_field_values (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    field_id TEXT NOT NULL,
    value JSONB NOT NULL,
    PRIMARY KEY (character_id, field_id)
);

-- Bonus entries: typed bonuses applied to bonus-stacked fields
CREATE TABLE character_bonuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    field_id TEXT NOT NULL,
    source TEXT NOT NULL,
    bonus_type TEXT NOT NULL,
    value INTEGER NOT NULL
);

CREATE INDEX idx_character_bonuses_char_field ON character_bonuses(character_id, field_id);

-- Link tokens to characters (optional)
ALTER TABLE tokens ADD COLUMN character_id UUID REFERENCES characters(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Apply the migration locally**

Run: `sqlx migrate run`
Expected: Migration 005 applies successfully.

- [ ] **Step 3: Regenerate sqlx offline data**

Run: `cargo sqlx prepare --workspace`
Expected: `.sqlx/` directory updated with new query metadata.

- [ ] **Step 4: Commit**

```bash
git add migrations/005_characters.sql .sqlx/
git commit -m "feat(db): add characters, field_values, and bonuses tables"
```

---

### Task 2: Core Types — GameSystem Trait & Schema

**Files:**
- Create: `crates/htbd-core/src/game_system.rs`
- Modify: `crates/htbd-core/src/lib.rs`

- [ ] **Step 1: Write the game system types**

Create `crates/htbd-core/src/game_system.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use ts_rs::TS;
use uuid::Uuid;

// ── Schema types (exported to TypeScript) ───────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SheetSchema {
    pub sections: Vec<SheetSection>,
    pub bonus_types: Vec<BonusTypeDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SheetSection {
    pub id: String,
    pub name: String,
    pub layout: SectionLayout,
    pub fields: Vec<FieldDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "type", content = "config")]
pub enum SectionLayout {
    Grid { columns: u8 },
    List,
    Table { columns: Vec<String> },
    Tabs { tabs: Vec<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct FieldDef {
    pub id: String,
    pub name: String,
    pub field_type: FieldType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_value: Option<serde_json::Value>,
    pub derived: bool,
    #[serde(default = "default_true")]
    pub visible: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    pub width_hint: WidthHint,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "type", content = "config")]
pub enum FieldType {
    Integer {
        min: Option<i64>,
        max: Option<i64>,
    },
    Text {
        max_length: Option<usize>,
    },
    LongText,
    Boolean,
    Choice {
        options: Vec<ChoiceOption>,
    },
    AbilityScore,
    StatBlock {
        label: String,
    },
    ResourcePool {
        max_field: Option<String>,
    },
    BonusStacked {
        base_expression: Option<String>,
        allowed_bonus_types: Vec<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ChoiceOption {
    pub value: String,
    pub label: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum WidthHint {
    Narrow,
    Normal,
    Wide,
    Full,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BonusTypeDef {
    pub id: String,
    pub name: String,
    pub stacks: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BonusEntry {
    pub id: Uuid,
    pub source: String,
    pub bonus_type: String,
    pub value: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GameSystemInfo {
    pub id: String,
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum FieldVisibility {
    Public,
    Private,
    DmOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenBarMapping {
    pub bar_index: usize,
    pub current_field: String,
    pub max_field: Option<String>,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatureSize {
    pub id: String,
    pub name: String,
    pub grid_size: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitiativeRules {
    pub roll_expression: String,
    pub tiebreaker_field: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ValidationError {
    pub field_id: String,
    pub message: String,
}

// ── Type aliases ────────────────────────────────────────────────────

pub type FieldValues = HashMap<String, serde_json::Value>;
pub type BonusMap = HashMap<String, Vec<BonusEntry>>;

// ── GameSystem trait ────────────────────────────────────────────────

pub trait GameSystem: Send + Sync {
    fn id(&self) -> &str;
    fn name(&self) -> &str;
    fn version(&self) -> &str;

    fn sheet_schema(&self) -> SheetSchema;
    fn compute_derived(&self, fields: &FieldValues, bonuses: &BonusMap) -> FieldValues;
    fn validate_fields(&self, fields: &FieldValues) -> Vec<ValidationError>;

    fn bonus_types(&self) -> Vec<BonusTypeDef>;
    fn apply_stacking(&self, field_id: &str, bonuses: &[BonusEntry]) -> i64;

    fn creature_sizes(&self) -> Vec<CreatureSize>;
    fn initiative_rules(&self) -> InitiativeRules;
    fn default_fields(&self) -> FieldValues;
    fn field_visibility(&self, field_id: &str) -> FieldVisibility;
    fn token_bar_mappings(&self) -> Vec<TokenBarMapping>;

    fn export_character(
        &self,
        fields: &FieldValues,
        bonuses: &BonusMap,
    ) -> serde_json::Value;
    fn import_character(
        &self,
        data: &serde_json::Value,
    ) -> Result<(FieldValues, BonusMap), String>;

    fn info(&self) -> GameSystemInfo {
        GameSystemInfo {
            id: self.id().to_string(),
            name: self.name().to_string(),
            version: self.version().to_string(),
        }
    }
}
```

- [ ] **Step 2: Add module to lib.rs**

Add to `crates/htbd-core/src/lib.rs` after the existing `pub mod token;` line:

```rust
pub mod game_system;
```

- [ ] **Step 3: Build to verify**

Run: `cargo build -p htbd-core`
Expected: Compiles successfully.

- [ ] **Step 4: Commit**

```bash
git add crates/htbd-core/src/game_system.rs crates/htbd-core/src/lib.rs
git commit -m "feat(core): add GameSystem trait, schema types, and bonus system"
```

---

### Task 3: Core Types — Character Model

**Files:**
- Create: `crates/htbd-core/src/character.rs`
- Modify: `crates/htbd-core/src/lib.rs`

- [ ] **Step 1: Write the character types**

Create `crates/htbd-core/src/character.rs`:

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use ts_rs::TS;
use uuid::Uuid;

use crate::game_system::BonusEntry;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Character {
    pub id: Uuid,
    pub campaign_id: Uuid,
    pub owner_id: Uuid,
    pub game_system_id: String,
    pub name: String,
    pub portrait_asset_id: Option<Uuid>,
    pub visible_to_players: bool,
    pub fields: HashMap<String, serde_json::Value>,
    pub bonuses: HashMap<String, Vec<BonusEntry>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CreateCharacterRequest {
    pub game_system_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub portrait_asset_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UpdateCharacterRequest {
    pub name: Option<String>,
    pub portrait_asset_id: Option<Option<Uuid>>,
    pub visible_to_players: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CharacterExport {
    pub format: String,
    pub game_system_id: String,
    pub game_system_version: String,
    pub name: String,
    pub fields: HashMap<String, serde_json::Value>,
    pub bonuses: HashMap<String, Vec<BonusEntry>>,
    pub exported_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AddBonusRequest {
    pub field_id: String,
    pub source: String,
    pub bonus_type: String,
    pub value: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UpdateBonusRequest {
    pub source: Option<String>,
    pub bonus_type: Option<String>,
    pub value: Option<i64>,
}
```

- [ ] **Step 2: Add module and ts-rs exports to lib.rs**

Add to `crates/htbd-core/src/lib.rs` after `pub mod game_system;`:

```rust
pub mod character;
```

Add to the `export_bindings()` test function in `lib.rs`, in the `#[cfg(test)]` block:

```rust
        // Game system
        game_system::SheetSchema::export_all(&cfg).unwrap();
        game_system::SheetSection::export_all(&cfg).unwrap();
        game_system::SectionLayout::export_all(&cfg).unwrap();
        game_system::FieldDef::export_all(&cfg).unwrap();
        game_system::FieldType::export_all(&cfg).unwrap();
        game_system::ChoiceOption::export_all(&cfg).unwrap();
        game_system::WidthHint::export_all(&cfg).unwrap();
        game_system::BonusTypeDef::export_all(&cfg).unwrap();
        game_system::BonusEntry::export_all(&cfg).unwrap();
        game_system::GameSystemInfo::export_all(&cfg).unwrap();
        game_system::FieldVisibility::export_all(&cfg).unwrap();

        // Character
        character::Character::export_all(&cfg).unwrap();
        character::CreateCharacterRequest::export_all(&cfg).unwrap();
        character::UpdateCharacterRequest::export_all(&cfg).unwrap();
        character::CharacterExport::export_all(&cfg).unwrap();
        character::AddBonusRequest::export_all(&cfg).unwrap();
        character::UpdateBonusRequest::export_all(&cfg).unwrap();
```

- [ ] **Step 3: Run tests to generate TypeScript bindings**

Run: `cargo test -p htbd-core`
Expected: Tests pass, TypeScript files generated in `client/src/types/`.

- [ ] **Step 4: Commit**

```bash
git add crates/htbd-core/src/character.rs crates/htbd-core/src/lib.rs client/src/types/
git commit -m "feat(core): add Character types and generate TypeScript bindings"
```

---

### Task 4: Core Types — WebSocket Messages

**Files:**
- Modify: `crates/htbd-core/src/messages.rs`

- [ ] **Step 1: Add character message variants**

Add these imports at the top of `crates/htbd-core/src/messages.rs`:

```rust
use crate::character::{AddBonusRequest, UpdateBonusRequest};
use crate::game_system::BonusEntry;
use std::collections::HashMap;
```

Add to the `ClientMessage` enum:

```rust
    UpdateCharacterFields {
        character_id: Uuid,
        fields: HashMap<String, serde_json::Value>,
    },
    AddCharacterBonus {
        character_id: Uuid,
        field_id: String,
        source: String,
        bonus_type: String,
        value: i64,
    },
    RemoveCharacterBonus {
        character_id: Uuid,
        bonus_id: Uuid,
    },
    UpdateCharacterBonus {
        character_id: Uuid,
        bonus_id: Uuid,
        source: Option<String>,
        bonus_type: Option<String>,
        value: Option<i64>,
    },
    LinkTokenToCharacter {
        token_id: Uuid,
        character_id: Option<Uuid>,
    },
```

Add to the `ServerMessage` enum:

```rust
    CharacterFieldsUpdated {
        character_id: Uuid,
        fields: HashMap<String, serde_json::Value>,
        updated_by: Uuid,
    },
    CharacterBonusAdded {
        character_id: Uuid,
        field_id: String,
        bonus: BonusEntry,
        computed_total: i64,
    },
    CharacterBonusRemoved {
        character_id: Uuid,
        bonus_id: Uuid,
        field_id: String,
        computed_total: i64,
    },
    CharacterBonusUpdated {
        character_id: Uuid,
        bonus: BonusEntry,
        field_id: String,
        computed_total: i64,
    },
    TokenCharacterLinked {
        token_id: Uuid,
        character_id: Option<Uuid>,
    },
```

- [ ] **Step 2: Regenerate TypeScript bindings**

Run: `cargo test -p htbd-core`
Expected: Tests pass. `client/src/types/ClientMessage.ts` and `client/src/types/ServerMessage.ts` updated with new variants.

- [ ] **Step 3: Commit**

```bash
git add crates/htbd-core/src/messages.rs client/src/types/
git commit -m "feat(core): add character and bonus WebSocket message types"
```

---

### Task 5: Stub Game System Plugin

**Files:**
- Create: `crates/server/src/game_system/mod.rs`
- Create: `crates/server/src/game_system/stub.rs`
- Modify: `crates/server/src/lib.rs`

- [ ] **Step 1: Write the GameSystemRegistry**

Create `crates/server/src/game_system/mod.rs`:

```rust
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

    /// Build registry with all compiled-in game systems.
    pub fn default_registry() -> Self {
        let mut registry = Self::new();
        registry.register(Arc::new(stub::StubGameSystem));
        registry
    }
}
```

- [ ] **Step 2: Write the stub game system**

Create `crates/server/src/game_system/stub.rs`:

```rust
use htbd_core::game_system::*;
use std::collections::HashMap;
use uuid::Uuid;

/// Minimal game system for testing. Has a few fields demonstrating each type.
pub struct StubGameSystem;

impl GameSystem for StubGameSystem {
    fn id(&self) -> &str {
        "stub"
    }

    fn name(&self) -> &str {
        "Stub System"
    }

    fn version(&self) -> &str {
        "0.1.0"
    }

    fn sheet_schema(&self) -> SheetSchema {
        SheetSchema {
            sections: vec![
                SheetSection {
                    id: "basics".to_string(),
                    name: "Basics".to_string(),
                    layout: SectionLayout::Grid { columns: 2 },
                    fields: vec![
                        FieldDef {
                            id: "level".to_string(),
                            name: "Level".to_string(),
                            field_type: FieldType::Integer {
                                min: Some(1),
                                max: Some(20),
                            },
                            default_value: Some(serde_json::json!(1)),
                            derived: false,
                            visible: true,
                            group: None,
                            width_hint: WidthHint::Narrow,
                        },
                        FieldDef {
                            id: "strength".to_string(),
                            name: "Strength".to_string(),
                            field_type: FieldType::AbilityScore,
                            default_value: Some(serde_json::json!(10)),
                            derived: false,
                            visible: true,
                            group: None,
                            width_hint: WidthHint::Normal,
                        },
                        FieldDef {
                            id: "str_mod".to_string(),
                            name: "STR Modifier".to_string(),
                            field_type: FieldType::Integer {
                                min: None,
                                max: None,
                            },
                            default_value: Some(serde_json::json!(0)),
                            derived: true,
                            visible: true,
                            group: None,
                            width_hint: WidthHint::Narrow,
                        },
                    ],
                },
                SheetSection {
                    id: "health".to_string(),
                    name: "Health".to_string(),
                    layout: SectionLayout::Grid { columns: 1 },
                    fields: vec![
                        FieldDef {
                            id: "hp_current".to_string(),
                            name: "Current HP".to_string(),
                            field_type: FieldType::ResourcePool {
                                max_field: Some("hp_max".to_string()),
                            },
                            default_value: Some(serde_json::json!(10)),
                            derived: false,
                            visible: true,
                            group: None,
                            width_hint: WidthHint::Wide,
                        },
                        FieldDef {
                            id: "hp_max".to_string(),
                            name: "Max HP".to_string(),
                            field_type: FieldType::Integer {
                                min: Some(1),
                                max: None,
                            },
                            default_value: Some(serde_json::json!(10)),
                            derived: false,
                            visible: true,
                            group: None,
                            width_hint: WidthHint::Narrow,
                        },
                    ],
                },
                SheetSection {
                    id: "combat".to_string(),
                    name: "Combat".to_string(),
                    layout: SectionLayout::Grid { columns: 1 },
                    fields: vec![FieldDef {
                        id: "armor_class".to_string(),
                        name: "Armor Class".to_string(),
                        field_type: FieldType::BonusStacked {
                            base_expression: Some("10".to_string()),
                            allowed_bonus_types: vec![
                                "armor".to_string(),
                                "shield".to_string(),
                                "natural".to_string(),
                                "dodge".to_string(),
                                "untyped".to_string(),
                            ],
                        },
                        default_value: Some(serde_json::json!(10)),
                        derived: true,
                        visible: true,
                        group: None,
                        width_hint: WidthHint::Wide,
                    }],
                },
            ],
            bonus_types: self.bonus_types(),
        }
    }

    fn compute_derived(&self, fields: &FieldValues, bonuses: &BonusMap) -> FieldValues {
        let mut derived = FieldValues::new();

        // STR modifier = floor((strength - 10) / 2)
        if let Some(str_val) = fields.get("strength").and_then(|v| v.as_i64()) {
            let modifier = (str_val - 10) / 2;
            derived.insert("str_mod".to_string(), serde_json::json!(modifier));
        }

        // Armor class = 10 + stacking bonuses
        let base = 10i64;
        let bonus_total = bonuses
            .get("armor_class")
            .map(|entries| self.apply_stacking("armor_class", entries))
            .unwrap_or(0);
        derived.insert(
            "armor_class".to_string(),
            serde_json::json!(base + bonus_total),
        );

        derived
    }

    fn validate_fields(&self, fields: &FieldValues) -> Vec<ValidationError> {
        let mut errors = Vec::new();
        if let Some(level) = fields.get("level").and_then(|v| v.as_i64()) {
            if !(1..=20).contains(&level) {
                errors.push(ValidationError {
                    field_id: "level".to_string(),
                    message: "Level must be between 1 and 20".to_string(),
                });
            }
        }
        errors
    }

    fn bonus_types(&self) -> Vec<BonusTypeDef> {
        vec![
            BonusTypeDef {
                id: "armor".to_string(),
                name: "Armor".to_string(),
                stacks: false,
            },
            BonusTypeDef {
                id: "shield".to_string(),
                name: "Shield".to_string(),
                stacks: false,
            },
            BonusTypeDef {
                id: "natural".to_string(),
                name: "Natural".to_string(),
                stacks: false,
            },
            BonusTypeDef {
                id: "dodge".to_string(),
                name: "Dodge".to_string(),
                stacks: true,
            },
            BonusTypeDef {
                id: "untyped".to_string(),
                name: "Untyped".to_string(),
                stacks: true,
            },
        ]
    }

    fn apply_stacking(&self, _field_id: &str, bonuses: &[BonusEntry]) -> i64 {
        let bonus_type_defs: HashMap<&str, bool> = self
            .bonus_types()
            .iter()
            .map(|bt| (bt.id.as_str(), bt.stacks))
            .collect();

        // Group bonuses by type
        let mut by_type: HashMap<&str, Vec<i64>> = HashMap::new();
        for b in bonuses {
            by_type
                .entry(b.bonus_type.as_str())
                .or_default()
                .push(b.value);
        }

        let mut total = 0i64;
        for (bonus_type, values) in &by_type {
            let stacks = bonus_type_defs.get(bonus_type).copied().unwrap_or(true);
            if stacks {
                total += values.iter().sum::<i64>();
            } else {
                total += values.iter().copied().max().unwrap_or(0);
            }
        }
        total
    }

    fn creature_sizes(&self) -> Vec<CreatureSize> {
        vec![
            CreatureSize {
                id: "small".to_string(),
                name: "Small".to_string(),
                grid_size: 1,
            },
            CreatureSize {
                id: "medium".to_string(),
                name: "Medium".to_string(),
                grid_size: 1,
            },
            CreatureSize {
                id: "large".to_string(),
                name: "Large".to_string(),
                grid_size: 2,
            },
        ]
    }

    fn initiative_rules(&self) -> InitiativeRules {
        InitiativeRules {
            roll_expression: "1d20 + @str_mod".to_string(),
            tiebreaker_field: Some("strength".to_string()),
        }
    }

    fn default_fields(&self) -> FieldValues {
        let mut fields = FieldValues::new();
        fields.insert("level".to_string(), serde_json::json!(1));
        fields.insert("strength".to_string(), serde_json::json!(10));
        fields.insert("str_mod".to_string(), serde_json::json!(0));
        fields.insert("hp_current".to_string(), serde_json::json!(10));
        fields.insert("hp_max".to_string(), serde_json::json!(10));
        fields.insert("armor_class".to_string(), serde_json::json!(10));
        fields
    }

    fn field_visibility(&self, field_id: &str) -> FieldVisibility {
        match field_id {
            "hp_current" | "hp_max" | "armor_class" => FieldVisibility::Public,
            _ => FieldVisibility::Private,
        }
    }

    fn token_bar_mappings(&self) -> Vec<TokenBarMapping> {
        vec![TokenBarMapping {
            bar_index: 0,
            current_field: "hp_current".to_string(),
            max_field: Some("hp_max".to_string()),
            label: "HP".to_string(),
        }]
    }

    fn export_character(
        &self,
        fields: &FieldValues,
        bonuses: &BonusMap,
    ) -> serde_json::Value {
        serde_json::json!({
            "format": "htbd-character-v1",
            "game_system_id": self.id(),
            "game_system_version": self.version(),
            "fields": fields,
            "bonuses": bonuses,
        })
    }

    fn import_character(
        &self,
        data: &serde_json::Value,
    ) -> Result<(FieldValues, BonusMap), String> {
        let fields: FieldValues = data
            .get("fields")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .ok_or("Missing or invalid 'fields'")?;
        let bonuses: BonusMap = data
            .get("bonuses")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();
        Ok((fields, bonuses))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_derived_str_modifier() {
        let system = StubGameSystem;
        let mut fields = system.default_fields();
        fields.insert("strength".to_string(), serde_json::json!(16));
        let derived = system.compute_derived(&fields, &BonusMap::new());
        assert_eq!(derived.get("str_mod").unwrap(), &serde_json::json!(3));
    }

    #[test]
    fn test_compute_derived_str_modifier_odd() {
        let system = StubGameSystem;
        let mut fields = system.default_fields();
        fields.insert("strength".to_string(), serde_json::json!(15));
        let derived = system.compute_derived(&fields, &BonusMap::new());
        assert_eq!(derived.get("str_mod").unwrap(), &serde_json::json!(2));
    }

    #[test]
    fn test_bonus_stacking_non_stacking_takes_highest() {
        let system = StubGameSystem;
        let bonuses = vec![
            BonusEntry {
                id: Uuid::new_v4(),
                source: "Full Plate".to_string(),
                bonus_type: "armor".to_string(),
                value: 8,
            },
            BonusEntry {
                id: Uuid::new_v4(),
                source: "Magic Vestment".to_string(),
                bonus_type: "armor".to_string(),
                value: 3,
            },
        ];
        assert_eq!(system.apply_stacking("armor_class", &bonuses), 8);
    }

    #[test]
    fn test_bonus_stacking_dodge_stacks() {
        let system = StubGameSystem;
        let bonuses = vec![
            BonusEntry {
                id: Uuid::new_v4(),
                source: "Dodge feat".to_string(),
                bonus_type: "dodge".to_string(),
                value: 1,
            },
            BonusEntry {
                id: Uuid::new_v4(),
                source: "Haste".to_string(),
                bonus_type: "dodge".to_string(),
                value: 1,
            },
        ];
        assert_eq!(system.apply_stacking("armor_class", &bonuses), 2);
    }

    #[test]
    fn test_bonus_stacking_mixed_types() {
        let system = StubGameSystem;
        let bonuses = vec![
            BonusEntry {
                id: Uuid::new_v4(),
                source: "Full Plate".to_string(),
                bonus_type: "armor".to_string(),
                value: 8,
            },
            BonusEntry {
                id: Uuid::new_v4(),
                source: "Heavy Shield".to_string(),
                bonus_type: "shield".to_string(),
                value: 2,
            },
            BonusEntry {
                id: Uuid::new_v4(),
                source: "Dodge feat".to_string(),
                bonus_type: "dodge".to_string(),
                value: 1,
            },
        ];
        // armor 8 + shield 2 + dodge 1 = 11
        assert_eq!(system.apply_stacking("armor_class", &bonuses), 11);
    }

    #[test]
    fn test_ac_with_bonuses() {
        let system = StubGameSystem;
        let fields = system.default_fields();
        let mut bonuses = BonusMap::new();
        bonuses.insert(
            "armor_class".to_string(),
            vec![BonusEntry {
                id: Uuid::new_v4(),
                source: "Leather Armor".to_string(),
                bonus_type: "armor".to_string(),
                value: 2,
            }],
        );
        let derived = system.compute_derived(&fields, &bonuses);
        assert_eq!(derived.get("armor_class").unwrap(), &serde_json::json!(12));
    }

    #[test]
    fn test_export_import_roundtrip() {
        let system = StubGameSystem;
        let fields = system.default_fields();
        let bonuses = BonusMap::new();
        let exported = system.export_character(&fields, &bonuses);
        let (imported_fields, _) = system.import_character(&exported).unwrap();
        assert_eq!(
            imported_fields.get("strength"),
            fields.get("strength")
        );
    }

    #[test]
    fn test_validation_level_bounds() {
        let system = StubGameSystem;
        let mut fields = FieldValues::new();
        fields.insert("level".to_string(), serde_json::json!(25));
        let errors = system.validate_fields(&fields);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].field_id, "level");
    }
}
```

- [ ] **Step 3: Add module to server lib.rs**

Add to `crates/server/src/lib.rs`:

```rust
pub mod game_system;
```

- [ ] **Step 4: Run tests**

Run: `cargo test -p server -- game_system`
Expected: All stub game system tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/game_system/ crates/server/src/lib.rs
git commit -m "feat(server): add GameSystemRegistry and StubGameSystem"
```

---

### Task 6: Database — Character Repository

**Files:**
- Create: `crates/db/src/characters.rs`
- Create: `crates/db/src/character_fields.rs`
- Create: `crates/db/src/character_bonuses.rs`
- Modify: `crates/db/src/lib.rs`

- [ ] **Step 1: Write character CRUD queries**

Create `crates/db/src/characters.rs`:

```rust
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub struct CharacterRow {
    pub id: Uuid,
    pub campaign_id: Uuid,
    pub owner_id: Uuid,
    pub game_system_id: String,
    pub name: String,
    pub portrait_asset_id: Option<Uuid>,
    pub visible_to_players: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub async fn create_character(
    pool: &PgPool,
    campaign_id: &Uuid,
    owner_id: &Uuid,
    game_system_id: &str,
    name: &str,
    portrait_asset_id: Option<&Uuid>,
) -> Result<CharacterRow, sqlx::Error> {
    sqlx::query_as!(
        CharacterRow,
        r#"INSERT INTO characters (campaign_id, owner_id, game_system_id, name, portrait_asset_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *"#,
        campaign_id,
        owner_id,
        game_system_id,
        name,
        portrait_asset_id,
    )
    .fetch_one(pool)
    .await
}

pub async fn find_by_id(pool: &PgPool, id: &Uuid) -> Result<Option<CharacterRow>, sqlx::Error> {
    sqlx::query_as!(CharacterRow, "SELECT * FROM characters WHERE id = $1", id)
        .fetch_optional(pool)
        .await
}

pub async fn list_for_campaign(
    pool: &PgPool,
    campaign_id: &Uuid,
) -> Result<Vec<CharacterRow>, sqlx::Error> {
    sqlx::query_as!(
        CharacterRow,
        "SELECT * FROM characters WHERE campaign_id = $1 ORDER BY created_at ASC",
        campaign_id,
    )
    .fetch_all(pool)
    .await
}

pub async fn update_character(
    pool: &PgPool,
    id: &Uuid,
    name: Option<&str>,
    portrait_asset_id: Option<Option<&Uuid>>,
    visible_to_players: Option<bool>,
) -> Result<Option<CharacterRow>, sqlx::Error> {
    sqlx::query_as!(
        CharacterRow,
        r#"UPDATE characters SET
            name = COALESCE($2, name),
            portrait_asset_id = CASE WHEN $3 THEN $4 ELSE portrait_asset_id END,
            visible_to_players = COALESCE($5, visible_to_players),
            updated_at = now()
        WHERE id = $1
        RETURNING *"#,
        id,
        name,
        portrait_asset_id.is_some(),
        portrait_asset_id.flatten(),
        visible_to_players,
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_character(pool: &PgPool, id: &Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM characters WHERE id = $1", id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

/// Get character's owner_id and campaign_id for auth checks.
pub async fn get_character_auth_info(
    pool: &PgPool,
    character_id: &Uuid,
) -> Result<Option<(Uuid, Uuid)>, sqlx::Error> {
    let row = sqlx::query!(
        "SELECT campaign_id, owner_id FROM characters WHERE id = $1",
        character_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| (r.campaign_id, r.owner_id)))
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn setup_campaign(pool: &PgPool) -> (Uuid, Uuid) {
        let user = crate::users::create_user(pool, "chartest@test.com", "hash", "Tester")
            .await
            .unwrap();
        let campaign = crate::campaigns::create_campaign(pool, "Test Campaign", user.id, "CHAR01")
            .await
            .unwrap();
        (campaign.id, user.id)
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_create_and_find_character(pool: PgPool) {
        let (campaign_id, user_id) = setup_campaign(&pool).await;
        let character = create_character(
            &pool,
            &campaign_id,
            &user_id,
            "stub",
            "Test Hero",
            None,
        )
        .await
        .unwrap();
        assert_eq!(character.name, "Test Hero");
        assert_eq!(character.game_system_id, "stub");
        assert!(character.visible_to_players);

        let found = find_by_id(&pool, &character.id).await.unwrap().unwrap();
        assert_eq!(found.id, character.id);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_list_for_campaign(pool: PgPool) {
        let (campaign_id, user_id) = setup_campaign(&pool).await;
        create_character(&pool, &campaign_id, &user_id, "stub", "Hero 1", None)
            .await
            .unwrap();
        create_character(&pool, &campaign_id, &user_id, "stub", "Hero 2", None)
            .await
            .unwrap();
        let chars = list_for_campaign(&pool, &campaign_id).await.unwrap();
        assert_eq!(chars.len(), 2);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_update_character(pool: PgPool) {
        let (campaign_id, user_id) = setup_campaign(&pool).await;
        let character = create_character(&pool, &campaign_id, &user_id, "stub", "Old Name", None)
            .await
            .unwrap();
        let updated = update_character(&pool, &character.id, Some("New Name"), None, None)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(updated.name, "New Name");
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_delete_character(pool: PgPool) {
        let (campaign_id, user_id) = setup_campaign(&pool).await;
        let character = create_character(&pool, &campaign_id, &user_id, "stub", "Doomed", None)
            .await
            .unwrap();
        assert!(delete_character(&pool, &character.id).await.unwrap());
        assert!(find_by_id(&pool, &character.id).await.unwrap().is_none());
    }
}
```

- [ ] **Step 2: Write field value queries**

Create `crates/db/src/character_fields.rs`:

```rust
use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

pub struct FieldValueRow {
    pub character_id: Uuid,
    pub field_id: String,
    pub value: serde_json::Value,
}

pub async fn get_all_fields(
    pool: &PgPool,
    character_id: &Uuid,
) -> Result<Vec<FieldValueRow>, sqlx::Error> {
    sqlx::query_as!(
        FieldValueRow,
        "SELECT * FROM character_field_values WHERE character_id = $1",
        character_id,
    )
    .fetch_all(pool)
    .await
}

pub async fn upsert_fields(
    pool: &PgPool,
    character_id: &Uuid,
    fields: &HashMap<String, serde_json::Value>,
) -> Result<(), sqlx::Error> {
    for (field_id, value) in fields {
        sqlx::query!(
            r#"INSERT INTO character_field_values (character_id, field_id, value)
               VALUES ($1, $2, $3)
               ON CONFLICT (character_id, field_id)
               DO UPDATE SET value = $3"#,
            character_id,
            field_id,
            value,
        )
        .execute(pool)
        .await?;
    }
    Ok(())
}

pub async fn delete_all_fields(pool: &PgPool, character_id: &Uuid) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM character_field_values WHERE character_id = $1",
        character_id,
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Convert rows to a HashMap for easier consumption.
pub fn rows_to_map(rows: Vec<FieldValueRow>) -> HashMap<String, serde_json::Value> {
    rows.into_iter().map(|r| (r.field_id, r.value)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn setup_character(pool: &PgPool) -> Uuid {
        let user = crate::users::create_user(pool, "fields@test.com", "hash", "Tester")
            .await
            .unwrap();
        let campaign = crate::campaigns::create_campaign(pool, "FC", user.id, "FIELD01")
            .await
            .unwrap();
        let character = crate::characters::create_character(
            pool,
            &campaign.id,
            &user.id,
            "stub",
            "Field Test",
            None,
        )
        .await
        .unwrap();
        character.id
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_upsert_and_get_fields(pool: PgPool) {
        let char_id = setup_character(&pool).await;
        let mut fields = HashMap::new();
        fields.insert("strength".to_string(), serde_json::json!(16));
        fields.insert("level".to_string(), serde_json::json!(5));

        upsert_fields(&pool, &char_id, &fields).await.unwrap();

        let rows = get_all_fields(&pool, &char_id).await.unwrap();
        let map = rows_to_map(rows);
        assert_eq!(map.get("strength").unwrap(), &serde_json::json!(16));
        assert_eq!(map.get("level").unwrap(), &serde_json::json!(5));
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_upsert_overwrites(pool: PgPool) {
        let char_id = setup_character(&pool).await;
        let mut fields = HashMap::new();
        fields.insert("strength".to_string(), serde_json::json!(10));
        upsert_fields(&pool, &char_id, &fields).await.unwrap();

        fields.insert("strength".to_string(), serde_json::json!(18));
        upsert_fields(&pool, &char_id, &fields).await.unwrap();

        let rows = get_all_fields(&pool, &char_id).await.unwrap();
        let map = rows_to_map(rows);
        assert_eq!(map.get("strength").unwrap(), &serde_json::json!(18));
    }
}
```

- [ ] **Step 3: Write bonus entry queries**

Create `crates/db/src/character_bonuses.rs`:

```rust
use sqlx::PgPool;
use uuid::Uuid;

pub struct BonusRow {
    pub id: Uuid,
    pub character_id: Uuid,
    pub field_id: String,
    pub source: String,
    pub bonus_type: String,
    pub value: i32,
}

pub async fn list_for_character(
    pool: &PgPool,
    character_id: &Uuid,
) -> Result<Vec<BonusRow>, sqlx::Error> {
    sqlx::query_as!(
        BonusRow,
        "SELECT * FROM character_bonuses WHERE character_id = $1",
        character_id,
    )
    .fetch_all(pool)
    .await
}

pub async fn list_for_character_field(
    pool: &PgPool,
    character_id: &Uuid,
    field_id: &str,
) -> Result<Vec<BonusRow>, sqlx::Error> {
    sqlx::query_as!(
        BonusRow,
        "SELECT * FROM character_bonuses WHERE character_id = $1 AND field_id = $2",
        character_id,
        field_id,
    )
    .fetch_all(pool)
    .await
}

pub async fn add_bonus(
    pool: &PgPool,
    character_id: &Uuid,
    field_id: &str,
    source: &str,
    bonus_type: &str,
    value: i32,
) -> Result<BonusRow, sqlx::Error> {
    sqlx::query_as!(
        BonusRow,
        r#"INSERT INTO character_bonuses (character_id, field_id, source, bonus_type, value)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *"#,
        character_id,
        field_id,
        source,
        bonus_type,
        value,
    )
    .fetch_one(pool)
    .await
}

pub async fn update_bonus(
    pool: &PgPool,
    bonus_id: &Uuid,
    source: Option<&str>,
    bonus_type: Option<&str>,
    value: Option<i32>,
) -> Result<Option<BonusRow>, sqlx::Error> {
    sqlx::query_as!(
        BonusRow,
        r#"UPDATE character_bonuses SET
            source = COALESCE($2, source),
            bonus_type = COALESCE($3, bonus_type),
            value = COALESCE($4, value)
        WHERE id = $1
        RETURNING *"#,
        bonus_id,
        source,
        bonus_type,
        value,
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_bonus(pool: &PgPool, bonus_id: &Uuid) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!("DELETE FROM character_bonuses WHERE id = $1", bonus_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn find_bonus_by_id(
    pool: &PgPool,
    bonus_id: &Uuid,
) -> Result<Option<BonusRow>, sqlx::Error> {
    sqlx::query_as!(
        BonusRow,
        "SELECT * FROM character_bonuses WHERE id = $1",
        bonus_id,
    )
    .fetch_optional(pool)
    .await
}

pub async fn delete_all_for_character(
    pool: &PgPool,
    character_id: &Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM character_bonuses WHERE character_id = $1",
        character_id,
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Convert DB rows to core BonusEntry types, grouped by field_id.
pub fn rows_to_bonus_map(
    rows: Vec<BonusRow>,
) -> std::collections::HashMap<String, Vec<htbd_core::game_system::BonusEntry>> {
    let mut map: std::collections::HashMap<String, Vec<htbd_core::game_system::BonusEntry>> =
        std::collections::HashMap::new();
    for row in rows {
        map.entry(row.field_id).or_default().push(
            htbd_core::game_system::BonusEntry {
                id: row.id,
                source: row.source,
                bonus_type: row.bonus_type,
                value: row.value as i64,
            },
        );
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn setup_character(pool: &PgPool) -> Uuid {
        let user = crate::users::create_user(pool, "bonus@test.com", "hash", "Tester")
            .await
            .unwrap();
        let campaign = crate::campaigns::create_campaign(pool, "BC", user.id, "BONUS01")
            .await
            .unwrap();
        let character = crate::characters::create_character(
            pool,
            &campaign.id,
            &user.id,
            "stub",
            "Bonus Test",
            None,
        )
        .await
        .unwrap();
        character.id
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_add_and_list_bonuses(pool: PgPool) {
        let char_id = setup_character(&pool).await;
        add_bonus(&pool, &char_id, "armor_class", "Full Plate", "armor", 8)
            .await
            .unwrap();
        add_bonus(&pool, &char_id, "armor_class", "Shield", "shield", 2)
            .await
            .unwrap();

        let bonuses = list_for_character_field(&pool, &char_id, "armor_class")
            .await
            .unwrap();
        assert_eq!(bonuses.len(), 2);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_update_bonus(pool: PgPool) {
        let char_id = setup_character(&pool).await;
        let bonus = add_bonus(&pool, &char_id, "armor_class", "Leather", "armor", 2)
            .await
            .unwrap();
        let updated = update_bonus(&pool, &bonus.id, None, None, Some(4))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(updated.value, 4);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_delete_bonus(pool: PgPool) {
        let char_id = setup_character(&pool).await;
        let bonus = add_bonus(&pool, &char_id, "armor_class", "Temp", "untyped", 1)
            .await
            .unwrap();
        assert!(delete_bonus(&pool, &bonus.id).await.unwrap());
        assert!(find_bonus_by_id(&pool, &bonus.id).await.unwrap().is_none());
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_rows_to_bonus_map(pool: PgPool) {
        let char_id = setup_character(&pool).await;
        add_bonus(&pool, &char_id, "armor_class", "Plate", "armor", 8)
            .await
            .unwrap();
        add_bonus(&pool, &char_id, "fortitude", "Cloak", "resistance", 2)
            .await
            .unwrap();

        let rows = list_for_character(&pool, &char_id).await.unwrap();
        let map = rows_to_bonus_map(rows);
        assert_eq!(map.get("armor_class").unwrap().len(), 1);
        assert_eq!(map.get("fortitude").unwrap().len(), 1);
    }
}
```

- [ ] **Step 4: Add modules to db lib.rs**

Add to `crates/db/src/lib.rs`:

```rust
pub mod characters;
pub mod character_fields;
pub mod character_bonuses;
```

- [ ] **Step 5: Run all DB tests**

Run: `cargo test -p db`
Expected: All new and existing tests pass.

- [ ] **Step 6: Regenerate sqlx offline data**

Run: `cargo sqlx prepare --workspace`
Expected: `.sqlx/` updated.

- [ ] **Step 7: Commit**

```bash
git add crates/db/src/characters.rs crates/db/src/character_fields.rs crates/db/src/character_bonuses.rs crates/db/src/lib.rs .sqlx/
git commit -m "feat(db): add character, field, and bonus repository queries"
```

---

### Task 7: Server — AppState & Guards

**Files:**
- Modify: `crates/server/src/state.rs`
- Modify: `crates/server/src/routes/guards.rs`

- [ ] **Step 1: Add GameSystemRegistry to AppState**

In `crates/server/src/state.rs`, add the import and field:

```rust
use crate::game_system::GameSystemRegistry;
```

Add to the `AppState` struct:

```rust
    pub game_systems: GameSystemRegistry,
```

- [ ] **Step 2: Update AppState construction in main.rs**

Find where `AppState` is constructed (likely in `crates/server/src/main.rs` or a similar entry point) and add:

```rust
    game_systems: GameSystemRegistry::default_registry(),
```

- [ ] **Step 3: Add character auth guard**

Add to `crates/server/src/routes/guards.rs`:

```rust
/// Require that the user is the character's owner or a DM of the campaign.
pub async fn require_character_owner_or_dm(
    state: &AppState,
    character_id: &Uuid,
    user_id: Uuid,
) -> Result<(Uuid, CampaignRole), AppError> {
    let (campaign_id, owner_id) =
        db::characters::get_character_auth_info(&state.pool, character_id)
            .await?
            .ok_or(AppError::NotFound)?;

    let role = require_member(state, campaign_id, user_id).await?;

    if role != CampaignRole::Dm && owner_id != user_id {
        return Err(AppError::Forbidden);
    }

    Ok((campaign_id, role))
}
```

- [ ] **Step 4: Build to verify**

Run: `cargo build -p server`
Expected: Compiles.

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/state.rs crates/server/src/routes/guards.rs crates/server/src/main.rs
git commit -m "feat(server): add GameSystemRegistry to AppState and character auth guard"
```

---

### Task 8: Server — Game System REST Routes

**Files:**
- Create: `crates/server/src/routes/game_systems.rs`
- Modify: `crates/server/src/routes/mod.rs`

- [ ] **Step 1: Write game system routes**

Create `crates/server/src/routes/game_systems.rs`:

```rust
use axum::{Json, Router, extract::{Path, State}, routing::get};

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::game_system::{GameSystemInfo, SheetSchema};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/game-systems", get(list_game_systems))
        .route("/game-systems/{id}/schema", get(get_schema))
}

async fn list_game_systems(
    State(state): State<AppState>,
    _auth: AuthUser,
) -> Json<Vec<GameSystemInfo>> {
    Json(state.game_systems.list())
}

async fn get_schema(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<SheetSchema>, AppError> {
    let system = state
        .game_systems
        .get(&id)
        .ok_or(AppError::NotFound)?;
    Ok(Json(system.sheet_schema()))
}
```

- [ ] **Step 2: Mount routes**

In `crates/server/src/routes/mod.rs`, add:

```rust
pub mod game_systems;
```

And in the `api_routes()` function, add:

```rust
        .merge(game_systems::routes())
```

- [ ] **Step 3: Build to verify**

Run: `cargo build -p server`
Expected: Compiles.

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/routes/game_systems.rs crates/server/src/routes/mod.rs
git commit -m "feat(server): add game system REST endpoints"
```

---

### Task 9: Server — Character REST Routes

**Files:**
- Create: `crates/server/src/routes/characters.rs`
- Modify: `crates/server/src/routes/mod.rs`

- [ ] **Step 1: Write character routes**

Create `crates/server/src/routes/characters.rs`:

```rust
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use std::collections::HashMap;
use uuid::Uuid;

use crate::error::AppError;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;
use htbd_core::character::*;
use htbd_core::game_system::BonusEntry;
use htbd_core::messages::ServerMessage;

use super::guards::{require_character_owner_or_dm, require_dm, require_member};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/campaigns/{campaign_id}/characters", post(create_character).get(list_characters))
        .route(
            "/characters/{id}",
            get(get_character).put(update_character).delete(delete_character),
        )
        .route("/characters/{id}/export", post(export_character))
        .route(
            "/campaigns/{campaign_id}/characters/import",
            post(import_character),
        )
}

/// Assemble a full Character from DB rows.
async fn assemble_character(
    pool: &sqlx::PgPool,
    row: db::characters::CharacterRow,
) -> Result<Character, AppError> {
    let field_rows = db::character_fields::get_all_fields(pool, &row.id).await?;
    let fields = db::character_fields::rows_to_map(field_rows);

    let bonus_rows = db::character_bonuses::list_for_character(pool, &row.id).await?;
    let bonuses = db::character_bonuses::rows_to_bonus_map(bonus_rows);

    Ok(Character {
        id: row.id,
        campaign_id: row.campaign_id,
        owner_id: row.owner_id,
        game_system_id: row.game_system_id,
        name: row.name,
        portrait_asset_id: row.portrait_asset_id,
        visible_to_players: row.visible_to_players,
        fields,
        bonuses,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

async fn create_character(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(campaign_id): Path<Uuid>,
    Json(req): Json<CreateCharacterRequest>,
) -> Result<(StatusCode, Json<Character>), AppError> {
    require_member(&state, campaign_id, auth.user_id).await?;

    let system = state
        .game_systems
        .get(&req.game_system_id)
        .ok_or(AppError::BadRequest(format!(
            "Unknown game system: {}",
            req.game_system_id
        )))?;

    if req.name.is_empty() {
        return Err(AppError::BadRequest("Character name required".to_string()));
    }

    let row = db::characters::create_character(
        &state.pool,
        &campaign_id,
        &auth.user_id,
        &req.game_system_id,
        &req.name,
        req.portrait_asset_id.as_ref(),
    )
    .await?;

    // Insert default fields
    let default_fields = system.default_fields();
    db::character_fields::upsert_fields(&state.pool, &row.id, &default_fields).await?;

    // Compute derived fields
    let bonuses = HashMap::new();
    let derived = system.compute_derived(&default_fields, &bonuses);
    db::character_fields::upsert_fields(&state.pool, &row.id, &derived).await?;

    let character = assemble_character(&state.pool, row).await?;

    Ok((StatusCode::CREATED, Json(character)))
}

async fn list_characters(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(campaign_id): Path<Uuid>,
) -> Result<Json<Vec<Character>>, AppError> {
    let role = require_member(&state, campaign_id, auth.user_id).await?;

    let rows = db::characters::list_for_campaign(&state.pool, &campaign_id).await?;

    let mut characters = Vec::new();
    for row in rows {
        // Non-DM users only see visible characters (+ their own)
        if role != htbd_core::models::CampaignRole::Dm
            && !row.visible_to_players
            && row.owner_id != auth.user_id
        {
            continue;
        }
        characters.push(assemble_character(&state.pool, row).await?);
    }

    Ok(Json(characters))
}

async fn get_character(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Character>, AppError> {
    let row = db::characters::find_by_id(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;

    // Check membership
    let role = require_member(&state, row.campaign_id, auth.user_id).await?;

    // Visibility check
    if role != htbd_core::models::CampaignRole::Dm
        && !row.visible_to_players
        && row.owner_id != auth.user_id
    {
        return Err(AppError::NotFound);
    }

    let character = assemble_character(&state.pool, row).await?;
    Ok(Json(character))
}

async fn update_character(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateCharacterRequest>,
) -> Result<Json<Character>, AppError> {
    require_character_owner_or_dm(&state, &id, auth.user_id).await?;

    let updated = db::characters::update_character(
        &state.pool,
        &id,
        req.name.as_deref(),
        req.portrait_asset_id.as_ref().map(|a| a.as_ref()),
        req.visible_to_players,
    )
    .await?
    .ok_or(AppError::NotFound)?;

    let character = assemble_character(&state.pool, updated).await?;
    Ok(Json(character))
}

async fn delete_character(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    require_character_owner_or_dm(&state, &id, auth.user_id).await?;
    db::characters::delete_character(&state.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn export_character(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let (campaign_id, _) = require_character_owner_or_dm(&state, &id, auth.user_id).await?;

    let row = db::characters::find_by_id(&state.pool, &id)
        .await?
        .ok_or(AppError::NotFound)?;

    let system = state
        .game_systems
        .get(&row.game_system_id)
        .ok_or(AppError::Internal("Game system not found".to_string()))?;

    let field_rows = db::character_fields::get_all_fields(&state.pool, &id).await?;
    let fields = db::character_fields::rows_to_map(field_rows);

    let bonus_rows = db::character_bonuses::list_for_character(&state.pool, &id).await?;
    let bonuses = db::character_bonuses::rows_to_bonus_map(bonus_rows);

    let mut export = system.export_character(&fields, &bonuses);
    // Add metadata
    if let Some(obj) = export.as_object_mut() {
        obj.insert("name".to_string(), serde_json::json!(row.name));
        obj.insert(
            "exported_at".to_string(),
            serde_json::json!(chrono::Utc::now()),
        );
    }

    Ok(Json(export))
}

async fn import_character(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(campaign_id): Path<Uuid>,
    Json(data): Json<serde_json::Value>,
) -> Result<(StatusCode, Json<Character>), AppError> {
    require_member(&state, campaign_id, auth.user_id).await?;

    let game_system_id = data
        .get("game_system_id")
        .and_then(|v| v.as_str())
        .ok_or(AppError::BadRequest(
            "Missing game_system_id".to_string(),
        ))?;

    let system = state
        .game_systems
        .get(game_system_id)
        .ok_or(AppError::BadRequest(format!(
            "Unknown game system: {game_system_id}"
        )))?;

    let name = data
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Imported Character");

    let (fields, bonuses) = system
        .import_character(&data)
        .map_err(|e| AppError::BadRequest(e))?;

    let row = db::characters::create_character(
        &state.pool,
        &campaign_id,
        &auth.user_id,
        game_system_id,
        name,
        None,
    )
    .await?;

    // Insert fields
    db::character_fields::upsert_fields(&state.pool, &row.id, &fields).await?;

    // Insert bonuses
    for (field_id, entries) in &bonuses {
        for entry in entries {
            db::character_bonuses::add_bonus(
                &state.pool,
                &row.id,
                field_id,
                &entry.source,
                &entry.bonus_type,
                entry.value as i32,
            )
            .await?;
        }
    }

    // Compute derived
    let derived = system.compute_derived(&fields, &bonuses);
    db::character_fields::upsert_fields(&state.pool, &row.id, &derived).await?;

    let character = assemble_character(&state.pool, row).await?;
    Ok((StatusCode::CREATED, Json(character)))
}
```

- [ ] **Step 2: Mount routes**

In `crates/server/src/routes/mod.rs`, add:

```rust
pub mod characters;
```

And in `api_routes()`:

```rust
        .merge(characters::routes())
```

- [ ] **Step 3: Build to verify**

Run: `cargo build -p server`
Expected: Compiles.

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/routes/characters.rs crates/server/src/routes/mod.rs
git commit -m "feat(server): add character REST endpoints with CRUD, import, and export"
```

---

### Task 10: Server — WebSocket Character Message Handlers

**Files:**
- Modify: `crates/server/src/routes/ws.rs`

- [ ] **Step 1: Add character message handling to handle_client_message**

In `crates/server/src/routes/ws.rs`, add these imports:

```rust
use std::collections::HashMap;
```

Add these match arms to `handle_client_message`:

```rust
        ClientMessage::UpdateCharacterFields {
            character_id,
            fields,
        } => {
            handle_update_character_fields(state, campaign_id, user_id, role, character_id, fields)
                .await;
        }
        ClientMessage::AddCharacterBonus {
            character_id,
            field_id,
            source,
            bonus_type,
            value,
        } => {
            handle_add_character_bonus(
                state,
                campaign_id,
                user_id,
                role,
                character_id,
                field_id,
                source,
                bonus_type,
                value,
            )
            .await;
        }
        ClientMessage::RemoveCharacterBonus {
            character_id,
            bonus_id,
        } => {
            handle_remove_character_bonus(
                state,
                campaign_id,
                user_id,
                role,
                character_id,
                bonus_id,
            )
            .await;
        }
        ClientMessage::UpdateCharacterBonus {
            character_id,
            bonus_id,
            source,
            bonus_type,
            value,
        } => {
            handle_update_character_bonus(
                state,
                campaign_id,
                user_id,
                role,
                character_id,
                bonus_id,
                source,
                bonus_type,
                value,
            )
            .await;
        }
        ClientMessage::LinkTokenToCharacter {
            token_id,
            character_id,
        } => {
            handle_link_token_to_character(
                state,
                campaign_id,
                user_id,
                role,
                token_id,
                character_id,
            )
            .await;
        }
```

- [ ] **Step 2: Implement the handler functions**

Add these functions to `ws.rs`:

```rust
async fn handle_update_character_fields(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    character_id: Uuid,
    fields: HashMap<String, serde_json::Value>,
) {
    // Auth check
    let (char_campaign_id, owner_id) =
        match db::characters::get_character_auth_info(&state.pool, &character_id).await {
            Ok(Some(info)) => info,
            _ => {
                let error = ServerMessage::Error {
                    code: "CHARACTER_NOT_FOUND".to_string(),
                    message: format!("Character {character_id} not found"),
                };
                state
                    .session_manager
                    .send_to(campaign_id, user_id, &error)
                    .await;
                return;
            }
        };

    if char_campaign_id != campaign_id {
        return;
    }
    if role != CampaignRole::Dm && owner_id != user_id {
        let error = ServerMessage::Error {
            code: "FORBIDDEN".to_string(),
            message: "You can only edit your own characters".to_string(),
        };
        state
            .session_manager
            .send_to(campaign_id, user_id, &error)
            .await;
        return;
    }

    // Persist raw field updates
    if let Err(e) = db::character_fields::upsert_fields(&state.pool, &character_id, &fields).await
    {
        tracing::error!("DB error updating character fields: {e}");
        return;
    }

    // Load game system and recompute derived fields
    let char_row = match db::characters::find_by_id(&state.pool, &character_id).await {
        Ok(Some(row)) => row,
        _ => return,
    };

    let system = match state.game_systems.get(&char_row.game_system_id) {
        Some(s) => s,
        None => return,
    };

    // Load all fields and bonuses for recomputation
    let all_field_rows = match db::character_fields::get_all_fields(&state.pool, &character_id).await
    {
        Ok(rows) => rows,
        Err(_) => return,
    };
    let all_fields = db::character_fields::rows_to_map(all_field_rows);

    let bonus_rows = match db::character_bonuses::list_for_character(&state.pool, &character_id).await
    {
        Ok(rows) => rows,
        Err(_) => return,
    };
    let all_bonuses = db::character_bonuses::rows_to_bonus_map(bonus_rows);

    let derived = system.compute_derived(&all_fields, &all_bonuses);

    // Persist derived fields
    let _ = db::character_fields::upsert_fields(&state.pool, &character_id, &derived).await;

    // Merge raw updates + derived into the broadcast payload
    let mut updated_fields = fields;
    updated_fields.extend(derived);

    let msg = ServerMessage::CharacterFieldsUpdated {
        character_id,
        fields: updated_fields,
        updated_by: user_id,
    };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;
}

async fn handle_add_character_bonus(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    character_id: Uuid,
    field_id: String,
    source: String,
    bonus_type: String,
    value: i64,
) {
    // Auth
    let (char_campaign_id, owner_id) =
        match db::characters::get_character_auth_info(&state.pool, &character_id).await {
            Ok(Some(info)) => info,
            _ => return,
        };
    if char_campaign_id != campaign_id {
        return;
    }
    if role != CampaignRole::Dm && owner_id != user_id {
        return;
    }

    let row = match db::character_bonuses::add_bonus(
        &state.pool,
        &character_id,
        &field_id,
        &source,
        &bonus_type,
        value as i32,
    )
    .await
    {
        Ok(row) => row,
        Err(e) => {
            tracing::error!("DB error adding bonus: {e}");
            return;
        }
    };

    // Recompute the field's total
    let computed_total = recompute_bonus_field(state, &character_id, &field_id).await;

    let bonus = htbd_core::game_system::BonusEntry {
        id: row.id,
        source: row.source,
        bonus_type: row.bonus_type,
        value: row.value as i64,
    };

    let msg = ServerMessage::CharacterBonusAdded {
        character_id,
        field_id,
        bonus,
        computed_total,
    };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;
}

async fn handle_remove_character_bonus(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    character_id: Uuid,
    bonus_id: Uuid,
) {
    let bonus_row = match db::character_bonuses::find_bonus_by_id(&state.pool, &bonus_id).await {
        Ok(Some(row)) => row,
        _ => return,
    };

    // Auth
    let (char_campaign_id, owner_id) =
        match db::characters::get_character_auth_info(&state.pool, &bonus_row.character_id).await {
            Ok(Some(info)) => info,
            _ => return,
        };
    if char_campaign_id != campaign_id {
        return;
    }
    if role != CampaignRole::Dm && owner_id != user_id {
        return;
    }

    let field_id = bonus_row.field_id.clone();
    let _ = db::character_bonuses::delete_bonus(&state.pool, &bonus_id).await;

    let computed_total = recompute_bonus_field(state, &character_id, &field_id).await;

    let msg = ServerMessage::CharacterBonusRemoved {
        character_id,
        bonus_id,
        field_id,
        computed_total,
    };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;
}

async fn handle_update_character_bonus(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    character_id: Uuid,
    bonus_id: Uuid,
    source: Option<String>,
    bonus_type: Option<String>,
    value: Option<i64>,
) {
    let bonus_row = match db::character_bonuses::find_bonus_by_id(&state.pool, &bonus_id).await {
        Ok(Some(row)) => row,
        _ => return,
    };

    let (char_campaign_id, owner_id) =
        match db::characters::get_character_auth_info(&state.pool, &bonus_row.character_id).await {
            Ok(Some(info)) => info,
            _ => return,
        };
    if char_campaign_id != campaign_id {
        return;
    }
    if role != CampaignRole::Dm && owner_id != user_id {
        return;
    }

    let field_id = bonus_row.field_id.clone();
    let updated = match db::character_bonuses::update_bonus(
        &state.pool,
        &bonus_id,
        source.as_deref(),
        bonus_type.as_deref(),
        value.map(|v| v as i32),
    )
    .await
    {
        Ok(Some(row)) => row,
        _ => return,
    };

    let computed_total = recompute_bonus_field(state, &character_id, &field_id).await;

    let bonus = htbd_core::game_system::BonusEntry {
        id: updated.id,
        source: updated.source,
        bonus_type: updated.bonus_type,
        value: updated.value as i64,
    };

    let msg = ServerMessage::CharacterBonusUpdated {
        character_id,
        bonus,
        field_id,
        computed_total,
    };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;
}

async fn handle_link_token_to_character(
    state: &AppState,
    campaign_id: Uuid,
    user_id: Uuid,
    role: CampaignRole,
    token_id: Uuid,
    character_id: Option<Uuid>,
) {
    // Only DM can link tokens
    if role != CampaignRole::Dm {
        let error = ServerMessage::Error {
            code: "FORBIDDEN".to_string(),
            message: "Only the DM can link tokens to characters".to_string(),
        };
        state
            .session_manager
            .send_to(campaign_id, user_id, &error)
            .await;
        return;
    }

    // Persist the link
    match sqlx::query!(
        "UPDATE tokens SET character_id = $2, updated_at = now() WHERE id = $1",
        token_id,
        character_id,
    )
    .execute(&state.pool)
    .await
    {
        Ok(_) => {}
        Err(e) => {
            tracing::error!("DB error linking token to character: {e}");
            return;
        }
    }

    let msg = ServerMessage::TokenCharacterLinked {
        token_id,
        character_id,
    };
    state
        .session_manager
        .broadcast(campaign_id, &msg, None)
        .await;
}

/// Recompute a bonus-stacked field's total and persist it.
async fn recompute_bonus_field(state: &AppState, character_id: &Uuid, field_id: &str) -> i64 {
    let char_row = match db::characters::find_by_id(&state.pool, character_id).await {
        Ok(Some(row)) => row,
        _ => return 0,
    };

    let system = match state.game_systems.get(&char_row.game_system_id) {
        Some(s) => s,
        None => return 0,
    };

    // Load all fields and bonuses, recompute
    let field_rows = db::character_fields::get_all_fields(&state.pool, character_id)
        .await
        .unwrap_or_default();
    let all_fields = db::character_fields::rows_to_map(field_rows);

    let bonus_rows = db::character_bonuses::list_for_character(&state.pool, character_id)
        .await
        .unwrap_or_default();
    let all_bonuses = db::character_bonuses::rows_to_bonus_map(bonus_rows);

    let derived = system.compute_derived(&all_fields, &all_bonuses);

    // Persist derived fields
    let _ = db::character_fields::upsert_fields(&state.pool, character_id, &derived).await;

    derived
        .get(field_id)
        .and_then(|v| v.as_i64())
        .unwrap_or(0)
}
```

- [ ] **Step 3: Build to verify**

Run: `cargo build -p server`
Expected: Compiles.

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/routes/ws.rs
git commit -m "feat(server): add WebSocket handlers for character fields, bonuses, and token linking"
```

---

### Task 11: Frontend — API Clients

**Files:**
- Create: `client/src/api/characters.ts`
- Create: `client/src/api/game-systems.ts`

- [ ] **Step 1: Write game systems API client**

Create `client/src/api/game-systems.ts`:

```typescript
import { request } from './client'
import type { GameSystemInfo } from '../types/GameSystemInfo'
import type { SheetSchema } from '../types/SheetSchema'

export const gameSystemsApi = {
  list: () => request<GameSystemInfo[]>('/game-systems'),

  getSchema: (id: string) => request<SheetSchema>(`/game-systems/${id}/schema`),
}
```

- [ ] **Step 2: Write characters API client**

Create `client/src/api/characters.ts`:

```typescript
import { request } from './client'
import type { Character } from '../types/Character'
import type { CreateCharacterRequest } from '../types/CreateCharacterRequest'
import type { UpdateCharacterRequest } from '../types/UpdateCharacterRequest'

export const charactersApi = {
  list: (campaignId: string) =>
    request<Character[]>(`/campaigns/${campaignId}/characters`),

  get: (characterId: string) =>
    request<Character>(`/characters/${characterId}`),

  create: (campaignId: string, data: CreateCharacterRequest) =>
    request<Character>(`/campaigns/${campaignId}/characters`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (characterId: string, data: UpdateCharacterRequest) =>
    request<Character>(`/characters/${characterId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (characterId: string) =>
    request<void>(`/characters/${characterId}`, { method: 'DELETE' }),

  export: (characterId: string) =>
    request<Record<string, unknown>>(`/characters/${characterId}/export`, {
      method: 'POST',
    }),

  import: (campaignId: string, data: Record<string, unknown>) =>
    request<Character>(`/campaigns/${campaignId}/characters/import`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/api/characters.ts client/src/api/game-systems.ts
git commit -m "feat(client): add character and game system API clients"
```

---

### Task 12: Frontend — Character Zustand Store

**Files:**
- Create: `client/src/state/characters.ts`
- Create: `client/src/state/__tests__/characters.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `client/src/state/__tests__/characters.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useCharacterStore } from '../characters'
import type { Character } from '../../types/Character'

const makeCharacter = (overrides: Partial<Character> = {}): Character => ({
  id: 'char-1',
  campaign_id: 'campaign-1',
  owner_id: 'user-1',
  game_system_id: 'stub',
  name: 'Test Hero',
  portrait_asset_id: null,
  visible_to_players: true,
  fields: { strength: 10, str_mod: 0, hp_current: 10, hp_max: 10 },
  bonuses: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('useCharacterStore', () => {
  beforeEach(() => {
    useCharacterStore.setState(useCharacterStore.getInitialState())
  })

  it('starts empty', () => {
    const state = useCharacterStore.getState()
    expect(state.characters).toEqual([])
    expect(state.activeCharacterId).toBeNull()
  })

  it('loads characters', () => {
    const chars = [makeCharacter(), makeCharacter({ id: 'char-2', name: 'Hero 2' })]
    useCharacterStore.getState().loadCharacters(chars)
    expect(useCharacterStore.getState().characters).toHaveLength(2)
  })

  it('adds a character without duplicates', () => {
    const char = makeCharacter()
    useCharacterStore.getState().addCharacter(char)
    useCharacterStore.getState().addCharacter(char)
    expect(useCharacterStore.getState().characters).toHaveLength(1)
  })

  it('removes a character', () => {
    useCharacterStore.getState().addCharacter(makeCharacter())
    useCharacterStore.getState().removeCharacter('char-1')
    expect(useCharacterStore.getState().characters).toHaveLength(0)
  })

  it('clears activeCharacterId when removing active character', () => {
    useCharacterStore.getState().addCharacter(makeCharacter())
    useCharacterStore.getState().setActiveCharacter('char-1')
    useCharacterStore.getState().removeCharacter('char-1')
    expect(useCharacterStore.getState().activeCharacterId).toBeNull()
  })

  it('updates character fields', () => {
    useCharacterStore.getState().addCharacter(makeCharacter())
    useCharacterStore.getState().handleFieldsUpdated('char-1', { strength: 16, str_mod: 3 })
    const char = useCharacterStore.getState().characters.find((c) => c.id === 'char-1')
    expect(char?.fields.strength).toBe(16)
    expect(char?.fields.str_mod).toBe(3)
  })

  it('adds a bonus entry', () => {
    useCharacterStore.getState().addCharacter(makeCharacter())
    useCharacterStore.getState().handleBonusAdded('char-1', 'armor_class', {
      id: 'bonus-1',
      source: 'Plate',
      bonus_type: 'armor',
      value: 8,
    })
    const char = useCharacterStore.getState().characters.find((c) => c.id === 'char-1')
    expect(char?.bonuses.armor_class).toHaveLength(1)
    expect(char?.bonuses.armor_class[0].source).toBe('Plate')
  })

  it('removes a bonus entry', () => {
    useCharacterStore.getState().addCharacter(makeCharacter({
      bonuses: { armor_class: [{ id: 'bonus-1', source: 'Plate', bonus_type: 'armor', value: 8 }] },
    }))
    useCharacterStore.getState().handleBonusRemoved('char-1', 'bonus-1', 'armor_class')
    const char = useCharacterStore.getState().characters.find((c) => c.id === 'char-1')
    expect(char?.bonuses.armor_class).toHaveLength(0)
  })

  it('updates a bonus entry', () => {
    useCharacterStore.getState().addCharacter(makeCharacter({
      bonuses: { armor_class: [{ id: 'bonus-1', source: 'Leather', bonus_type: 'armor', value: 2 }] },
    }))
    useCharacterStore.getState().handleBonusUpdated('char-1', 'armor_class', {
      id: 'bonus-1',
      source: 'Full Plate',
      bonus_type: 'armor',
      value: 8,
    })
    const char = useCharacterStore.getState().characters.find((c) => c.id === 'char-1')
    expect(char?.bonuses.armor_class[0].value).toBe(8)
    expect(char?.bonuses.armor_class[0].source).toBe('Full Plate')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npm run test -- --run src/state/__tests__/characters.test.ts`
Expected: FAIL — module `../characters` not found.

- [ ] **Step 3: Write the character store**

Create `client/src/state/characters.ts`:

```typescript
import { create } from 'zustand'
import type { Character } from '../types/Character'
import type { BonusEntry } from '../types/BonusEntry'
import type { SheetSchema } from '../types/SheetSchema'

interface CharacterState {
  characters: Character[]
  activeCharacterId: string | null
  schemas: Record<string, SheetSchema>

  loadCharacters: (characters: Character[]) => void
  addCharacter: (character: Character) => void
  removeCharacter: (characterId: string) => void
  updateCharacterMeta: (characterId: string, patch: Partial<Character>) => void
  setActiveCharacter: (characterId: string | null) => void
  cacheSchema: (gameSystemId: string, schema: SheetSchema) => void

  // Server message handlers
  handleFieldsUpdated: (
    characterId: string,
    fields: Record<string, unknown>,
  ) => void
  handleBonusAdded: (
    characterId: string,
    fieldId: string,
    bonus: BonusEntry,
  ) => void
  handleBonusRemoved: (
    characterId: string,
    bonusId: string,
    fieldId: string,
  ) => void
  handleBonusUpdated: (
    characterId: string,
    fieldId: string,
    bonus: BonusEntry,
  ) => void
}

const initialState = {
  characters: [] as Character[],
  activeCharacterId: null as string | null,
  schemas: {} as Record<string, SheetSchema>,
}

export const useCharacterStore = create<CharacterState>()((set) => ({
  ...initialState,

  loadCharacters: (characters) => set({ characters }),

  addCharacter: (character) =>
    set((s) => ({
      characters: s.characters.some((c) => c.id === character.id)
        ? s.characters
        : [...s.characters, character],
    })),

  removeCharacter: (characterId) =>
    set((s) => ({
      characters: s.characters.filter((c) => c.id !== characterId),
      activeCharacterId:
        s.activeCharacterId === characterId ? null : s.activeCharacterId,
    })),

  updateCharacterMeta: (characterId, patch) =>
    set((s) => ({
      characters: s.characters.map((c) =>
        c.id === characterId ? { ...c, ...patch } : c,
      ),
    })),

  setActiveCharacter: (characterId) => set({ activeCharacterId: characterId }),

  cacheSchema: (gameSystemId, schema) =>
    set((s) => ({
      schemas: { ...s.schemas, [gameSystemId]: schema },
    })),

  handleFieldsUpdated: (characterId, fields) =>
    set((s) => ({
      characters: s.characters.map((c) =>
        c.id === characterId
          ? { ...c, fields: { ...c.fields, ...fields } }
          : c,
      ),
    })),

  handleBonusAdded: (characterId, fieldId, bonus) =>
    set((s) => ({
      characters: s.characters.map((c) => {
        if (c.id !== characterId) return c
        const existing = c.bonuses[fieldId] ?? []
        return {
          ...c,
          bonuses: { ...c.bonuses, [fieldId]: [...existing, bonus] },
        }
      }),
    })),

  handleBonusRemoved: (characterId, bonusId, fieldId) =>
    set((s) => ({
      characters: s.characters.map((c) => {
        if (c.id !== characterId) return c
        const existing = c.bonuses[fieldId] ?? []
        return {
          ...c,
          bonuses: {
            ...c.bonuses,
            [fieldId]: existing.filter((b) => b.id !== bonusId),
          },
        }
      }),
    })),

  handleBonusUpdated: (characterId, fieldId, bonus) =>
    set((s) => ({
      characters: s.characters.map((c) => {
        if (c.id !== characterId) return c
        const existing = c.bonuses[fieldId] ?? []
        return {
          ...c,
          bonuses: {
            ...c.bonuses,
            [fieldId]: existing.map((b) => (b.id === bonus.id ? bonus : b)),
          },
        }
      }),
    })),
}))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npm run test -- --run src/state/__tests__/characters.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/state/characters.ts client/src/state/__tests__/characters.test.ts
git commit -m "feat(client): add character Zustand store with bonus management"
```

---

### Task 13: Frontend — Message Dispatcher Updates

**Files:**
- Modify: `client/src/api/dispatcher.ts`

- [ ] **Step 1: Add character message handling**

Add import to `client/src/api/dispatcher.ts`:

```typescript
import { useCharacterStore } from '../state/characters';
```

Add these cases to the switch statement:

```typescript
      case 'CharacterFieldsUpdated': {
        const { character_id, fields } = msg.payload;
        useCharacterStore.getState().handleFieldsUpdated(character_id, fields);
        break;
      }
      case 'CharacterBonusAdded': {
        const { character_id, field_id, bonus } = msg.payload;
        useCharacterStore.getState().handleBonusAdded(character_id, field_id, bonus);
        break;
      }
      case 'CharacterBonusRemoved': {
        const { character_id, bonus_id, field_id } = msg.payload;
        useCharacterStore.getState().handleBonusRemoved(character_id, bonus_id, field_id);
        break;
      }
      case 'CharacterBonusUpdated': {
        const { character_id, field_id, bonus } = msg.payload;
        useCharacterStore.getState().handleBonusUpdated(character_id, field_id, bonus);
        break;
      }
      case 'TokenCharacterLinked': {
        // Token store would handle this — for now, no-op
        break;
      }
```

- [ ] **Step 2: Verify lint passes**

Run: `cd client && npm run lint`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/api/dispatcher.ts
git commit -m "feat(client): add character message routing to dispatcher"
```

---

### Task 14: Frontend — Character Sheet Components

**Files:**
- Create: `client/src/components/CharacterSheet.tsx`
- Create: `client/src/components/CharacterSheet/SheetSection.tsx`
- Create: `client/src/components/CharacterSheet/FieldWidget.tsx`
- Create: `client/src/components/CharacterSheet/BonusStackedWidget.tsx`
- Create: `client/src/components/CharacterSheet/AddBonusPopover.tsx`

This is the largest task. The implementing agent should build these components following the established patterns from `TokenInspector.tsx` (inline styles, Zustand selectors, CSS variables) and the wireframes from the design spec. Key implementation details:

- [ ] **Step 1: Create the component directory**

Run: `mkdir -p client/src/components/CharacterSheet`

- [ ] **Step 2: Write FieldWidget.tsx**

Create `client/src/components/CharacterSheet/FieldWidget.tsx` — a component that takes a `FieldDef` and a value, renders the appropriate input widget based on `field_type.type`:

- `Integer` → `<input type="number">` with min/max
- `Text` → `<input type="text">` with maxLength
- `LongText` → `<textarea>`
- `Boolean` → `<input type="checkbox">`
- `Choice` → `<select>` with options
- `AbilityScore` → number input for score + read-only modifier display
- `ResourcePool` → two number inputs (current/max) with a visual bar
- `BonusStacked` → delegate to `BonusStackedWidget`

Props: `{ field: FieldDef, value: unknown, bonuses?: BonusEntry[], bonusTypes?: BonusTypeDef[], onChange: (value: unknown) => void, onAddBonus?: (bonus) => void, onRemoveBonus?: (bonusId) => void, onUpdateBonus?: (bonusId, updates) => void }`.

Derived fields (`field.derived === true`) render as read-only with purple tint styling. Editable fields have a dashed underline in idle state, solid blue border on focus.

- [ ] **Step 3: Write BonusStackedWidget.tsx**

Create `client/src/components/CharacterSheet/BonusStackedWidget.tsx`:

- Collapsed state: shows field name and computed total, chevron to expand
- Expanded state: lists each bonus entry with source, color-coded type tag, editable value, remove button
- Derived bonus entries (where `source` indicates "From ability score" etc.) are read-only
- Suppressed entries (same non-stacking type, lower value) shown dimmed with strikethrough
- "+ Add Bonus" button at bottom triggers `AddBonusPopover`

To determine suppressed entries client-side: group entries by bonus_type, check if the type stacks (from `bonusTypes`), if not, the entry with the highest value is active, others are suppressed.

- [ ] **Step 4: Write AddBonusPopover.tsx**

Create `client/src/components/CharacterSheet/AddBonusPopover.tsx`:

- Source name text input
- Bonus type dropdown (populated from `bonusTypes` prop filtered by the field's `allowed_bonus_types`)
- Value number input
- Add/Cancel buttons
- On submit, calls `onAddBonus` callback

Use Radix `Dialog` or a simple positioned div (matching `TokenContextMenu` pattern).

- [ ] **Step 5: Write SheetSection.tsx**

Create `client/src/components/CharacterSheet/SheetSection.tsx`:

- Receives a `SheetSection` schema and field values
- Renders the section header (name)
- Based on `layout.type`:
  - `Grid` → CSS grid with `columns` columns
  - `List` → flex column
  - `Table` → HTML table with `columns` as headers
  - `Tabs` → Radix `Tabs` component, grouping fields by their `group` property into tabs
- Maps each `FieldDef` → `FieldWidget`

- [ ] **Step 6: Write CharacterSheet.tsx**

Create `client/src/components/CharacterSheet.tsx`:

- Reads `activeCharacterId` and character data from `useCharacterStore`
- Fetches schema from store (or loads via `gameSystemsApi.getSchema()` if not cached)
- Renders character header (name input, portrait, system name)
- Maps each schema section → `SheetSection`
- Handles field change: debounce 300ms, then send `UpdateCharacterFields` via `wsClient.send()`
- Handles bonus add/remove/update: send immediately via `wsClient.send()`
- Renders as a right-side panel (absolute positioned, `right: 0`, resizable width)
- Shows nothing when `activeCharacterId` is null

- [ ] **Step 7: Verify lint and build pass**

Run: `cd client && npm run lint && npm run build`
Expected: Both pass.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/CharacterSheet.tsx client/src/components/CharacterSheet/
git commit -m "feat(client): add schema-driven character sheet renderer with bonus stacking UI"
```

---

### Task 15: Frontend — Character Create Dialog & List

**Files:**
- Create: `client/src/components/CharacterCreateDialog.tsx`
- Create: `client/src/components/CharacterList.tsx`
- Modify: `client/src/pages/Campaign.tsx`

- [ ] **Step 1: Write CharacterCreateDialog.tsx**

Create `client/src/components/CharacterCreateDialog.tsx`:

- Radix `Dialog` component (follow `AssetBrowser.tsx` pattern)
- Props: `{ campaignId: string, open: boolean, onOpenChange: (open: boolean) => void }`
- Form fields: game system dropdown (from `gameSystemsApi.list()`), character name text input, portrait select (optional, from asset library)
- On submit: calls `charactersApi.create()`, adds to store, sets as active, closes dialog
- Validates: name is not empty, game system is selected

- [ ] **Step 2: Write CharacterList.tsx**

Create `client/src/components/CharacterList.tsx`:

- Reads characters from `useCharacterStore`
- Displays a list of character cards (name, system, portrait thumbnail)
- Clicking a character sets it as active (opens the sheet panel)
- "New Character" button opens the `CharacterCreateDialog`
- DM sees all characters; players see only visible ones + their own

- [ ] **Step 3: Integrate into Campaign.tsx**

In `client/src/pages/Campaign.tsx`:

- Load characters on mount: `charactersApi.list(campaignId)` → `loadCharacters()`
- Add `CharacterList` to the UI (as a collapsible panel or toolbar section)
- Add `CharacterSheet` component (renders when `activeCharacterId` is set)
- Add `CharacterCreateDialog` controlled by state

- [ ] **Step 4: Verify build**

Run: `cd client && npm run build`
Expected: Compiles.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/CharacterCreateDialog.tsx client/src/components/CharacterList.tsx client/src/pages/Campaign.tsx
git commit -m "feat(client): add character creation dialog, character list, and campaign integration"
```

---

### Task 16: Pre-Push Verification & Offline Query Data

**Files:**
- Modify: `.sqlx/` (regenerated)

- [ ] **Step 1: Backend checks**

Run from worktree root:

```bash
cargo fmt --all -- --check
SQLX_OFFLINE=true cargo clippy --workspace -- -D warnings
SQLX_OFFLINE=true cargo test --workspace
```

Expected: All pass. Fix any issues before proceeding.

- [ ] **Step 2: Frontend checks**

Run from `client/`:

```bash
npm run lint
npm run build
npm run test -- --run
```

Expected: All pass. Fix any issues before proceeding.

- [ ] **Step 3: Regenerate sqlx offline data if needed**

Run: `cargo sqlx prepare --workspace`

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "chore: fix lint/format issues and update sqlx offline data"
```

---

### Task 17: End-to-End Tests (Playwright)

**Files:**
- Create: `client/e2e/characters.spec.ts`

- [ ] **Step 1: Write e2e tests**

Create `client/e2e/characters.spec.ts` following the pattern in existing e2e tests (using `registerAndLogin` and `createCampaignAndMap` helpers):

Tests to write:
1. **Character creation** — open create dialog, fill name, submit, verify sheet opens
2. **Field editing** — change an ability score, verify modifier updates
3. **Sheet persistence** — edit a field, reload page, verify value persists
4. **Character list** — create two characters, verify both appear in list
5. **Export/import** — export a character, import into same campaign, verify new character appears

Each test should:
- Register a fresh user and create a campaign
- Interact via browser UI (not API calls)
- Assert on visible UI state

- [ ] **Step 2: Run e2e tests**

Run: `cd client && npm run test:e2e -- characters.spec.ts`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add client/e2e/characters.spec.ts
git commit -m "test(e2e): add character creation, editing, persistence, and import/export tests"
```
