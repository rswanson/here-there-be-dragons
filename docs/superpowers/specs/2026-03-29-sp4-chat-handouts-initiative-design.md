# SP-4: Chat, Handouts & Communication System — Design Spec

Text chat with rich features, handouts/journals, and an initiative tracker — everything players and DMs use to communicate and manage session flow outside the canvas.

**Parent spec:** [Here There Be Dragons Design Spec](2026-03-15-here-there-be-dragons-design.md)
**Roadmap:** [Phase 1 Roadmap](../plans/2026-03-15-phase1-roadmap.md)
**Dependencies:** SP-0 (foundation), SP-2 (real-time sync), SP-3 (character linking for initiative)

---

## Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Chat location | Sidebar tab | Canvas keeps full height; chat/chars/docs share tabbed sidebar |
| Whispers | Any-to-any | Full flexibility for player-to-player and player-to-DM private messages |
| Chat history | Continuous with session markers | One stream per campaign; DM can drop start/end markers for organization |
| Handout editor | Markdown with image embeds | Markdown editing with preview; `asset:UUID` syntax for asset library images |
| Initiative tracker | Floating canvas panel | Always visible during combat alongside the map |
| Initiative rolling | Simple built-in roller | Minimal `NdM + C` parser for initiative only; replaced by SP-7 DSL later |
| Initiative combatants | Linked to characters | Auto-populate from character sheet; manual entry for NPCs without characters |

---

## 1. Sidebar Tab System

The existing right sidebar is restructured into a tabbed layout. The campaign header (name + invite code) stays always-visible above the tab bar.

**Tabs:**
- **Campaign** (default) — map selector, asset library, players online (existing content)
- **Chat** — real-time text chat with message history
- **Chars** — character list; selecting a character replaces the list with the character sheet (back button to return)
- **Docs** — handouts and journals

The tab bar sits below the campaign header. The active tab's content fills the remaining sidebar height.

**Changes to existing UI:**
- Campaign info (map selector, asset library, players online) moves into the Campaign tab
- Character list and character sheet (from SP-3) move into the Chars tab
- The character sheet no longer renders as an absolute-positioned overlay on the canvas — it renders inline within the Chars tab, replacing the character list when a character is selected

---

## 2. Chat System

### Message Types

| Type | Sender | Appearance | Visibility |
|------|--------|------------|------------|
| Character | Player speaking as a character | Name, portrait, character color | Everyone |
| OOC | Player speaking as themselves | Player display name, dimmed/bracketed | Everyone |
| Emote | Player via `/me` | Italic, third-person (`* Aldric looks around *`) | Everyone |
| Whisper | Any player/DM | Red/pink tint, "→ Recipient" label | Sender + recipients only |
| System | Server-generated | Centered, muted style | Everyone |

### Sending Flow

The input bar at the bottom of the Chat tab has:
- **Character selector dropdown** — lists the player's characters in this campaign, plus "OOC (player name)" option
- **Message text input** — supports command syntax:
  - `/w PlayerName message` — whisper to a specific player
  - `/me does something` — emote
  - `/session start` / `/session end` — DM-only session markers
- **Send button** (or Enter key)

For whispers, the `/w` syntax sets the recipient. The character selector still applies — you can whisper as a character or OOC.

### Data Model

```sql
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
```

### Message Loading

- On page load: REST endpoint returns the last 50 messages for the campaign
- Scroll-up: paginated REST endpoint loads older messages (cursor-based, before a given message ID)
- New messages: arrive via WebSocket broadcast in real time

### WebSocket Messages

```rust
// Client → Server
SendChatMessage {
    character_id: Option<Uuid>,
    message_type: String,       // "character", "ooc", "emote", "whisper"
    content: String,
    whisper_target_ids: Vec<Uuid>,  // user IDs, empty for non-whispers
}

// Server → Client
ChatMessageReceived {
    message: ChatMessage,  // full message struct
}
```

### Whisper Filtering

Whispers are filtered **server-side**. The server only sends a whisper message to:
- The sender's connections
- Each target user's connections

Other users in the campaign never receive the WebSocket message. This means whisper content never reaches unintended clients — the privacy guarantee is at the transport layer, not just the UI.

### Session Markers

