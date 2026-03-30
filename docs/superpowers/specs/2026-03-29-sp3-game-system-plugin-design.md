# SP-3: Game System Plugin Architecture — Design Spec

The abstraction layer that makes the VTT game-system-agnostic. Defines what a plugin is, what it provides, how character sheets work, and how the rest of the system consumes it.

**Parent spec:** [Here There Be Dragons Design Spec](2026-03-15-here-there-be-dragons-design.md)
**Roadmap:** [Phase 1 Roadmap](../plans/2026-03-15-phase1-roadmap.md)
**Dependencies:** SP-0 (foundation), SP-2 (real-time sync)

---

## Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Plugin model | Rust-compiled traits | Only 3.5e planned; avoids WASM/Lua infrastructure. Trait boundary enables future runtime plugins. |
| Sheet layout | Schema + layout hints | Generic renderer with per-system structure. No custom React components per system. |
| Computed fields | Server-authoritative | Single source of truth. Client debounces (300ms), server recomputes and broadcasts. |
| Character ownership | Campaign-scoped | Simple model. Import/export handles portability. No cross-campaign shared state. |
| Import/export | JSON + adapter trait | Working JSON import/export now. `ImportAdapter` trait for format-specific parsers later. |
| Bonus system | Typed bonus stacking | Game system defines bonus types and stacking rules. Fields track bonus entries with sources. |

---

## 1. GameSystem Trait

Each game system is a Rust struct implementing the `GameSystem` trait, compiled into the server binary. A `GameSystemRegistry` holds all registered systems, populated at startup.

```rust
trait GameSystem: Send + Sync {
    // Identity
    fn id(&self) -> &str;           // "dnd-3.5e"
    fn name(&self) -> &str;         // "D&D 3.5 Edition"
    fn version(&self) -> &str;      // "1.0.0"

    // Schema: field definitions, sections, layout hints
    fn sheet_schema(&self) -> SheetSchema;

    // Computation: given raw field values + bonus entries, produce all derived values
    fn compute_derived(&self, fields: &FieldValues, bonuses: &BonusMap) -> FieldValues;

    // Validation: are these field values legal?
    fn validate_fields(&self, fields: &FieldValues) -> Vec<ValidationError>;

    // Bonus system
    fn bonus_types(&self) -> Vec<BonusTypeDef>;
    fn apply_stacking(&self, field_id: &str, bonuses: &[BonusEntry]) -> i64;

    // Creature sizes this system defines (for token sizing)
    fn creature_sizes(&self) -> Vec<CreatureSize>;

    // Initiative: what to roll, how to sort
    fn initiative_rules(&self) -> InitiativeRules;

    // Default fields for a new character
    fn default_fields(&self) -> FieldValues;

    // Field visibility for other players
    fn field_visibility(&self, field_id: &str) -> FieldVisibility;

    // Token bar mappings (which character fields drive token bars)
    fn token_bar_mappings(&self) -> Vec<TokenBarMapping>;

    // Import/export
    fn export_character(&self, fields: &FieldValues, bonuses: &BonusMap) -> serde_json::Value;
    fn import_character(&self, data: &serde_json::Value) -> Result<(FieldValues, BonusMap), ImportError>;
}
```

### GameSystemRegistry

```rust
struct GameSystemRegistry {
    systems: HashMap<String, Arc<dyn GameSystem>>,
}

impl GameSystemRegistry {
    fn register(&mut self, system: Arc<dyn GameSystem>);
    fn get(&self, id: &str) -> Option<Arc<dyn GameSystem>>;
    fn list(&self) -> Vec<GameSystemInfo>; // id, name, version
}
```

The registry is built at server startup and passed to route handlers via Axum state. SP-3 ships with a minimal stub plugin for testing. SP-3a implements the full 3.5e plugin.

---

## 2. Sheet Schema

The schema describes the character sheet's structure: what fields exist, how they're grouped, and how to lay them out.

