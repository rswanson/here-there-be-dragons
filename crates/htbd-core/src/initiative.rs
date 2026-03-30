use chrono::{DateTime, Utc};
use rand::RngExt;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Encounter {
    pub id: Uuid,
    pub campaign_id: Uuid,
    pub active: bool,
    pub current_turn_index: i32,
    pub round_number: i32,
    pub combatants: Vec<Combatant>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Combatant {
    pub id: Uuid,
    pub encounter_id: Uuid,
    pub character_id: Option<Uuid>,
    pub name: String,
    pub initiative_value: i32,
    pub sort_order: i32,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct StartEncounterRequest {
    pub combatants: Vec<NewCombatant>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct NewCombatant {
    pub character_id: Option<Uuid>,
    pub name: String,
    pub initiative_value: i32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiceExpression {
    pub count: u32,
    pub sides: u32,
    pub modifier: i32,
}

/// Parse a dice expression like "NdM", "NdM + C", or "NdM - C" (spaces optional).
/// Returns None for invalid expressions (zero count, zero sides, or bad format).
pub fn parse_dice_expression(input: &str) -> Option<DiceExpression> {
    let input = input.trim();

    // Split on 'd' or 'D'
    let d_pos = input.to_lowercase().find('d')?;
    let count_str = &input[..d_pos];
    let rest = &input[d_pos + 1..];

    let count: u32 = count_str.trim().parse().ok()?;
    if count == 0 {
        return None;
    }

    // rest may be "M", "M + C", "M+C", "M - C", "M-C"
    // Find if there's a + or - after the sides number
    // Be careful: the sides part is purely digits, then optional modifier
    let rest = rest.trim();

    // Find the modifier separator — look for + or - that is not at position 0
    // (position 0 would be a sign for the sides number itself, which we don't support)
    let modifier_pos = rest[1..].find(['+', '-']).map(|p| p + 1);

    let (sides_str, modifier) = if let Some(pos) = modifier_pos {
        let sides_str = &rest[..pos];
        let mod_str = rest[pos..].trim();
        let modifier: i32 = mod_str.replace(' ', "").parse().ok()?;
        (sides_str, modifier)
    } else {
        (rest, 0)
    };

    let sides: u32 = sides_str.trim().parse().ok()?;
    if sides == 0 {
        return None;
    }

    Some(DiceExpression {
        count,
        sides,
        modifier,
    })
}

/// Roll dice according to the expression and return the total.
pub fn roll_dice(expr: &DiceExpression) -> i32 {
    let mut rng = rand::rng();
    let mut total: i32 = 0;
    for _ in 0..expr.count {
        total += rng.random_range(1..=expr.sides as i32);
    }
    total + expr.modifier
}

/// Roll initiative for a character given a roll expression (e.g. "1d20 + @dex_mod")
/// and a character modifier value. The variable part (@...) is replaced by character_modifier.
/// Returns None if the expression cannot be parsed.
pub fn roll_initiative(roll_expression: &str, character_modifier: i32) -> Option<i32> {
    // Strip variable parts like "@dex_mod" — find the NdM portion
    // Strategy: find "NdM" pattern, then handle the rest as a modifier,
    // substituting character_modifier for any @variable.

    let input = roll_expression.trim();

    // Find 'd' to locate the dice portion
    let d_pos = input.to_lowercase().find('d')?;

    // Walk backwards from d_pos to find start of count digits
    let count_start = input[..d_pos]
        .rfind(|c: char| !c.is_ascii_digit())
        .map(|p| p + 1)
        .unwrap_or(0);

    let count_str = &input[count_start..d_pos];
    let count: u32 = count_str.trim().parse().ok()?;
    if count == 0 {
        return None;
    }

    // Walk forward from d_pos+1 to collect digits for sides
    let after_d = &input[d_pos + 1..];
    let sides_len = after_d
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(after_d.len());
    let sides_str = &after_d[..sides_len];
    let sides: u32 = sides_str.trim().parse().ok()?;
    if sides == 0 {
        return None;
    }

    // Everything after the dice expression is the modifier part
    let modifier_part = after_d[sides_len..].trim();

    // Determine overall modifier: sum any numeric modifiers + substitute character_modifier for @vars
    let modifier = if modifier_part.is_empty() {
        0
    } else {
        parse_modifier_with_variable(modifier_part, character_modifier)?
    };

    let expr = DiceExpression {
        count,
        sides,
        modifier,
    };

    Some(roll_dice(&expr))
}

/// Parse a modifier string that may contain numeric values and @variable references.
/// @variable is replaced by character_modifier.
fn parse_modifier_with_variable(s: &str, character_modifier: i32) -> Option<i32> {
    let mut total: i32 = 0;
    // Tokenize by + and -, preserving sign
    // We'll iterate through sign+token pairs
    let s = s.trim();
    if s.is_empty() {
        return Some(0);
    }

    // Split keeping signs: we process token by token
    // Prepend '+' if it doesn't start with a sign for uniform processing
    let normalized = if s.starts_with('+') || s.starts_with('-') {
        s.to_string()
    } else {
        format!("+{}", s)
    };

    let mut remaining = normalized.as_str();
    while !remaining.is_empty() {
        // Extract sign
        let sign = if remaining.starts_with('-') { -1 } else { 1 };
        remaining = remaining[1..].trim_start();

        // Extract token (digits or @word)
        if remaining.starts_with('@') {
            // Variable: skip '@' then consume alphanumeric/underscore chars
            let after_at = &remaining[1..];
            let name_end = after_at
                .find(|c: char| !c.is_alphanumeric() && c != '_')
                .unwrap_or(after_at.len());
            remaining = after_at[name_end..].trim_start();
            total += sign * character_modifier;
        } else {
            // Numeric
            let end = remaining
                .find(|c: char| !c.is_ascii_digit())
                .unwrap_or(remaining.len());
            if end == 0 {
                return None;
            }
            let val: i32 = remaining[..end].parse().ok()?;
            remaining = remaining[end..].trim_start();
            total += sign * val;
        }

        // Skip next sign character
        remaining = remaining.trim_start();
    }

    Some(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_1d20() {
        let expr = parse_dice_expression("1d20").unwrap();
        assert_eq!(expr.count, 1);
        assert_eq!(expr.sides, 20);
        assert_eq!(expr.modifier, 0);
    }

    #[test]
    fn test_parse_1d20_plus_3() {
        let expr = parse_dice_expression("1d20 + 3").unwrap();
        assert_eq!(expr.count, 1);
        assert_eq!(expr.sides, 20);
        assert_eq!(expr.modifier, 3);
    }

    #[test]
    fn test_parse_1d20_minus_1() {
        let expr = parse_dice_expression("1d20 - 1").unwrap();
        assert_eq!(expr.count, 1);
        assert_eq!(expr.sides, 20);
        assert_eq!(expr.modifier, -1);
    }

    #[test]
    fn test_parse_2d6_plus_5() {
        let expr = parse_dice_expression("2d6 + 5").unwrap();
        assert_eq!(expr.count, 2);
        assert_eq!(expr.sides, 6);
        assert_eq!(expr.modifier, 5);
    }

    #[test]
    fn test_parse_no_spaces() {
        let expr = parse_dice_expression("1d20+3").unwrap();
        assert_eq!(expr.count, 1);
        assert_eq!(expr.sides, 20);
        assert_eq!(expr.modifier, 3);
    }

    #[test]
    fn test_parse_invalid() {
        assert!(parse_dice_expression("hello").is_none());
        assert!(parse_dice_expression("0d20").is_none());
        assert!(parse_dice_expression("1d0").is_none());
        assert!(parse_dice_expression("").is_none());
    }

    #[test]
    fn test_roll_dice_range() {
        let expr = DiceExpression {
            count: 1,
            sides: 20,
            modifier: 3,
        };
        for _ in 0..100 {
            let result = roll_dice(&expr);
            assert!(
                (4..=23).contains(&result),
                "roll_dice result {} out of range 4..=23",
                result
            );
        }
    }

    #[test]
    fn test_roll_initiative_with_variable() {
        for _ in 0..100 {
            let result = roll_initiative("1d20 + @dex_mod", 3).unwrap();
            assert!(
                (4..=23).contains(&result),
                "roll_initiative result {} out of range 4..=23",
                result
            );
        }
    }

    #[test]
    fn test_roll_initiative_unparseable() {
        assert!(roll_initiative("not a dice expression", 3).is_none());
    }
}