Session markers are system messages with content `"session_start"` or `"session_end"`. They are visually distinct in the chat stream (divider line with "Session Started" / "Session Ended" label). The DM sends them via `/session start` and `/session end` commands. They serve as organizational markers for chat history — no separate session entity or state machine.

---

## 3. Handouts & Journals

### Data Model

```sql
CREATE TABLE handouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    visibility TEXT NOT NULL DEFAULT 'dm_only',  -- 'everyone', 'dm_only', 'specific_players'
    player_ids UUID[] NOT NULL DEFAULT '{}',     -- used when visibility = 'specific_players'
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_handouts_campaign ON handouts(campaign_id);
```

### Content Format

Handouts are written in markdown by the DM and rendered as HTML for readers. Images are embedded using `![description](asset:UUID)` syntax, which references assets from the campaign's asset library. The client resolves `asset:UUID` to the actual asset URL (`/api/assets/UUID`) when rendering.

### UI (Docs Tab)

**Document list view:**
- List of handout cards: title, visibility badge ("Everyone" / "DM Only" / "2 Players")
- DM sees all handouts. Players see only handouts visible to them.
- "New Handout" button (DM only)

**Document view (player):**
- Rendered markdown, read-only
- Back button to return to list

**Document edit view (DM):**
- Split pane: markdown editor (left), live preview (right)
- Title field above the editor
- Visibility controls: dropdown — "Everyone", "DM Only", "Specific Players" (with player checkboxes)
- Save button. Autosave on debounce (same pattern as character field updates) is a nice-to-have but not required for SP-4.
- Image embed helper: button that opens the asset library picker, inserts `![](asset:UUID)` at cursor

### REST API

```
POST   /api/campaigns/:id/handouts           — create handout (DM only)
GET    /api/campaigns/:id/handouts           — list handouts (filtered by visibility for players)
GET    /api/handouts/:id                     — get handout (visibility check)
PUT    /api/handouts/:id                     — update handout (DM only)
DELETE /api/handouts/:id                     — delete handout (DM only)
```

### Real-Time Notifications

Handout CRUD uses REST (not collaborative editing). When the DM creates, updates visibility, or deletes a handout, a WebSocket notification broadcasts to the campaign so player doc lists update without page refresh.

```rust
// Server → Client
HandoutCreated { handout: HandoutSummary }    // title + id + visibility, not full content
HandoutUpdated { handout: HandoutSummary }
HandoutDeleted { handout_id: Uuid }
```

---

## 4. Initiative Tracker

### Data Model

