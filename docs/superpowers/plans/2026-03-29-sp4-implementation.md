# SP-4: Chat, Handouts & Initiative — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build real-time text chat with character attribution and whispers, markdown handouts with visibility controls, and a floating initiative tracker with a simple dice roller — plus restructure the sidebar into a tabbed layout.

**Architecture:** Chat messages flow through WebSocket for real-time delivery and are persisted to PostgreSQL. Whispers are filtered server-side (never sent to unintended clients). Handouts use REST CRUD with WebSocket notifications for list updates. Initiative state syncs fully via WebSocket. A simple `NdM ± C` dice roller handles initiative rolls until SP-7 delivers the full DSL. The sidebar is restructured using Radix Tabs into Campaign/Chat/Chars/Docs tabs, with the initiative tracker as a floating canvas panel.

**Tech Stack:** Rust (Axum routes, sqlx queries, WebSocket handlers), PostgreSQL, React + TypeScript (Zustand stores, Radix Tabs, markdown rendering), `@radix-ui/react-tabs` (already installed).

---

## File Map

### Backend — New Files

| File | Responsibility |
|------|---------------|
| `crates/htbd-core/src/chat.rs` | `ChatMessage`, `SendChatMessageRequest`, `ChatMessageType` types |
| `crates/htbd-core/src/handout.rs` | `Handout`, `HandoutSummary`, `CreateHandoutRequest`, `UpdateHandoutRequest`, `HandoutVisibility` types |
| `crates/htbd-core/src/initiative.rs` | `Encounter`, `Combatant`, `InitiativeState` types, simple dice roller |
| `crates/db/src/chat_messages.rs` | Chat message persistence and paginated queries |
| `crates/db/src/handouts.rs` | Handout CRUD queries with visibility filtering |
| `crates/db/src/initiative.rs` | Initiative encounter + combatant queries |
| `crates/server/src/routes/chat.rs` | Chat REST endpoints (history loading) + WS handler |
| `crates/server/src/routes/handouts.rs` | Handout CRUD REST endpoints |
| `crates/server/src/routes/initiative.rs` | Initiative WS handlers (extracted for clarity, called from ws.rs) |
| `migrations/006_chat_handouts_initiative.sql` | All three tables in one migration |

### Backend — Modified Files

| File | Changes |
|------|---------|
| `crates/htbd-core/src/lib.rs` | Add `pub mod chat; pub mod handout; pub mod initiative;` + ts-rs exports |
| `crates/htbd-core/src/messages.rs` | Add chat, handout notification, and initiative WS message variants |
| `crates/db/src/lib.rs` | Add `pub mod chat_messages; pub mod handouts; pub mod initiative;` |
| `crates/server/src/routes/mod.rs` | Mount chat and handout routes |
| `crates/server/src/routes/ws.rs` | Add chat + initiative message handlers |

### Frontend — New Files

| File | Responsibility |
|------|---------------|
| `client/src/types/ChatMessage.ts` | Generated chat message types |
| `client/src/types/Handout.ts` | Generated handout types |
| `client/src/types/Encounter.ts` | Generated initiative types |
| `client/src/api/chat.ts` | Chat REST client (message history) |
| `client/src/api/handouts.ts` | Handout CRUD REST client |
| `client/src/state/chat.ts` | Zustand chat store (messages, sending) |
| `client/src/state/__tests__/chat.test.ts` | Chat store unit tests |
| `client/src/state/handouts.ts` | Zustand handout store |
| `client/src/state/__tests__/handouts.test.ts` | Handout store unit tests |
| `client/src/state/initiative.ts` | Zustand initiative store |
| `client/src/state/__tests__/initiative.test.ts` | Initiative store unit tests |
| `client/src/components/SidebarTabs.tsx` | Radix Tabs wrapper for sidebar |
| `client/src/components/CampaignTab.tsx` | Campaign tab content (existing sidebar content extracted) |
| `client/src/components/ChatTab.tsx` | Chat tab with message list + input |
| `client/src/components/ChatMessage.tsx` | Individual message renderer (handles all message types) |
| `client/src/components/ChatInput.tsx` | Message input with character selector + command parsing |
| `client/src/components/DocsTab.tsx` | Handout list + viewer/editor |
| `client/src/components/HandoutEditor.tsx` | Markdown editor with preview pane |
| `client/src/components/InitiativePanel.tsx` | Floating initiative tracker panel |

### Frontend — Modified Files

| File | Changes |
|------|---------|
| `client/src/api/dispatcher.ts` | Add chat, handout, and initiative message handlers |
| `client/src/pages/Campaign.tsx` | Replace sidebar with SidebarTabs, add InitiativePanel, load chat/handouts on mount |

---

## Task Breakdown

### Task 1: Database Migration

**Files:**
- Create: `migrations/006_chat_handouts_initiative.sql`

- [ ] **Step 1: Write the migration**

```sql
-- migrations/006_chat_handouts_initiative.sql

-- ── Chat messages ───────────────────────────────────────────────────

CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL REFERENCES users(id),
    character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
    message_type TEXT NOT NULL,  -- 'character', 'ooc', 'emote', 'whisper', 'system'
    content TEXT NOT NULL,
    whisper_target_ids UUID[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_campaign ON chat_messages(campaign_id, created_at);
CREATE INDEX idx_chat_messages_campaign_recent ON chat_messages(campaign_id, created_at DESC);

-- ── Handouts ────────────────────────────────────────────────────────

CREATE TABLE handouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    visibility TEXT NOT NULL DEFAULT 'dm_only',  -- 'everyone', 'dm_only', 'specific_players'
    player_ids UUID[] NOT NULL DEFAULT '{}',
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_handouts_campaign ON handouts(campaign_id);

-- ── Initiative tracker ──────────────────────────────────────────────

CREATE TABLE initiative_encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    active BOOLEAN NOT NULL DEFAULT true,
    current_turn_index INTEGER NOT NULL DEFAULT 0,
    round_number INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_initiative_encounters_campaign ON initiative_encounters(campaign_id);

CREATE TABLE initiative_combatants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES initiative_encounters(id) ON DELETE CASCADE,
    character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    initiative_value INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_initiative_combatants_encounter ON initiative_combatants(encounter_id);
```

- [ ] **Step 2: Commit**

```bash
git add migrations/006_chat_handouts_initiative.sql
git commit -m "feat(db): add chat, handout, and initiative tables (migration 006)"
```

