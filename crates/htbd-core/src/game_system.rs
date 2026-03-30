use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use ts_rs::TS;
use uuid::Uuid;

fn default_true() -> bool {
    true
}

// --- Type aliases ---

pub type FieldValues = HashMap<String, serde_json::Value>;
pub type BonusMap = HashMap<String, Vec<BonusEntry>>;

// --- TS-exported schema types ---

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
    pub default_value: Option<serde_json::Value>,
    pub derived: bool,
    #[serde(default = "default_true")]
    pub visible: bool,
    pub group: Option<String>,
    pub width_hint: WidthHint,
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum FieldVisibility {
    Public,
    Private,
    DmOnly,
}

// --- Non-TS types ---

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

// --- GameSystem trait ---

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
    fn export_character(&self, fields: &FieldValues, bonuses: &BonusMap) -> serde_json::Value;
    fn import_character(&self, data: &serde_json::Value)
    -> Result<(FieldValues, BonusMap), String>;

    fn info(&self) -> GameSystemInfo {
        GameSystemInfo {
            id: self.id().to_string(),
            name: self.name().to_string(),
            version: self.version().to_string(),
        }
    }
}
