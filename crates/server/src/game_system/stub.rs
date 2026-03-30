use htbd_core::game_system::{
    BonusEntry, BonusMap, BonusTypeDef, CreatureSize, FieldDef, FieldType, FieldValues,
    FieldVisibility, GameSystem, InitiativeRules, SectionLayout, SheetSchema, SheetSection,
    TokenBarMapping, ValidationError, WidthHint,
};
use serde_json::json;

pub struct StubGameSystem;

impl GameSystem for StubGameSystem {
    fn id(&self) -> &str {
        "stub"
    }

    fn name(&self) -> &str {
        "Stub Game System"
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
                            default_value: Some(json!(1)),
                            derived: false,
                            visible: true,
                            group: None,
                            width_hint: WidthHint::Normal,
                        },
                        FieldDef {
                            id: "strength".to_string(),
                            name: "Strength".to_string(),
                            field_type: FieldType::AbilityScore,
                            default_value: Some(json!(10)),
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
                            default_value: Some(json!(0)),
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
                            default_value: Some(json!(10)),
                            derived: false,
                            visible: true,
                            group: None,
                            width_hint: WidthHint::Normal,
                        },
                        FieldDef {
                            id: "hp_max".to_string(),
                            name: "Max HP".to_string(),
                            field_type: FieldType::Integer {
                                min: Some(0),
                                max: None,
                            },
                            default_value: Some(json!(10)),
                            derived: false,
                            visible: true,
                            group: None,
                            width_hint: WidthHint::Normal,
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
                        default_value: Some(json!(10)),
                        derived: true,
                        visible: true,
                        group: None,
                        width_hint: WidthHint::Normal,
                    }],
                },
            ],
            bonus_types: self.bonus_types(),
        }
    }

    fn compute_derived(&self, fields: &FieldValues, bonuses: &BonusMap) -> FieldValues {
        let mut derived = FieldValues::new();

        // str_mod = floor((strength - 10) / 2)
        if let Some(strength) = fields.get("strength").and_then(|v| v.as_i64()) {
            let str_mod = (strength - 10).div_euclid(2);
            derived.insert("str_mod".to_string(), json!(str_mod));
        }

        // armor_class = 10 + stacking bonuses
        let ac_bonuses = bonuses
            .get("armor_class")
            .map(|v| v.as_slice())
            .unwrap_or(&[]);
        let ac_bonus_total = self.apply_stacking("armor_class", ac_bonuses);
        derived.insert("armor_class".to_string(), json!(10 + ac_bonus_total));

        derived
    }

    fn validate_fields(&self, fields: &FieldValues) -> Vec<ValidationError> {
        let mut errors = Vec::new();

        if let Some(level) = fields.get("level").and_then(|v| v.as_i64())
            && !(1..=20).contains(&level)
        {
            errors.push(ValidationError {
                field_id: "level".to_string(),
                message: "Level must be between 1 and 20".to_string(),
            });
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
        let bonus_type_defs = self.bonus_types();
        let stacking_map: std::collections::HashMap<&str, bool> = bonus_type_defs
            .iter()
            .map(|bt| (bt.id.as_str(), bt.stacks))
            .collect();

        // Group bonuses by type
        let mut by_type: std::collections::HashMap<&str, Vec<i64>> =
            std::collections::HashMap::new();
        for bonus in bonuses {
            by_type
                .entry(bonus.bonus_type.as_str())
                .or_default()
                .push(bonus.value);
        }

        // For stacking types: sum all; for non-stacking types: take highest
        by_type
            .iter()
            .map(|(bonus_type, values)| {
                let stacks = stacking_map.get(bonus_type).copied().unwrap_or(false);
                if stacks {
                    values.iter().sum()
                } else {
                    values.iter().copied().max().unwrap_or(0)
                }
            })
            .sum()
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
        fields.insert("level".to_string(), json!(1));
        fields.insert("strength".to_string(), json!(10));
        fields.insert("str_mod".to_string(), json!(0));
        fields.insert("hp_current".to_string(), json!(10));
        fields.insert("hp_max".to_string(), json!(10));
        fields.insert("armor_class".to_string(), json!(10));
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

    fn export_character(&self, fields: &FieldValues, bonuses: &BonusMap) -> serde_json::Value {
        json!({
            "format": "htbd-character-v1",
            "game_system": self.id(),
            "fields": fields,
            "bonuses": bonuses,
        })
    }

    fn import_character(
        &self,
        data: &serde_json::Value,
    ) -> Result<(FieldValues, BonusMap), String> {
        let format = data
            .get("format")
            .and_then(|v| v.as_str())
            .ok_or("Missing format field")?;

        if format != "htbd-character-v1" {
            return Err(format!("Unsupported format: {format}"));
        }

        let fields: FieldValues = data
            .get("fields")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

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
    use uuid::Uuid;

    fn make_bonus(bonus_type: &str, value: i64) -> BonusEntry {
        BonusEntry {
            id: Uuid::new_v4(),
            source: "test".to_string(),
            bonus_type: bonus_type.to_string(),
            value,
        }
    }

    #[test]
    fn test_compute_derived_str_modifier() {
        let system = StubGameSystem;
        let mut fields = FieldValues::new();
        fields.insert("strength".to_string(), json!(16));
        let derived = system.compute_derived(&fields, &BonusMap::new());
        assert_eq!(derived["str_mod"], json!(3));
    }

    #[test]
    fn test_compute_derived_str_modifier_odd() {
        let system = StubGameSystem;
        let mut fields = FieldValues::new();
        fields.insert("strength".to_string(), json!(15));
        let derived = system.compute_derived(&fields, &BonusMap::new());
        assert_eq!(derived["str_mod"], json!(2));
    }

    #[test]
    fn test_bonus_stacking_non_stacking_takes_highest() {
        let system = StubGameSystem;
        let bonuses = vec![make_bonus("armor", 8), make_bonus("armor", 3)];
        let result = system.apply_stacking("armor_class", &bonuses);
        assert_eq!(result, 8);
    }

    #[test]
    fn test_bonus_stacking_dodge_stacks() {
        let system = StubGameSystem;
        let bonuses = vec![make_bonus("dodge", 1), make_bonus("dodge", 1)];
        let result = system.apply_stacking("armor_class", &bonuses);
        assert_eq!(result, 2);
    }

    #[test]
    fn test_bonus_stacking_mixed_types() {
        let system = StubGameSystem;
        let bonuses = vec![
            make_bonus("armor", 8),
            make_bonus("shield", 2),
            make_bonus("dodge", 1),
        ];
        let result = system.apply_stacking("armor_class", &bonuses);
        assert_eq!(result, 11);
    }

    #[test]
    fn test_ac_with_bonuses() {
        let system = StubGameSystem;
        let fields = system.default_fields();
        let mut bonuses = BonusMap::new();
        bonuses.insert(
            "armor_class".to_string(),
            vec![make_bonus("armor", 2)], // leather armor +2
        );
        let derived = system.compute_derived(&fields, &bonuses);
        assert_eq!(derived["armor_class"], json!(12));
    }

    #[test]
    fn test_export_import_roundtrip() {
        let system = StubGameSystem;
        let mut fields = system.default_fields();
        fields.insert("strength".to_string(), json!(14));
        let bonuses = BonusMap::new();

        let exported = system.export_character(&fields, &bonuses);
        let (imported_fields, _) = system.import_character(&exported).unwrap();

        assert_eq!(imported_fields["strength"], json!(14));
    }

    #[test]
    fn test_validation_level_bounds() {
        let system = StubGameSystem;
        let mut fields = FieldValues::new();
        fields.insert("level".to_string(), json!(25));
        let errors = system.validate_fields(&fields);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].field_id, "level");
    }
}