```sql
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

### Combatant Linking

When adding a combatant linked to a character:
- Name auto-populates from the character's name
- Initiative modifier is derived from the character's fields via `GameSystem::initiative_rules().tiebreaker_field` (e.g., the Dex modifier for 3.5e)
- The combatant entry stores the `character_id` FK
- Linked combatants show their character's portrait thumbnail in the tracker

Manual entries (NPCs without character sheets): the DM types a name and initiative value directly.

### Simple Dice Roller

A minimal parser and evaluator for initiative rolling only. Supports expressions matching the pattern `NdM`, `NdM + C`, or `NdM - C` where N, M, and C are positive integers.

Examples: `1d20`, `1d20 + 3`, `2d6 - 1`

This roller is used by the "Roll All" and per-combatant "Roll" buttons on the initiative tracker. It reads the game system's `initiative_rules().roll_expression` and, if it matches the simple pattern, evaluates it with the character's modifier substituted. If the expression is too complex for the simple parser (uses variables, conditionals, etc.), the roll button is disabled and the DM enters values manually.

When SP-7 (Dice Macro DSL) ships, the initiative tracker swaps to the full DSL evaluator. The simple roller is removed, not extended.

### Sorting & Tiebreaking

Combatants are sorted by `initiative_value` descending. Ties are broken by the game system's `initiative_rules().tiebreaker_field`:
- If both combatants are linked to characters, compare the tiebreaker field value (e.g., Dex score — higher wins)
- If one or both are manual entries (no character link), ties are left in insertion order (DM can manually reorder)

### UI (Floating Canvas Panel)

The initiative tracker is a floating panel on the canvas area, similar to the existing Toolbar and LayerPanel. It is only visible when an encounter is active.

**Panel contents:**
- **Header:** "Initiative — Round N" with "End Combat" button (DM only)
- **Combatant list:** compact vertical list, each entry showing:
  - Portrait thumbnail (if linked to character) or a generic icon
  - Name
  - Initiative value
  - Current turn indicator (highlighted background/border)
  - DM-only controls: edit value, remove button, individual roll button
- **Footer (DM only):** "Next Turn" / "Previous Turn" buttons, "Add Combatant" button, "Roll All" button

**Turn advancement:**
- "Next Turn" moves `current_turn_index` forward. When it passes the last combatant, `round_number` increments and `current_turn_index` resets to 0.
- "Previous Turn" moves backward. At the start of a round, it goes to the previous round's last combatant.
- Skips combatants where `is_active = false` (delayed/readied/removed from turn order).

**Starting combat:**
- DM clicks a "Start Combat" button (in the toolbar or sidebar Campaign tab)
- Opens the "Add Combatants" flow: list of campaign characters with checkboxes, plus manual entry fields
- After adding combatants, DM clicks "Roll All" or enters values manually
- List sorts, encounter becomes active, panel appears

**Player view:**
- Read-only: sees the turn order, current combatant highlighted, round number
- No edit controls

### Real-Time Sync

All initiative state syncs via WebSocket. All connected clients see the same tracker state.

```rust
// Client → Server (DM only)
StartEncounter { combatants: Vec<{ character_id: Option<Uuid>, name: String, initiative_value: i32 }> }
AddCombatant { encounter_id: Uuid, character_id: Option<Uuid>, name: String, initiative_value: i32 }
RemoveCombatant { combatant_id: Uuid }
UpdateCombatantInitiative { combatant_id: Uuid, initiative_value: i32 }
RollAllInitiative { encounter_id: Uuid }
RollCombatantInitiative { combatant_id: Uuid }
NextTurn { encounter_id: Uuid }
PreviousTurn { encounter_id: Uuid }
EndEncounter { encounter_id: Uuid }

// Server → Client
EncounterStarted { encounter: Encounter, combatants: Vec<Combatant> }
CombatantAdded { combatant: Combatant }
CombatantRemoved { combatant_id: Uuid }
CombatantInitiativeUpdated { combatant_id: Uuid, initiative_value: i32, sort_order: i32 }
AllInitiativeRolled { combatants: Vec<Combatant> }  // full list with new values + sort
TurnAdvanced { current_turn_index: i32, round_number: i32 }
EncounterEnded { encounter_id: Uuid }
```

---

## 5. Testing

### Unit Tests

- Chat message type parsing: `/w`, `/me`, `/session` command detection and argument extraction
- Simple dice roller: `NdM + C` parsing, evaluation, edge cases (negative modifiers, invalid expressions)
- Initiative sorting with tiebreakers
- Markdown rendering with `asset:UUID` URL resolution
- Whisper visibility filtering logic

### Integration Tests (Rust)

- Chat message persistence and paginated retrieval
- Whisper filtering: only sender + target user IDs receive the message
- Handout CRUD with visibility filtering (DM sees all, player sees permitted)
- Initiative encounter lifecycle: create → add combatants → roll → advance turns → end
- Initiative combatant linking to characters (auto-populate name + modifier)

### End-to-End Tests (Playwright)

- Send/receive chat messages across two users (multi-browser-context)
- Whisper visibility: sender and target see the whisper, third player does not
- Character-attributed messages: speak as character, portrait/name displayed correctly
- Handout creation, visibility toggle (player sees → DM sets to DM-only → player no longer sees)
- Initiative tracker: add combatants, roll all, advance turns, verify round counter increments

---

## 6. Out of Scope

- **Dice macro DSL** — SP-7. Initiative uses a simple built-in roller as a stopgap.
- **Roll result display in chat** — SP-7. Chat will display roll cards when the DSL exists; SP-4 only handles text messages and system messages.
- **Collaborative document editing** — Handouts are single-author (DM). Real-time co-editing is not planned.
- **Chat reactions/emoji** — Not in the roadmap.
- **Rich text WYSIWYG editor** — Markdown with preview is sufficient for SP-4. WYSIWYG can be added later.
- **Searchable chat history** — The data model supports it (full-text search on content), but the search UI is deferred. History is browsable by scrolling.