---

### Task 2: Core Types — Chat

**Files:**
- Create: `crates/htbd-core/src/chat.rs`
- Modify: `crates/htbd-core/src/lib.rs`

- [ ] **Step 1: Write chat types**

Create `crates/htbd-core/src/chat.rs`:

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum ChatMessageType {
    Character,
    Ooc,
    Emote,
    Whisper,
    System,
}

impl std::fmt::Display for ChatMessageType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Character => write!(f, "character"),
            Self::Ooc => write!(f, "ooc"),
            Self::Emote => write!(f, "emote"),
            Self::Whisper => write!(f, "whisper"),
            Self::System => write!(f, "system"),
        }
    }
}

impl std::str::FromStr for ChatMessageType {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "character" => Ok(Self::Character),
            "ooc" => Ok(Self::Ooc),
            "emote" => Ok(Self::Emote),
            "whisper" => Ok(Self::Whisper),
            "system" => Ok(Self::System),
            _ => Err(format!("Unknown chat message type: {s}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ChatMessage {
    pub id: Uuid,
    pub campaign_id: Uuid,
    pub sender_user_id: Uuid,
    pub sender_display_name: String,
    pub character_id: Option<Uuid>,
    pub character_name: Option<String>,
    pub message_type: ChatMessageType,
    pub content: String,
    pub whisper_target_ids: Vec<Uuid>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SendChatMessageRequest {
    pub character_id: Option<Uuid>,
    pub message_type: ChatMessageType,
    pub content: String,
    #[serde(default)]
    pub whisper_target_ids: Vec<Uuid>,
}
```

- [ ] **Step 2: Add module to lib.rs and ts-rs exports**

Add `pub mod chat;` to `crates/htbd-core/src/lib.rs`.

Add to `export_bindings()` test:

```rust
        // Chat
        chat::ChatMessage::export_all(&cfg).unwrap();
        chat::ChatMessageType::export_all(&cfg).unwrap();
        chat::SendChatMessageRequest::export_all(&cfg).unwrap();
```

- [ ] **Step 3: Build and test**

Run: `cargo test -p htbd-core`
Expected: Compiles, bindings generated.

- [ ] **Step 4: Commit**

```bash
git add crates/htbd-core/src/chat.rs crates/htbd-core/src/lib.rs client/src/types/
git commit -m "feat(core): add ChatMessage types and TypeScript bindings"
```

---

### Task 3: Core Types — Handout

**Files:**
- Create: `crates/htbd-core/src/handout.rs`
- Modify: `crates/htbd-core/src/lib.rs`

- [ ] **Step 1: Write handout types**

Create `crates/htbd-core/src/handout.rs`:

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum HandoutVisibility {
    Everyone,
    DmOnly,
    SpecificPlayers,
}

impl std::fmt::Display for HandoutVisibility {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Everyone => write!(f, "everyone"),
            Self::DmOnly => write!(f, "dm_only"),
            Self::SpecificPlayers => write!(f, "specific_players"),
        }
    }
}

impl std::str::FromStr for HandoutVisibility {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "everyone" => Ok(Self::Everyone),
            "dm_only" => Ok(Self::DmOnly),
            "specific_players" => Ok(Self::SpecificPlayers),
            _ => Err(format!("Unknown visibility: {s}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Handout {
    pub id: Uuid,
    pub campaign_id: Uuid,
    pub title: String,
    pub content: String,
    pub visibility: HandoutVisibility,
    pub player_ids: Vec<Uuid>,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Lightweight version for list views and WS notifications (no content).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct HandoutSummary {
    pub id: Uuid,
    pub title: String,
    pub visibility: HandoutVisibility,
    pub player_ids: Vec<Uuid>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CreateHandoutRequest {
    pub title: String,
    #[serde(default)]
    pub content: String,
    #[serde(default = "default_dm_only")]
    pub visibility: HandoutVisibility,
    #[serde(default)]
    pub player_ids: Vec<Uuid>,
}

fn default_dm_only() -> HandoutVisibility {
    HandoutVisibility::DmOnly
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct UpdateHandoutRequest {
    pub title: Option<String>,
    pub content: Option<String>,
    pub visibility: Option<HandoutVisibility>,
    pub player_ids: Option<Vec<Uuid>>,
}
```

- [ ] **Step 2: Add module and ts-rs exports**

Add `pub mod handout;` to lib.rs. Add exports:

```rust
        // Handout
        handout::Handout::export_all(&cfg).unwrap();
        handout::HandoutSummary::export_all(&cfg).unwrap();
        handout::HandoutVisibility::export_all(&cfg).unwrap();
        handout::CreateHandoutRequest::export_all(&cfg).unwrap();
        handout::UpdateHandoutRequest::export_all(&cfg).unwrap();
```

- [ ] **Step 3: Build, test, commit**

Run: `cargo test -p htbd-core`

```bash
git add crates/htbd-core/src/handout.rs crates/htbd-core/src/lib.rs client/src/types/
git commit -m "feat(core): add Handout types and TypeScript bindings"
```

---

### Task 4: Core Types — Initiative & Simple Dice Roller

**Files:**
- Create: `crates/htbd-core/src/initiative.rs`
- Modify: `crates/htbd-core/src/lib.rs`

- [ ] **Step 1: Write initiative types and dice roller**

Create `crates/htbd-core/src/initiative.rs`:

```rust
use chrono::{DateTime, Utc};
use rand::Rng;
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

// ── Simple dice roller ──────────────────────────────────────────────

/// A parsed simple dice expression: NdM + C or NdM - C
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiceExpression {
    pub count: u32,
    pub sides: u32,
    pub modifier: i32,
}

/// Parse a simple dice expression like "1d20", "1d20 + 3", "2d6 - 1".
/// Returns None if the expression doesn't match the simple pattern.
pub fn parse_dice_expression(input: &str) -> Option<DiceExpression> {
    let s = input.replace(' ', "");
    // Match NdM, NdM+C, NdM-C
    let d_pos = s.find('d')?;
    let count: u32 = s[..d_pos].parse().ok()?;
    if count == 0 {
        return None;
    }

    let rest = &s[d_pos + 1..];

    // Find + or - after the sides
    let (sides_str, modifier) = if let Some(plus_pos) = rest.find('+') {
        let sides: u32 = rest[..plus_pos].parse().ok()?;
        let modifier: i32 = rest[plus_pos + 1..].parse().ok()?;
        (sides, modifier)
    } else if let Some(minus_pos) = rest.rfind('-') {
        // rfind to handle negative modifiers, but we need the minus after digits
        if minus_pos == 0 {
            return None; // Negative sides not allowed
        }
        let sides: u32 = rest[..minus_pos].parse().ok()?;
        let modifier: i32 = rest[minus_pos..].parse().ok()?; // includes the minus sign
        (sides, modifier)
    } else {
        let sides: u32 = rest.parse().ok()?;
        (sides, 0)
    };

    if sides == 0 {
        return None;
    }

    Some(DiceExpression {
        count,
        sides,
        modifier,
    })
}

/// Roll a dice expression and return the total.
pub fn roll_dice(expr: &DiceExpression) -> i32 {
    let mut rng = rand::rng();
    let mut total = 0i32;
    for _ in 0..expr.count {
        total += rng.random_range(1..=expr.sides as i32);
    }
    total + expr.modifier
}

/// Roll initiative for a combatant: parse the game system's roll expression,
/// substitute the modifier from the character's fields, and return the result.
/// Returns None if the expression can't be parsed.
pub fn roll_initiative(roll_expression: &str, character_modifier: i32) -> Option<i32> {
    // The roll_expression from GameSystem is like "1d20 + @dex_mod".
    // For the simple roller, we replace the variable part with the actual modifier.
    // Strip everything after the dice part and add the modifier.
    let s = roll_expression.replace(' ', "");
    let d_pos = s.find('d')?;

    // Find where the dice sides end (first non-digit after 'd')
    let sides_end = s[d_pos + 1..]
        .find(|c: char| !c.is_ascii_digit())
        .map(|p| d_pos + 1 + p)
        .unwrap_or(s.len());

    let count: u32 = s[..d_pos].parse().ok()?;
    let sides: u32 = s[d_pos + 1..sides_end].parse().ok()?;

    if count == 0 || sides == 0 {
        return None;
    }

    let expr = DiceExpression {
        count,
        sides,
        modifier: character_modifier,
    };
    Some(roll_dice(&expr))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_expression() {
        let expr = parse_dice_expression("1d20").unwrap();
        assert_eq!(expr, DiceExpression { count: 1, sides: 20, modifier: 0 });
    }

    #[test]
    fn test_parse_with_positive_modifier() {
        let expr = parse_dice_expression("1d20 + 3").unwrap();
        assert_eq!(expr, DiceExpression { count: 1, sides: 20, modifier: 3 });
    }

    #[test]
    fn test_parse_with_negative_modifier() {
        let expr = parse_dice_expression("1d20 - 1").unwrap();
        assert_eq!(expr, DiceExpression { count: 1, sides: 20, modifier: -1 });
    }

    #[test]
    fn test_parse_multi_dice() {
        let expr = parse_dice_expression("2d6 + 5").unwrap();
        assert_eq!(expr, DiceExpression { count: 2, sides: 6, modifier: 5 });
    }

    #[test]
    fn test_parse_no_spaces() {
        let expr = parse_dice_expression("1d20+3").unwrap();
        assert_eq!(expr, DiceExpression { count: 1, sides: 20, modifier: 3 });
    }

    #[test]
    fn test_parse_invalid_returns_none() {
        assert!(parse_dice_expression("hello").is_none());
        assert!(parse_dice_expression("0d20").is_none());
        assert!(parse_dice_expression("1d0").is_none());
        assert!(parse_dice_expression("").is_none());
    }

    #[test]
    fn test_roll_dice_in_range() {
        let expr = DiceExpression { count: 1, sides: 20, modifier: 3 };
        for _ in 0..100 {
            let result = roll_dice(&expr);
            assert!(result >= 4 && result <= 23, "Result {result} out of range");
        }
    }

    #[test]
    fn test_roll_initiative_simple() {
        // "1d20 + @dex_mod" with modifier 3 should produce 4-23
        for _ in 0..100 {
            let result = roll_initiative("1d20 + @dex_mod", 3).unwrap();
            assert!(result >= 4 && result <= 23, "Result {result} out of range");
        }
    }

    #[test]
    fn test_roll_initiative_unparseable() {
        assert!(roll_initiative("complex(@str + @dex)", 0).is_none());
    }
}
```

- [ ] **Step 2: Add module, ts-rs exports, build, test**

Add `pub mod initiative;` to lib.rs. Add exports:

```rust
        // Initiative
        initiative::Encounter::export_all(&cfg).unwrap();
        initiative::Combatant::export_all(&cfg).unwrap();
        initiative::StartEncounterRequest::export_all(&cfg).unwrap();
        initiative::NewCombatant::export_all(&cfg).unwrap();
```

Run: `cargo test -p htbd-core`
Expected: All tests pass including the 9 dice roller tests.

- [ ] **Step 3: Commit**

```bash
git add crates/htbd-core/src/initiative.rs crates/htbd-core/src/lib.rs client/src/types/
git commit -m "feat(core): add Initiative types, simple dice roller with tests"
```

---

### Task 5: Core Types — WebSocket Messages

**Files:**
- Modify: `crates/htbd-core/src/messages.rs`

- [ ] **Step 1: Add imports and message variants**

Add imports:

```rust
use crate::chat::{ChatMessage, SendChatMessageRequest};
use crate::handout::HandoutSummary;
use crate::initiative::{Combatant, Encounter, NewCombatant};
```

Add to `ClientMessage`:

```rust
    // Chat
    SendChatMessage {
        character_id: Option<Uuid>,
        message_type: String,
        content: String,
        whisper_target_ids: Vec<Uuid>,
    },

    // Initiative (DM only)
    StartEncounter {
        combatants: Vec<NewCombatant>,
    },
    AddCombatant {
        encounter_id: Uuid,
        character_id: Option<Uuid>,
        name: String,
        initiative_value: i32,
    },
    RemoveCombatant {
        combatant_id: Uuid,
    },
    UpdateCombatantInitiative {
        combatant_id: Uuid,
        initiative_value: i32,
    },
    RollAllInitiative {
        encounter_id: Uuid,
    },
    RollCombatantInitiative {
        combatant_id: Uuid,
    },
    NextTurn {
        encounter_id: Uuid,
    },
    PreviousTurn {
        encounter_id: Uuid,
    },
    EndEncounter {
        encounter_id: Uuid,
    },
```

Add to `ServerMessage`:

```rust
    // Chat
    ChatMessageReceived {
        message: ChatMessage,
    },

    // Handout notifications
    HandoutCreated {
        handout: HandoutSummary,
    },
    HandoutUpdated {
        handout: HandoutSummary,
    },
    HandoutDeleted {
        handout_id: Uuid,
    },

    // Initiative
    EncounterStarted {
        encounter: Encounter,
    },
    CombatantAdded {
        combatant: Combatant,
    },
    CombatantRemoved {
        combatant_id: Uuid,
    },
    CombatantInitiativeUpdated {
        combatant_id: Uuid,
        initiative_value: i32,
        sort_order: i32,
    },
    AllInitiativeRolled {
        combatants: Vec<Combatant>,
    },
    TurnAdvanced {
        current_turn_index: i32,
        round_number: i32,
    },
    EncounterEnded {
        encounter_id: Uuid,
    },
```

- [ ] **Step 2: Build and regenerate bindings**

Run: `cargo test -p htbd-core`

- [ ] **Step 3: Commit**

```bash
git add crates/htbd-core/src/messages.rs client/src/types/
git commit -m "feat(core): add chat, handout, and initiative WebSocket message variants"
```

---

### Task 6: Database — Chat Message Repository

**Files:**
- Create: `crates/db/src/chat_messages.rs`
- Modify: `crates/db/src/lib.rs`

- [ ] **Step 1: Write chat message queries**

Create `crates/db/src/chat_messages.rs`:

```rust
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

pub struct ChatMessageRow {
    pub id: Uuid,
    pub campaign_id: Uuid,
    pub sender_user_id: Uuid,
    pub character_id: Option<Uuid>,
    pub message_type: String,
    pub content: String,
    pub whisper_target_ids: Vec<Uuid>,
    pub created_at: DateTime<Utc>,
}

pub async fn insert_message(
    pool: &PgPool,
    campaign_id: &Uuid,
    sender_user_id: &Uuid,
    character_id: Option<&Uuid>,
    message_type: &str,
    content: &str,
    whisper_target_ids: &[Uuid],
) -> Result<ChatMessageRow, sqlx::Error> {
    sqlx::query_as!(
        ChatMessageRow,
        r#"INSERT INTO chat_messages (campaign_id, sender_user_id, character_id, message_type, content, whisper_target_ids)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *"#,
        campaign_id,
        sender_user_id,
        character_id,
        message_type,
        content,
        whisper_target_ids,
    )
    .fetch_one(pool)
    .await
}

/// Get the most recent N messages for a campaign (for initial page load).
/// Excludes whispers not addressed to the requesting user.
pub async fn get_recent_messages(
    pool: &PgPool,
    campaign_id: &Uuid,
    user_id: &Uuid,
    limit: i64,
) -> Result<Vec<ChatMessageRow>, sqlx::Error> {
    sqlx::query_as!(
        ChatMessageRow,
        r#"SELECT * FROM chat_messages
           WHERE campaign_id = $1
             AND (message_type != 'whisper'
                  OR sender_user_id = $2
                  OR $2 = ANY(whisper_target_ids))
           ORDER BY created_at DESC
           LIMIT $3"#,
        campaign_id,
        user_id,
        limit,
    )
    .fetch_all(pool)
    .await
}

/// Get messages older than a given message ID (cursor-based pagination).
pub async fn get_messages_before(
    pool: &PgPool,
    campaign_id: &Uuid,
    user_id: &Uuid,
    before_id: &Uuid,
    limit: i64,
) -> Result<Vec<ChatMessageRow>, sqlx::Error> {
    sqlx::query_as!(
        ChatMessageRow,
        r#"SELECT m.* FROM chat_messages m
           WHERE m.campaign_id = $1
             AND m.created_at < (SELECT created_at FROM chat_messages WHERE id = $2)
             AND (m.message_type != 'whisper'
                  OR m.sender_user_id = $3
                  OR $3 = ANY(m.whisper_target_ids))
           ORDER BY m.created_at DESC
           LIMIT $4"#,
        campaign_id,
        before_id,
        user_id,
        limit,
    )
    .fetch_all(pool)
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn setup_campaign(pool: &PgPool) -> (Uuid, Uuid) {
        let user = crate::users::create_user(pool, "chat@test.com", "hash", "Chat Tester")
            .await
            .unwrap();
        let campaign = crate::campaigns::create_campaign(pool, "Chat Test", user.id, "CHAT01")
            .await
            .unwrap();
        (campaign.id, user.id)
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_insert_and_get_messages(pool: PgPool) {
        let (campaign_id, user_id) = setup_campaign(&pool).await;
        insert_message(&pool, &campaign_id, &user_id, None, "ooc", "Hello!", &[])
            .await
            .unwrap();
        insert_message(&pool, &campaign_id, &user_id, None, "ooc", "World!", &[])
            .await
            .unwrap();

        let messages = get_recent_messages(&pool, &campaign_id, &user_id, 50)
            .await
            .unwrap();
        assert_eq!(messages.len(), 2);
        // Most recent first
        assert_eq!(messages[0].content, "World!");
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn test_whisper_filtering(pool: PgPool) {
        let (campaign_id, sender_id) = setup_campaign(&pool).await;
        let target = crate::users::create_user(&pool, "target@test.com", "hash", "Target")
            .await
            .unwrap();
        let outsider = crate::users::create_user(&pool, "outsider@test.com", "hash", "Outsider")
            .await
            .unwrap();

        // Public message
        insert_message(&pool, &campaign_id, &sender_id, None, "ooc", "Public", &[])
            .await
            .unwrap();
        // Whisper to target
        insert_message(
            &pool,
            &campaign_id,
            &sender_id,
            None,
            "whisper",
            "Secret",
            &[target.id],
        )
        .await
        .unwrap();

        // Sender sees both
        let sender_msgs = get_recent_messages(&pool, &campaign_id, &sender_id, 50)
            .await
            .unwrap();
        assert_eq!(sender_msgs.len(), 2);

        // Target sees both
        let target_msgs = get_recent_messages(&pool, &campaign_id, &target.id, 50)
            .await
            .unwrap();
        assert_eq!(target_msgs.len(), 2);

        // Outsider sees only public
        let outsider_msgs = get_recent_messages(&pool, &campaign_id, &outsider.id, 50)
            .await
            .unwrap();
        assert_eq!(outsider_msgs.len(), 1);
        assert_eq!(outsider_msgs[0].content, "Public");
    }
}
```

- [ ] **Step 2: Add module to lib.rs, build, commit**

Add `pub mod chat_messages;` to `crates/db/src/lib.rs`.

Run: `SQLX_OFFLINE=true cargo build -p db`

```bash
git add crates/db/src/chat_messages.rs crates/db/src/lib.rs
git commit -m "feat(db): add chat message repository with whisper filtering"
```

---

### Task 7: Database — Handout Repository

**Files:**
- Create: `crates/db/src/handouts.rs`
- Modify: `crates/db/src/lib.rs`

- [ ] **Step 1: Write handout queries**

Create `crates/db/src/handouts.rs` with:

- `HandoutRow` struct matching the table columns
- `create_handout(pool, campaign_id, title, content, visibility, player_ids, created_by) -> Result<HandoutRow>`
- `find_by_id(pool, id) -> Result<Option<HandoutRow>>`
- `list_for_campaign(pool, campaign_id) -> Result<Vec<HandoutRow>>` — returns all (DM filters in the route)
- `update_handout(pool, id, title?, content?, visibility?, player_ids?) -> Result<Option<HandoutRow>>` — COALESCE pattern
- `delete_handout(pool, id) -> Result<bool>`
- Conversion function: `row_to_handout(row: HandoutRow) -> htbd_core::handout::Handout`
- Conversion function: `row_to_summary(row: &HandoutRow) -> htbd_core::handout::HandoutSummary`
- Tests: create + find, list, update, delete, using `#[sqlx::test(migrations = "../../migrations")]`

- [ ] **Step 2: Add module, build, commit**

Add `pub mod handouts;` to `crates/db/src/lib.rs`.

```bash
git add crates/db/src/handouts.rs crates/db/src/lib.rs
git commit -m "feat(db): add handout repository with visibility support"
```

---

### Task 8: Database — Initiative Repository

**Files:**
- Create: `crates/db/src/initiative.rs`
- Modify: `crates/db/src/lib.rs`

- [ ] **Step 1: Write initiative queries**

Create `crates/db/src/initiative.rs` with:

- `EncounterRow` and `CombatantRow` structs
- `create_encounter(pool, campaign_id) -> Result<EncounterRow>`
- `get_active_encounter(pool, campaign_id) -> Result<Option<EncounterRow>>`
- `deactivate_encounter(pool, encounter_id) -> Result<()>`
- `update_encounter_turn(pool, encounter_id, current_turn_index, round_number) -> Result<()>`
- `add_combatant(pool, encounter_id, character_id?, name, initiative_value, sort_order) -> Result<CombatantRow>`
- `list_combatants(pool, encounter_id) -> Result<Vec<CombatantRow>>`
- `update_combatant_initiative(pool, combatant_id, initiative_value, sort_order) -> Result<Option<CombatantRow>>`
- `remove_combatant(pool, combatant_id) -> Result<bool>`
- `get_combatant_encounter_id(pool, combatant_id) -> Result<Option<Uuid>>` — for auth checks
- Conversion functions to core `Encounter` and `Combatant` types
- Tests: encounter lifecycle, combatant CRUD

- [ ] **Step 2: Add module, build, commit**

Add `pub mod initiative;` to `crates/db/src/lib.rs`.

```bash
git add crates/db/src/initiative.rs crates/db/src/lib.rs
git commit -m "feat(db): add initiative encounter and combatant repository"
```

---

### Task 9: Server — Chat Routes (REST + WS)

**Files:**
- Create: `crates/server/src/routes/chat.rs`
- Modify: `crates/server/src/routes/mod.rs`
- Modify: `crates/server/src/routes/ws.rs`

- [ ] **Step 1: Write chat REST routes**

Create `crates/server/src/routes/chat.rs` with:

REST endpoints:
- `GET /campaigns/{campaign_id}/chat?limit=50` — get recent messages (with whisper filtering)
- `GET /campaigns/{campaign_id}/chat/before/{message_id}?limit=50` — paginated older messages

The route functions should:
- Validate campaign membership via `require_member`
- Call `db::chat_messages::get_recent_messages` / `get_messages_before`
- Join with user display names and character names for the response
- Return `Vec<ChatMessage>` (the core type, which includes sender_display_name and character_name)

To populate `sender_display_name` and `character_name`, either:
- Do a JOIN in the SQL query, or
- Load the data separately and merge (simpler, follows existing patterns)

The simpler approach: after fetching `ChatMessageRow`s, batch-load the referenced user IDs and character IDs, then assemble `ChatMessage` structs.

- [ ] **Step 2: Add WS handler for SendChatMessage**

In `crates/server/src/routes/ws.rs`, add a handler for `ClientMessage::SendChatMessage`:

```rust
ClientMessage::SendChatMessage { character_id, message_type, content, whisper_target_ids } => {
    handle_send_chat_message(state, campaign_id, user_id, role, character_id, message_type, content, whisper_target_ids).await;
}
```

The handler should:
1. Validate the message (content not empty, character belongs to user if specified)
2. Persist to DB via `db::chat_messages::insert_message`
3. Look up sender display name and character name
4. Build `ChatMessage` response struct
5. For whispers: send only to sender + target users via `session_manager.send_to()` for each
6. For non-whispers: broadcast to entire campaign via `session_manager.broadcast()`

- [ ] **Step 3: Mount routes, build, commit**

Add `pub mod chat;` to routes/mod.rs, merge `chat::routes()`.

```bash
git add crates/server/src/routes/chat.rs crates/server/src/routes/mod.rs crates/server/src/routes/ws.rs
git commit -m "feat(server): add chat REST endpoints and WebSocket send handler with whisper filtering"
```

---

### Task 10: Server — Handout Routes

**Files:**
- Create: `crates/server/src/routes/handouts.rs`
- Modify: `crates/server/src/routes/mod.rs`

- [ ] **Step 1: Write handout CRUD routes**

Create `crates/server/src/routes/handouts.rs` with:

```
POST   /campaigns/{campaign_id}/handouts   — create (DM only)
GET    /campaigns/{campaign_id}/handouts   — list (filtered by visibility for players)
GET    /handouts/{id}                      — get (visibility check)
PUT    /handouts/{id}                      — update (DM only)
DELETE /handouts/{id}                      — delete (DM only)
```

Each mutation (create, update, delete) should broadcast a WebSocket notification:
- `HandoutCreated { handout: HandoutSummary }` — broadcast to all
- `HandoutUpdated { handout: HandoutSummary }` — broadcast to all
- `HandoutDeleted { handout_id }` — broadcast to all

List endpoint filtering for players:
- DM sees all handouts
- Players see handouts where `visibility = 'everyone'` OR (`visibility = 'specific_players'` AND `user_id = ANY(player_ids)`)

- [ ] **Step 2: Mount routes, build, commit**

Add `pub mod handouts;` to routes/mod.rs, merge routes.

```bash
git add crates/server/src/routes/handouts.rs crates/server/src/routes/mod.rs
git commit -m "feat(server): add handout CRUD REST endpoints with WS notifications"
```

---

### Task 11: Server — Initiative WS Handlers

**Files:**
- Modify: `crates/server/src/routes/ws.rs`

- [ ] **Step 1: Add initiative message handlers**

Add match arms for all initiative `ClientMessage` variants. Each handler should:
- Verify DM role (all initiative actions are DM-only)
- Perform the DB operation
- Broadcast the corresponding `ServerMessage` to all campaign clients

Key handlers:

**StartEncounter:** Create encounter, add all combatants, broadcast `EncounterStarted`

**AddCombatant:** Add to active encounter, broadcast `CombatantAdded`

**RemoveCombatant:** Delete combatant, broadcast `CombatantRemoved`

**UpdateCombatantInitiative:** Update value + sort_order, broadcast `CombatantInitiativeUpdated`

**RollAllInitiative:** For each combatant:
- If linked to a character, look up the character's fields and game system to get the modifier
- Call `htbd_core::initiative::roll_initiative()` with the game system's roll expression and the modifier
- If no character link or expression is unparseable, leave the value unchanged
- Re-sort all combatants by initiative value (descending), update sort_order
- Broadcast `AllInitiativeRolled { combatants }` with full sorted list

**RollCombatantInitiative:** Same as above but for one combatant. Broadcast `CombatantInitiativeUpdated`.

**NextTurn:** Advance `current_turn_index`, skip `is_active = false` combatants. If past last, increment `round_number` and reset to 0. Broadcast `TurnAdvanced`.

**PreviousTurn:** Reverse of NextTurn. Broadcast `TurnAdvanced`.

**EndEncounter:** Deactivate encounter. Broadcast `EncounterEnded`.

- [ ] **Step 2: Build, commit**

```bash
git add crates/server/src/routes/ws.rs
git commit -m "feat(server): add initiative WebSocket handlers with dice rolling"
```

---

### Task 12: Frontend — Chat Store & API

**Files:**
- Create: `client/src/api/chat.ts`
- Create: `client/src/state/chat.ts`
- Create: `client/src/state/__tests__/chat.test.ts`

- [ ] **Step 1: Write chat API client**

Create `client/src/api/chat.ts`:

```typescript
import { request } from './client'
import type { ChatMessage } from '../types/ChatMessage'

export const chatApi = {
  getRecent: (campaignId: string, limit = 50) =>
    request<ChatMessage[]>(`/campaigns/${campaignId}/chat?limit=${limit}`),

  getBefore: (campaignId: string, beforeId: string, limit = 50) =>
    request<ChatMessage[]>(`/campaigns/${campaignId}/chat/before/${beforeId}?limit=${limit}`),
}
```

- [ ] **Step 2: Write chat store tests (TDD)**

Create `client/src/state/__tests__/chat.test.ts` with tests for:
- Starts empty
- `addMessage` appends to messages
- `addMessage` deduplicates by ID
- `prependMessages` adds older messages to the front
- `setMessages` replaces the message list
- `handleIncomingMessage` adds to end

- [ ] **Step 3: Write chat store**

Create `client/src/state/chat.ts`:

```typescript
import { create } from 'zustand'
import type { ChatMessage } from '../types/ChatMessage'

interface ChatState {
  messages: ChatMessage[]
  hasMore: boolean

  setMessages: (messages: ChatMessage[]) => void
  addMessage: (message: ChatMessage) => void
  prependMessages: (messages: ChatMessage[]) => void
  setHasMore: (hasMore: boolean) => void
  handleIncomingMessage: (message: ChatMessage) => void
}

const initialState = {
  messages: [] as ChatMessage[],
  hasMore: true,
}

export const useChatStore = create<ChatState>()((set) => ({
  ...initialState,

  setMessages: (messages) => set({ messages }),

  addMessage: (message) =>
    set((s) => ({
      messages: s.messages.some((m) => m.id === message.id)
        ? s.messages
        : [...s.messages, message],
    })),

  prependMessages: (messages) =>
    set((s) => {
      const existingIds = new Set(s.messages.map((m) => m.id))
      const newMessages = messages.filter((m) => !existingIds.has(m.id))
      return { messages: [...newMessages, ...s.messages] }
    }),

  setHasMore: (hasMore) => set({ hasMore }),

  handleIncomingMessage: (message) =>
    set((s) => ({
      messages: s.messages.some((m) => m.id === message.id)
        ? s.messages
        : [...s.messages, message],
    })),
}))
```

- [ ] **Step 4: Run tests, commit**

```bash
git add client/src/api/chat.ts client/src/state/chat.ts client/src/state/__tests__/chat.test.ts
git commit -m "feat(client): add chat API client and Zustand store with tests"
```

---

### Task 13: Frontend — Handout Store & API

**Files:**
- Create: `client/src/api/handouts.ts`
- Create: `client/src/state/handouts.ts`
- Create: `client/src/state/__tests__/handouts.test.ts`

- [ ] **Step 1: Write handout API, store, and tests**

Follow the same pattern as Task 12. The handout API client has: `list`, `get`, `create`, `update`, `delete`.

The handout store has:
- `handouts: HandoutSummary[]` — list of summaries (no content)
- `activeHandout: Handout | null` — the full handout when viewing/editing
- `loadHandouts`, `addHandout`, `updateHandout`, `removeHandout`, `setActiveHandout`
- WS handlers: `handleHandoutCreated`, `handleHandoutUpdated`, `handleHandoutDeleted`

Tests: starts empty, load, add, update, remove, WS handlers.

- [ ] **Step 2: Run tests, commit**

```bash
git add client/src/api/handouts.ts client/src/state/handouts.ts client/src/state/__tests__/handouts.test.ts
git commit -m "feat(client): add handout API client and Zustand store with tests"
```

---

### Task 14: Frontend — Initiative Store

**Files:**
- Create: `client/src/state/initiative.ts`
- Create: `client/src/state/__tests__/initiative.test.ts`

- [ ] **Step 1: Write initiative store and tests**

The initiative store has:
- `encounter: Encounter | null` — the active encounter (null if no combat)
- `handleEncounterStarted(encounter)`, `handleCombatantAdded(combatant)`, `handleCombatantRemoved(id)`, `handleCombatantInitiativeUpdated(id, value, sort_order)`, `handleAllInitiativeRolled(combatants)`, `handleTurnAdvanced(index, round)`, `handleEncounterEnded()`

Tests: starts with null encounter, encounter lifecycle (start → add combatant → update initiative → advance turn → end).

- [ ] **Step 2: Run tests, commit**

```bash
git add client/src/state/initiative.ts client/src/state/__tests__/initiative.test.ts
git commit -m "feat(client): add initiative Zustand store with tests"
```

---

### Task 15: Frontend — Message Dispatcher Updates

**Files:**
- Modify: `client/src/api/dispatcher.ts`

- [ ] **Step 1: Add chat, handout, and initiative message handlers**

Add imports for `useChatStore`, `useHandoutStore`, `useInitiativeStore`.

Add switch cases for all new ServerMessage variants:
- `ChatMessageReceived` → `useChatStore.getState().handleIncomingMessage(message)`
- `HandoutCreated` → `useHandoutStore.getState().handleHandoutCreated(handout)`
- `HandoutUpdated` → `useHandoutStore.getState().handleHandoutUpdated(handout)`
- `HandoutDeleted` → `useHandoutStore.getState().handleHandoutDeleted(handout_id)`
- `EncounterStarted` → `useInitiativeStore.getState().handleEncounterStarted(encounter)`
- `CombatantAdded` → `useInitiativeStore.getState().handleCombatantAdded(combatant)`
- `CombatantRemoved` → `useInitiativeStore.getState().handleCombatantRemoved(combatant_id)`
- `CombatantInitiativeUpdated` → `useInitiativeStore.getState().handleCombatantInitiativeUpdated(...)`
- `AllInitiativeRolled` → `useInitiativeStore.getState().handleAllInitiativeRolled(combatants)`
- `TurnAdvanced` → `useInitiativeStore.getState().handleTurnAdvanced(current_turn_index, round_number)`
- `EncounterEnded` → `useInitiativeStore.getState().handleEncounterEnded()`

- [ ] **Step 2: Lint, commit**

```bash
git add client/src/api/dispatcher.ts
git commit -m "feat(client): add chat, handout, and initiative message routing to dispatcher"
```

---

### Task 16: Frontend — Sidebar Tab Restructure

**Files:**
- Create: `client/src/components/SidebarTabs.tsx`
- Create: `client/src/components/CampaignTab.tsx`
- Modify: `client/src/pages/Campaign.tsx`

- [ ] **Step 1: Create CampaignTab**

Extract the existing sidebar content (map selector, map settings button, asset library button, players online) from Campaign.tsx into `CampaignTab.tsx`. This component receives the same props that the sidebar section currently uses.

- [ ] **Step 2: Create SidebarTabs**

Create `client/src/components/SidebarTabs.tsx` using Radix Tabs:

```typescript
import * as Tabs from '@radix-ui/react-tabs'
```

Four tabs: Campaign, Chat, Chars, Docs. The tab bar renders below the always-visible campaign header. Each tab panel renders the respective content component.

Props: `{ campaignId, campaign, selectedMapId, onMapSelect, ... }` — pass through what each tab needs.

- [ ] **Step 3: Update Campaign.tsx**

Replace the sidebar `<aside>` content with `<SidebarTabs>`. The campaign header (name + invite code) stays above the tabs. Move `CharacterList`, `CharacterSheet`, `CharacterCreateDialog` into the Chars tab. Chat and Docs tabs render their respective components (created in subsequent tasks).

- [ ] **Step 4: Verify build, commit**

```bash
git add client/src/components/SidebarTabs.tsx client/src/components/CampaignTab.tsx client/src/pages/Campaign.tsx
git commit -m "feat(client): restructure sidebar into Radix Tabs (Campaign, Chat, Chars, Docs)"
```

---

### Task 17: Frontend — Chat UI Components

**Files:**
- Create: `client/src/components/ChatTab.tsx`
- Create: `client/src/components/ChatMessage.tsx`
- Create: `client/src/components/ChatInput.tsx`

- [ ] **Step 1: Create ChatMessage**

A component that renders a single chat message. Switch on `message.message_type`:
- `character`: avatar (portrait or initials), character name in color, content, timestamp
- `ooc`: player name, dimmed/bracketed content, timestamp
- `emote`: italic, third-person style (`* Name does something *`)
- `whisper`: red/pink tint, "→ Recipient" label, content
- `system`: centered, muted style (session markers, join/leave)

- [ ] **Step 2: Create ChatInput**

The input bar: character selector dropdown (player's characters + OOC option), text input, send button.

Command parsing on submit:
- `/w PlayerName message` → set message_type to "whisper", extract target (resolve player name to user ID from presence store)
- `/me action` → set message_type to "emote"
- `/session start` or `/session end` → set message_type to "system" (DM only)
- Otherwise → "character" if a character is selected, "ooc" if OOC is selected

Send via `wsClient.send({ type: 'SendChatMessage', payload: { ... } })`.

- [ ] **Step 3: Create ChatTab**

The chat tab content:
- Message list (scrollable, auto-scroll to bottom on new messages)
- Load initial messages on mount: `chatApi.getRecent(campaignId)` → `useChatStore.getState().setMessages(reversed)` (API returns newest-first, display oldest-first)
- Scroll-up to load older messages: when user scrolls to top, call `chatApi.getBefore(campaignId, firstMessageId)` → `prependMessages(reversed)`
- `ChatInput` at the bottom

- [ ] **Step 4: Verify build, commit**

```bash
git add client/src/components/ChatTab.tsx client/src/components/ChatMessage.tsx client/src/components/ChatInput.tsx
git commit -m "feat(client): add chat UI components (message renderer, input with commands, tab)"
```

---

### Task 18: Frontend — Docs Tab (Handouts)

**Files:**
- Create: `client/src/components/DocsTab.tsx`
- Create: `client/src/components/HandoutEditor.tsx`

- [ ] **Step 1: Create HandoutEditor**

Split-pane component: markdown textarea (left), rendered preview (right).
- Title input above the editor
- Visibility controls: dropdown with "Everyone", "DM Only", "Specific Players" + player checkboxes
- Save button calls `handoutsApi.update()`
- Image embed helper: button that opens asset library (reuse `AssetBrowser` in select mode), inserts `![](asset:UUID)` at cursor position

For markdown rendering: use a simple function that converts markdown to HTML. Use a lightweight library or a basic regex-based renderer for headings, bold, italic, lists, links, and `![](asset:UUID)` → `<img src="/api/assets/UUID">`.

- [ ] **Step 2: Create DocsTab**

The docs tab content:
- Document list view: title, visibility badge
- "New Handout" button (visible to DM only — check role from presence store or campaign member data)
- Click a handout: load full content via `handoutsApi.get(id)` → set as active
- Active handout view: rendered markdown (players), split editor (DM)
- Back button to return to list
- Load handouts on mount: `handoutsApi.list(campaignId)` → `useHandoutStore.getState().loadHandouts()`

- [ ] **Step 3: Verify build, commit**

```bash
git add client/src/components/DocsTab.tsx client/src/components/HandoutEditor.tsx
git commit -m "feat(client): add handout docs tab with markdown editor and preview"
```

---

### Task 19: Frontend — Initiative Panel

**Files:**
- Create: `client/src/components/InitiativePanel.tsx`
- Modify: `client/src/pages/Campaign.tsx`

- [ ] **Step 1: Create InitiativePanel**

Floating canvas panel (follow `LayerPanel.tsx` positioning pattern). Only visible when `useInitiativeStore.encounter` is not null.

**Panel contents:**
- Header: "Initiative — Round N" + "End Combat" button (DM)
- Combatant list: sorted by sort_order. Each entry shows:
  - Name (+ portrait thumbnail if character_id is set)
  - Initiative value
  - Current turn highlighted (compare index to encounter.current_turn_index)
  - DM controls: edit value input, remove (×) button, roll button
- Footer (DM): "Next Turn" / "Prev Turn" buttons, "Add Combatant" button, "Roll All" button

**Add Combatant flow:** Dropdown of campaign characters (from `useCharacterStore`) + manual name/value inputs. On add, send `AddCombatant` WS message.

**DM actions** send WS messages: `NextTurn`, `PreviousTurn`, `RollAllInitiative`, `RollCombatantInitiative`, `EndEncounter`, etc.

**Player view:** Same panel but no edit controls, no buttons except viewing turn order.

- [ ] **Step 2: Add "Start Combat" button and InitiativePanel to Campaign.tsx**

Add a "Start Combat" button to the Campaign tab (visible to DM only). On click, open a dialog/flow to select combatants and start the encounter.

Add `<InitiativePanel />` to the canvas overlay area (alongside Toolbar, LayerPanel, TokenInspector).

- [ ] **Step 3: Verify build, commit**

```bash
git add client/src/components/InitiativePanel.tsx client/src/pages/Campaign.tsx
git commit -m "feat(client): add floating initiative tracker panel with combat management"
```

---

### Task 20: Integration — Campaign.tsx Data Loading

**Files:**
- Modify: `client/src/pages/Campaign.tsx`

- [ ] **Step 1: Add chat and handout loading**

In Campaign.tsx, add useEffects to:
- Load recent chat messages on mount: `chatApi.getRecent(id)` → `useChatStore.getState().setMessages(messages.reverse())`
- Load handouts on mount: `handoutsApi.list(id)` → `useHandoutStore.getState().loadHandouts(handouts)`
- Load active initiative encounter on mount (if one exists): REST endpoint or include in initial campaign data

- [ ] **Step 2: Verify build, commit**

```bash
git add client/src/pages/Campaign.tsx
git commit -m "feat(client): load chat history and handouts on campaign mount"
```

---

### Task 21: Pre-Push Verification

- [ ] **Step 1: Backend checks**

```bash
cargo fmt --all -- --check
SQLX_OFFLINE=true cargo clippy --workspace -- -D warnings
SQLX_OFFLINE=true cargo test --workspace --no-run  # verify compilation
SQLX_OFFLINE=true cargo test -p htbd-core           # dice roller + binding tests
SQLX_OFFLINE=true cargo test -p server --lib        # server unit tests
```

- [ ] **Step 2: Frontend checks**

```bash
cd client && npm run lint
cd client && npm run build
cd client && npm run test -- --run
```

- [ ] **Step 3: Regenerate sqlx offline data if needed**

Run: `cargo sqlx prepare --workspace` (needs live DB)

- [ ] **Step 4: Commit fixes**

```bash
git add -A
git commit -m "chore: fix lint/format issues and update sqlx offline data"
```

---

### Task 22: End-to-End Tests (Playwright)

**Files:**
- Create: `client/e2e/chat.spec.ts`
- Create: `client/e2e/handouts.spec.ts`
- Create: `client/e2e/initiative.spec.ts`

- [ ] **Step 1: Write chat e2e tests**

Tests (multi-browser-context for multi-user):
1. Send a chat message as OOC, verify it appears for both users
2. Send a character-attributed message, verify character name + portrait shown
3. Send a whisper, verify sender and target see it, third user does not

- [ ] **Step 2: Write handout e2e tests**

Tests:
1. DM creates a handout, verify it appears in the docs tab
2. DM sets visibility to "everyone", verify player sees it
3. DM sets visibility to "dm_only", verify player does NOT see it

- [ ] **Step 3: Write initiative e2e tests**

Tests:
1. DM starts combat with two combatants, verify tracker panel appears
2. DM clicks "Next Turn", verify turn indicator advances
3. DM ends combat, verify panel disappears

- [ ] **Step 4: Run e2e tests locally**

Start dev stack, run: `cd client && npx playwright test e2e/chat.spec.ts e2e/handouts.spec.ts e2e/initiative.spec.ts`

- [ ] **Step 5: Commit**

```bash
git add client/e2e/
git commit -m "test(e2e): add chat, handout, and initiative end-to-end tests"
```