```rust
struct SheetSchema {
    sections: Vec<SheetSection>,
}

struct SheetSection {
    id: String,              // "abilities", "skills", "combat"
    name: String,            // "Ability Scores"
    layout: SectionLayout,
    fields: Vec<FieldDef>,
}

enum SectionLayout {
    Grid { columns: u8 },          // e.g., abilities in 2x3 grid
    List,                           // e.g., skills as vertical list
    Table { columns: Vec<String> }, // e.g., equipment table with headers
    Tabs { tabs: Vec<String> },     // e.g., spells grouped by level
}

struct FieldDef {
    id: String,              // "strength", "hp_current"
    name: String,            // "Strength"
    field_type: FieldType,
    default_value: Option<serde_json::Value>,
    derived: bool,           // true = computed by server, read-only in UI
    visible: bool,           // false = internal field used in computation but hidden
    group: Option<String>,   // sub-group within a section
    width_hint: WidthHint,
}

enum FieldType {
    Integer { min: Option<i64>, max: Option<i64> },
    Text { max_length: Option<usize> },
    LongText,
    Boolean,
    Choice { options: Vec<ChoiceOption> },
    AbilityScore,            // renders score + derived modifier together
    StatBlock { label: String },
    ResourcePool { max_field: Option<String> }, // current/max (HP, spell slots)
    BonusStacked {           // value computed from typed bonus entries
        base_expression: Option<String>,
        allowed_bonus_types: Vec<String>,
    },
}

struct ChoiceOption {
    value: String,
    label: String,
}

enum WidthHint { Narrow, Normal, Wide, Full }
```

### Key Field Types

**`AbilityScore`** — Renders as an editable score with a derived modifier displayed alongside it. The modifier is computed server-side by the plugin.

**`ResourcePool`** — Renders as a current/max pair with a visual bar. `max_field` references another field that provides the maximum (e.g., `hp_max`). Current is editable; max may be derived.

**`BonusStacked`** — The field's value is computed from a list of `BonusEntry` records using the game system's stacking rules. Renders as a collapsible breakdown showing each bonus source, type, and value. `base_expression` provides a starting value (e.g., `"10"` for AC). `allowed_bonus_types` constrains which bonus types can be added to this field.

---

## 3. Bonus System

D&D 3.5e (and similar systems) use typed bonuses with stacking rules. The plugin architecture supports this as a first-class concept.

### Data Model

```rust
struct BonusEntry {
    id: Uuid,
    source: String,        // "Cloak of Resistance +2", "Bull's Strength"
    bonus_type: String,    // "enhancement", "dodge", "morale"
    value: i64,
}

struct BonusTypeDef {
    id: String,            // "enhancement"
    name: String,          // "Enhancement"
    stacks: bool,          // false for most, true for dodge/untyped
}

// Per-character, per-field bonus entries
type BonusMap = HashMap<String, Vec<BonusEntry>>; // field_id → entries
```

### Stacking Rules

The `GameSystem::apply_stacking()` method receives all bonus entries for a field and returns the computed total. The default 3.5e behavior:

- **Non-stacking types** (enhancement, resistance, natural, deflection, etc.): take the highest value per type
- **Always-stacking types** (dodge, untyped, circumstance): sum all values
- The server computes the effective total; suppressed entries (lower-value duplicates of a non-stacking type) are flagged for the UI

### UI Behavior

- **Collapsed**: shows field name and computed total
- **Expanded**: shows each bonus entry with source name, color-coded type tag, value, and remove button
- **Derived entries** (ability modifier, base save, size modifier): read-only, no remove button
- **Suppressed entries**: visible but dimmed with strikethrough, explaining why they don't contribute
- **"+ Add Bonus" button**: opens a popover with source name (text), bonus type (dropdown from game system's `bonus_types()`), and value (number)

---

## 4. Database Schema

### New Tables

```sql
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

CREATE TABLE character_field_values (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    field_id TEXT NOT NULL,
    value JSONB NOT NULL,
    PRIMARY KEY (character_id, field_id)
);

CREATE TABLE character_bonuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    field_id TEXT NOT NULL,
    source TEXT NOT NULL,
    bonus_type TEXT NOT NULL,
    value INTEGER NOT NULL
);

CREATE INDEX idx_character_bonuses_char_field ON character_bonuses(character_id, field_id);
```

### Token Link

```sql
ALTER TABLE tokens ADD COLUMN character_id UUID REFERENCES characters(id) ON DELETE SET NULL;
```

### Storage Notes

- **Field values as individual rows** — enables partial updates and field-level queries without large-document merge conflicts
- **Bonus entries as their own table** — each entry is independently addressable (add/remove/update)
- **Derived fields are stored** — recomputed on every update, but stored so the client can load a sheet without server-side recomputation
- **`game_system_id` is TEXT** — matches the trait's `id()` return; no game_systems table since systems are compiled in

---

## 5. API

### REST Endpoints

```
POST   /api/campaigns/:id/characters          — create character (name, game_system_id, portrait_asset_id?)
GET    /api/campaigns/:id/characters          — list campaign characters
GET    /api/characters/:id                    — get character + all field values + bonus entries
PUT    /api/characters/:id                    — update name, portrait
DELETE /api/characters/:id                    — delete character

GET    /api/game-systems                      — list available game systems (id, name, version)
GET    /api/game-systems/:id/schema           — get sheet schema (sections, fields, layout hints, bonus types)

POST   /api/characters/:id/export             — export as JSON
POST   /api/campaigns/:id/characters/import   — import from JSON

POST   /api/characters/:id/bonuses            — add bonus entry (field_id, source, bonus_type, value)
DELETE /api/characters/:id/bonuses/:bonus_id   — remove bonus entry
PUT    /api/characters/:id/bonuses/:bonus_id   — update bonus entry
```

### WebSocket Messages

```rust
// Client → Server
UpdateCharacterFields {
    character_id: Uuid,
    fields: HashMap<String, serde_json::Value>,  // only changed raw fields
}

AddCharacterBonus {
    character_id: Uuid,
    field_id: String,
    source: String,
    bonus_type: String,
    value: i64,
}

RemoveCharacterBonus {
    character_id: Uuid,
    bonus_id: Uuid,
}

UpdateCharacterBonus {
    character_id: Uuid,
    bonus_id: Uuid,
    source: Option<String>,
    bonus_type: Option<String>,
    value: Option<i64>,
}

LinkTokenToCharacter {
    token_id: Uuid,
    character_id: Option<Uuid>,  // None to unlink
}

// Server → Client
CharacterFieldsUpdated {
    character_id: Uuid,
    fields: HashMap<String, serde_json::Value>,  // raw + all recomputed derived fields
    updated_by: Uuid,
}

CharacterBonusAdded {
    character_id: Uuid,
    field_id: String,
    bonus: BonusEntry,
    computed_total: i64,          // new total for the field after stacking
}

CharacterBonusRemoved {
    character_id: Uuid,
    bonus_id: Uuid,
    field_id: String,
    computed_total: i64,
}

CharacterBonusUpdated {
    character_id: Uuid,
    bonus: BonusEntry,
    field_id: String,
    computed_total: i64,
}

TokenCharacterLinked {
    token_id: Uuid,
    character_id: Option<Uuid>,
}
```

### Update Flow

1. Player edits a field (e.g., STR score) or modifies a bonus entry
2. Client debounces (300ms for field edits; bonus changes send immediately)
3. Client sends `UpdateCharacterFields` or bonus message via WebSocket
4. Server validates against schema, persists to DB
5. Server calls `compute_derived()` with current field values and bonus map
6. Server broadcasts `CharacterFieldsUpdated` (or bonus response) to all session clients
7. If a token is linked, server updates token bars and broadcasts `TokenUpdated`
8. Client Zustand store updates, React re-renders affected fields

---

## 6. Client Architecture

### Zustand Store

```typescript
interface CharacterStore {
    characters: Map<string, Character>;
    activeCharacterId: string | null;
    schemas: Map<string, SheetSchema>;  // cached per game system

    // Actions
    loadCharacters(campaignId: string): Promise<void>;
    loadCharacter(characterId: string): Promise<void>;
    fetchSchema(gameSystemId: string): Promise<SheetSchema>;
    setActiveCharacter(characterId: string | null): void;

    // Field updates (debounced → WS)
    updateField(characterId: string, fieldId: string, value: unknown): void;

    // Bonus management (immediate → WS)
    addBonus(characterId: string, fieldId: string, source: string, bonusType: string, value: number): void;
    removeBonus(characterId: string, bonusId: string): void;
    updateBonus(characterId: string, bonusId: string, updates: Partial<BonusEntry>): void;

    // Handle server broadcasts
    handleFieldsUpdated(msg: CharacterFieldsUpdated): void;
    handleBonusAdded(msg: CharacterBonusAdded): void;
    handleBonusRemoved(msg: CharacterBonusRemoved): void;
}
```

### Component Tree

```
CharacterSheet                 — top-level, reads schema + values from store
├── CharacterHeader            — name (editable), portrait, system name
├── SheetSection (per section) — picks layout component from SectionLayout
│   ├── GridLayout             — fields in N-column grid
│   ├── ListLayout             — fields in vertical list
│   ├── TableLayout            — fields in table with column headers
│   └── TabbedLayout           — fields grouped into tabs
│       └── FieldWidget        — picks input component from FieldType
│           ├── NumberInput     — Integer fields
│           ├── TextInput       — Text fields
│           ├── TextArea        — LongText fields
│           ├── Checkbox        — Boolean fields
│           ├── Dropdown        — Choice fields
│           ├── AbilityScoreWidget  — score + modifier pair
│           ├── ResourceBarWidget   — current/max with bar
│           └── BonusStackedWidget  — collapsible bonus breakdown
│               ├── BonusEntryRow   — single bonus entry (editable or derived)
│               └── AddBonusPopover — form for new bonus entry
├── CharacterCreateDialog      — wizard: pick system → name/portrait → done
└── CharacterList              — campaign character browser
```

### Rendering Rules

- **Editable fields**: dashed underline in idle state, solid blue border on focus
- **Derived fields**: purple tint background, no edit affordance, no cursor change
- **Unsaved indicator**: small orange dot on the field while debouncing
- **BonusStacked fields**: collapsed by default showing total; chevron to expand breakdown
- **Suppressed bonuses**: visible but dimmed with strikethrough in expanded view

### Sheet Panel

The character sheet opens as a **side panel** (right side), not a full-page view. The player can reference their sheet while viewing the map. The panel is resizable and collapsible.

---

## 7. Character Creation

A minimal dialog flow:

1. **Select game system** — dropdown populated from `GET /api/game-systems`. With only one system registered, this auto-selects.
2. **Name and portrait** — character name (required text input), portrait (optional, pick from campaign asset library).
3. **Create** — `POST /api/campaigns/:id/characters` with name, game_system_id, portrait_asset_id. Server creates the character with `default_fields()` from the plugin and returns the character with all fields.
4. **Sheet opens** — the character sheet panel opens immediately with default values. Player edits from there.

No multi-step ability generation, class selection, or guided character building in SP-3. That complexity is game-system-specific and belongs in SP-3a (the 3.5e plugin can add a guided creation wizard on top of the base flow).

---

## 8. Character Visibility & Permissions

### Ownership Model

- Characters are **campaign-scoped** — a character belongs to exactly one campaign
- **Owner**: the user who created the character (full read/write)
- **DM**: full read/write on all characters in their campaign
- **Other players**: visibility controlled by DM

### DM Visibility Controls

Each character has a `visible_to_players: bool` field (default: true). When visible, other players see:

- Character name and portrait
- Fields where `field_visibility()` returns `Public` (game system decides which — e.g., HP yes, backstory no)
- Bonus breakdowns for public fields

When not visible, other players don't see the character at all.

### Field Visibility

The `GameSystem::field_visibility()` method returns per-field visibility:

- **`Public`** — all players in the campaign can see this field's value
- **`Private`** — only the owner and DM can see this field
- **`DmOnly`** — only the DM can see this field

The game system defines sensible defaults (HP and AC are public, notes and backstory are private). The DM can override visibility per character in a future enhancement, but SP-3 ships with game-system defaults only.

---

## 9. Token-Character Link

### Linking

- A token's `character_id` column is nullable. When set, the token is "linked" to that character.
- Linking is done via `LinkTokenToCharacter` WebSocket message (DM action).
- A character can be linked to multiple tokens (e.g., the same NPC placed on different maps).
- Unlinking sets `character_id` to NULL; the token keeps its current bar values as static data.

### Sync Behavior

When a token is linked to a character:

- **Token name** syncs from `character.name`
- **Token bars** map to character fields via `GameSystem::token_bar_mappings()`:
  ```rust
  struct TokenBarMapping {
      bar_index: usize,        // 0, 1, 2
      current_field: String,   // "hp_current"
      max_field: Option<String>, // "hp_max"
      label: String,           // "HP"
  }
  ```
- **Sheet → token**: when a character field that's mapped to a bar changes, the server broadcasts `TokenUpdated` with the new bar values
- **Token → sheet**: when the DM edits a token bar directly (e.g., subtracting HP in combat), the server updates the corresponding character field and broadcasts `CharacterFieldsUpdated`

### Unlinking

When a token is unlinked from a character, the token retains its current bar values as static data. The token reverts to manual bar editing (the pre-SP-3 behavior).

---

## 10. Import/Export

### JSON Export

`POST /api/characters/:id/export` returns a JSON document:

```json
{
    "format": "htbd-character-v1",
    "game_system_id": "dnd-3.5e",
    "game_system_version": "1.0.0",
    "name": "Aldric Stonehand",
    "fields": { "strength": 16, "hp_current": 32, ... },
    "bonuses": {
        "armor_class": [
            { "source": "Full Plate", "bonus_type": "armor", "value": 8 },
            ...
        ]
    },
    "exported_at": "2026-03-29T12:00:00Z"
}
```

### JSON Import

`POST /api/campaigns/:id/characters/import` accepts the same format. The server:

1. Validates `game_system_id` matches a registered system
2. Calls `GameSystem::import_character()` to parse and validate
3. Creates a new character in the campaign with the imported field values and bonuses
4. Returns the created character

### ImportAdapter Trait (Future)

The `GameSystem` trait includes `import_character()` and `export_character()` for the native JSON format. For future format support (D&D Beyond JSON, PCGen XML, etc.), game system plugins can implement additional format-specific parsing in SP-3a or later without changes to the core.

---

## 11. Stub Plugin

SP-3 ships with a minimal `StubGameSystem` for testing and development:

- `id`: `"stub"`
- 3-4 fields: name (Text), level (Integer), hp_current/hp_max (ResourcePool), armor_class (BonusStacked with a few bonus types)
- Simple `compute_derived()`: just copies values through
- Basic `bonus_types()`: untyped (stacks), enhancement (doesn't stack)
- Validates that the full pipeline works end-to-end

The real 3.5e implementation is SP-3a.

---

## 12. Testing

### Unit Tests

- Schema validation logic (field types, required fields, value ranges)
- Bonus stacking computation (non-stacking highest-wins, dodge stacking, suppression detection)
- `compute_derived()` with the stub plugin
- Field visibility filtering
- Import/export round-trip (export → import → same field values)
- Token bar mapping resolution

### Integration Tests (Rust)

- Character CRUD: create, read, update, delete via REST
- Field persistence: update fields via WebSocket, verify DB state
- Bonus CRUD: add/remove/update bonuses, verify stacking recomputation
- Computed field round-trip: update raw field → verify derived fields recomputed
- Token-character link: link token, update character field, verify token bar updated
- Permission enforcement: player can't edit another player's character, DM can edit any
- Import/export: export character, import into different campaign, verify field values match

### End-to-End Tests (Playwright)

- **Character creation**: create character via dialog, verify sheet opens with defaults
- **Sheet field editing**: change an ability score, verify modifier updates after server round-trip
- **Bonus management**: add a bonus entry, verify total updates; remove it, verify total reverts
- **Bonus stacking**: add two bonuses of same non-stacking type, verify only highest applies (lower shown as suppressed)
- **Sheet persistence**: edit fields, reload page, verify values persisted
- **DM editing player character**: DM opens player's sheet, edits a field, player sees the update
- **Token-character link**: link token to character, edit HP on sheet, verify token bar updates on canvas
- **Import/export**: export character, import into same campaign, verify new character has same values
- **Visibility**: set character to hidden, verify other player can't see it

---

## 13. Out of Scope

These are explicitly deferred:

- **3.5e system implementation** — SP-3a, depends on SP-7 for macros
- **Guided character creation wizards** — game-system-specific, belongs in SP-3a
- **WASM/Lua runtime plugins** — future enhancement if community demand warrants
- **Cross-campaign character sharing** — import/export covers the use case
- **DM per-field visibility overrides** — SP-3 ships with game-system defaults
- **Character versioning/history** — not needed until proven otherwise
- **Dice macros on character sheets** — SP-7
