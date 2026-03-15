# Phase 1 Roadmap: Exceptional Virtual Tabletop

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose Phase 1 into sub-projects with a build sequence, so each can go through its own design → plan → implementation cycle.

**Architecture:** Not yet chosen. The first sub-project (SP-0) establishes the tech stack and foundational architecture. All subsequent sub-projects build on those decisions.

**Tech Stack:** To be determined in SP-0. Key constraints: web-based client-server, self-hostable, browser clients, real-time sync, open-source friendly licensing.

---

## Why This Plan Exists

The Phase 1 design spec describes a complete virtual tabletop with 10+ major subsystems. Writing code-level implementation plans for all of them at once would be premature because:

1. **No tech stack is chosen** — framework, language, database, real-time protocol, rendering approach all need decisions
2. **Subsystems have dependencies** — the dice DSL needs the chat system, map rendering needs the grid engine, character sheets need the plugin architecture
3. **Each subsystem is large enough for its own spec** — the dice macro DSL alone needs a dedicated design phase (acknowledged in the spec's open questions)

This roadmap defines the sub-projects, their dependencies, and the order to build them. Each sub-project follows the full cycle: brainstorm → spec → plan → implement.

---

## Cross-Cutting Requirements

These apply to every sub-project. They are not separate tasks — they are constraints on how every sub-project is built.

**Accessibility:** Accessibility is a baseline, not a stretch goal. Every sub-project must include:
- Keyboard navigation for all interactive elements
- Screen reader support (ARIA labels, semantic HTML, live regions for real-time updates)
- Colorblind-friendly defaults (no color-only indicators, configurable palettes)
- Accessibility requirements are part of SP-0's foundation (component library, design tokens) and enforced in every subsequent sub-project's acceptance criteria

**Testing:** Each sub-project includes its own test plan covering all three levels. A feature without coverage at each applicable level is not complete:
- **Unit tests** for business logic, data transformations, state management, and isolated component rendering
- **Integration tests** (backend) for cross-crate flows hitting a real database — auth, campaign lifecycle, asset operations, WebSocket sessions
- **End-to-end tests (Playwright)** for every major piece of user-facing functionality, exercising the full stack (browser → server → database) through real UI interactions. Specific coverage requirements per sub-project:
  - SP-0: auth flows, campaign create/join, asset upload/browse/delete, canvas initialization, multi-user session
  - SP-1: map upload and display, token placement and drag, grid snap, pan/zoom, drawing tools, measurement tools
  - SP-2: multi-client state sync (token moves, map changes visible across browsers), reconnect after disconnect, session persistence
  - SP-3: character creation, sheet field editing, computed value updates, sheet persistence across reload
  - SP-4: send/receive chat messages across users, whispers, character-attributed messages, initiative tracker round flow, handout visibility controls
  - SP-5: wall placement, fog of war reveal/hide, per-token vision (player sees only what their token sees), lighting updates on token move — visual regression snapshots for lighting/fog rendering
  - SP-6: voice/video connection establishment, mute/unmute, push-to-talk, multi-participant audio
  - SP-7: dice macro execution from chat, roll card rendering, conditional branching (if/then), character sheet field binding, macro composition
  - SP-8/SP-9: AI generation request flow, iterative refinement, save-to-asset-library
- **Visual regression tests** (Playwright screenshots) for the rendering engine (SP-1, SP-5): canvas snapshots that catch regressions in grid, token, lighting, and fog of war rendering
- **Multi-client integration tests** for real-time features (SP-2, SP-4, SP-6): Playwright multi-browser-context tests verifying that actions by one user are visible to others in real time
- Playwright infrastructure (Docker Compose test stack, test helpers, fresh DB per suite) is established in SP-0 and used by all subsequent sub-projects

**Phase 2/3 Interface Stubs:** The design spec says Phase 1 "defines interfaces" for AI characters (Phase 2) and AI voice (Phase 3). Voice interfaces are defined in SP-6. AI character interfaces (NPC profiles, delegation dial, take-the-wheel, cognitive load management) will be defined as part of Phase 2's first sub-project — they require enough understanding of the Phase 2 design that stubbing them prematurely in Phase 1 would produce the wrong abstractions. Phase 1 focuses on building a great VTT; Phase 2 defines its own interfaces when it begins.

---

## Sub-Project Dependency Map

```
SP-0: Tech Stack & Foundation (includes asset library)
 ├── SP-1: Grid & Map Rendering Engine
 │    └── SP-5: Dynamic Lighting & Fog of War (also needs SP-2)
 ├── SP-2: Real-Time Sync & Session Infrastructure
 │    ├── SP-4: Chat, Handouts & Communication System
 │    │    └── SP-7: Dice Macro DSL (also needs SP-3)
 │    └── SP-6: Audio/Video Chat
 ├── SP-3: Game System Plugin Architecture
 │    ├── SP-7: Dice Macro DSL (also needs SP-4)
 │    ├── SP-3a: 3.5e System Plugin (also needs SP-7)
 │    └── SP-9: AI Token Generation (also needs SP-1, SP-0 asset library)
 └── SP-8: AI Map Generation (also needs SP-1)
```

---

## Sub-Projects in Build Order

### SP-0: Tech Stack & Foundation

**What:** Choose the tech stack and build the foundational project skeleton — build system, dev environment, deployment pipeline, database, auth, asset library, and the basic client-server shell that everything else plugs into.

**Key decisions:**
- Frontend framework (React, Svelte, SolidJS, etc.)
- Rendering approach for the canvas (HTML Canvas, WebGL, PixiJS, Konva, etc.)
- Backend language/framework (Node, Rust, Go, Python, etc.)
- Database (PostgreSQL, SQLite, etc.)
- Real-time protocol (WebSockets, WebRTC data channels, etc.)
- Asset storage (local filesystem, S3-compatible, etc.)
- Auth model (self-hosted accounts, OAuth, etc.)
- Accessibility foundation (component library with ARIA support, design tokens for colorblind-safe palettes)

**Also includes:**
- Asset library — upload, organize, tag, and share files within a campaign. This is foundational infrastructure that multiple sub-projects depend on (AI map gen, AI token gen, map uploads, character portraits). Built as part of the foundation rather than buried in a later sub-project.
- CI/CD pipeline and self-hosted deployment story

**Output:** A running app skeleton — you can log in, create a campaign, upload assets to a library, and see an empty canvas. Nothing else works yet, but the foundation is solid and the dev experience is good.

**Dependencies:** None. This is the root.

**Estimated complexity:** Medium-high. The decisions made here have long-lasting consequences, and self-hostability adds deployment complexity.

---

### SP-1: Grid & Map Rendering Engine

**What:** The core canvas — grid rendering, map image display, layers (map/token/DM), pan/zoom, and basic drawing tools. Tokens can be placed and moved on the grid.

**Key features:**
- Configurable grid (square, hex) with snap-to-grid
- Map image upload and display, aligned to grid
- Multiple layers with DM-only visibility
- Token placement, movement, and sizing (1x1, 2x2, 3x3, etc.)
- Token bars (HP, etc.) and status markers
- Pan, zoom, and smooth performance at scale
- Basic drawing tools (lines, shapes, freehand)
- Measurement tools (distance, area templates)

**Output:** A functional battle map. DM uploads a map, places tokens, players see their tokens and can move them. No lighting, no fog — just the spatial foundation.

**Dependencies:** SP-0

**Estimated complexity:** High. The rendering engine is the most performance-critical piece of the entire VTT.

---

### SP-2: Real-Time Sync & Session Infrastructure

**What:** The multiplayer backbone — how clients stay in sync, how sessions are managed, and how game state is persisted. This is a generic sync protocol that any subsystem (canvas, chat, character sheets, initiative) can consume.

**Key features:**
- Real-time state sync (generic — token positions, map changes, chat, any shared state)
- Session management (create, join, leave, reconnect)
- Campaign persistence (save/load state between sessions)
- DM vs. player permissions model
- Conflict resolution (two people interact with the same state simultaneously)
- Reconnect handling (what happens when someone drops)

**Output:** Multiple browsers can connect to the same session and see shared state updates in real time. State persists between sessions. The sync protocol is generic enough that SP-1 (canvas), SP-4 (chat), and future subsystems all consume it.

**Dependencies:** SP-0

**Note:** SP-2 does not depend on SP-1. The sync engine is infrastructure — it syncs abstract state. Integration with the canvas (syncing token positions, map changes) happens when both SP-1 and SP-2 are ready, but neither blocks the other's core development.

**Estimated complexity:** High. Real-time sync with conflict resolution is architecturally complex.

---

### SP-3: Game System Plugin Architecture

**What:** The abstraction layer that makes the VTT game-system-agnostic. Defines what a plugin is, what it provides, and how the rest of the system consumes it.

**Key features:**
- Plugin interface definition (what a game system must provide)
- Character sheet schema (fields, types, computed values, layout)
- Character sheet renderer (displays a sheet from the schema)
- Plugin registration and loading
- Character creation flow
- Import/export of character data

**Plugin interface (minimum):**
- Character sheet field definitions
- Dice roll types and modifiers
- Macro library (default macros for the system)
- Creature size categories (for token sizing)
- Initiative rules (what to roll, how to sort, tiebreaking)

**Output:** You can install a game system plugin, create a character with that system's character sheet, edit fields, and see the sheet rendered in the UI. No dice rolling yet — that's the macro DSL.

**Dependencies:** SP-0

**Note:** SP-3 does not depend on SP-1 (the rendering engine). Character sheets are a UI component independent of the canvas. The plugin architecture — schema definitions, field types, computed values, plugin loading — is entirely independent of how grids render.

**Estimated complexity:** Medium-high. Getting the abstraction right is the challenge.

---

### SP-3a: 3.5e System Plugin

**What:** The first game system plugin. Implements the D&D 3.5 edition character sheet, default macros, and system-specific rules.

**Key features:**
- Complete 3.5e character sheet (abilities, skills, saves, BAB, AC, HP, spells, equipment, feats)
- Computed fields (skill totals = ranks + ability mod + misc, etc.)
- Default macro library for common actions (attack, skill check, save, etc.)
- Creature size categories mapped to grid sizes
- Initiative rules (1d20 + Dex mod, tiebreaker by Dex score)

**Output:** A player can create a 3.5e character, fill in their sheet, and the computed values update correctly. Default macros are available.

**Dependencies:** SP-3, SP-7 (macros need the DSL)

**Relationship to SP-3:** SP-3 defines the plugin interfaces; SP-3a implements them for 3.5e. The two are designed together — 3.5e is the driving use case that validates the plugin architecture. SP-3 can be built and tested with a minimal stub plugin, but the real validation comes when SP-3a implements the full 3.5e system. The 3.5e macro library specifically waits for SP-7 (Dice DSL).

**Estimated complexity:** Medium. The rules are well-documented; the work is encoding them correctly.

---

### SP-4: Chat, Handouts & Communication System

**What:** Text chat with rich features, plus handouts, journals, and the initiative tracker — everything players and DMs use to communicate and manage session flow outside the canvas.

**Key features:**
- Real-time text chat
- Character-attributed messages (speak "as" a character, with portrait)
- Whispers (player-to-player, player-to-DM)
- System messages (initiative announcements, session events)
- Roll result display (formatted cards from the dice DSL)
- Chat history (persisted per session, searchable)
- Emotes and out-of-character markers
- Handouts and journals (DM-created documents with visibility controls: player-visible vs. DM-only)
- Initiative tracker (sortable, editable, round tracking — integrates with game system plugin for initiative rules)

**Output:** Players and DM can chat in real time, speak as characters, whisper, and see formatted roll results in the chat stream. DM can create handouts and journals with player visibility controls. Initiative tracker manages combat turn order.

**Dependencies:** SP-0, SP-2 (needs real-time sync)

**Estimated complexity:** Medium. Standard real-time chat, but the rich formatting (roll cards, character attribution), handouts, and initiative tracker add breadth.

---

### SP-5: Dynamic Lighting & Fog of War

**What:** The advanced rendering layer — line-of-sight calculations, light sources, fog of war, and vision modes.

**Key features:**
- Fog of war (DM reveals/hides areas, explored areas stay dimmed)
- Light sources on tokens (torches, darkvision, custom radius)
- Wall segments that block light and line-of-sight
- Per-token vision (each player sees only what their token can see)
- DM sees everything, players see only their token's perspective
- Door segments (can be opened/closed to change line-of-sight)

**Output:** A map with walls, doors, and light sources. Players see only what their tokens can see. DM can reveal areas with fog of war. Dynamic lighting updates in real time as tokens move.

**Dependencies:** SP-1 (needs the rendering engine and grid), SP-2 (per-token vision must sync in real time — when a token moves, other players' views update)

**Estimated complexity:** High. Raycasting / line-of-sight algorithms with real-time performance is technically demanding.

---

### SP-6: Audio/Video Chat

**What:** Integrated voice and video chat — human-to-human, built into the VTT, not a separate service. This is a core VTT feature, not optional.

**Key features:**
- Voice chat with push-to-talk and voice activation options
- Video chat (optional, toggleable per user)
- Spatial audio (optional: volume based on token distance)
- Mute/deafen controls
- Voice activity indicators on tokens
- Low-latency, peer-to-peer where possible

**Interface stubs for Phase 3 (AI voice):**
- Audio input/output routing hooks
- Character-to-voice mapping interface
- Speech event hooks (start/stop/who)
- AI response injection channel

**Output:** Players and DM can voice and video chat within the VTT. Phase 3 AI voice interfaces are defined but not implemented.

**Dependencies:** SP-2 (needs session infrastructure for peer discovery)

**Estimated complexity:** High. WebRTC integration, TURN/STUN servers for NAT traversal, audio processing.

---

### SP-7: Dice Macro DSL

**What:** The domain-specific language for dice macros — parser, evaluator, and rich visual renderer.

**Key features:**
- DSL parser (human-readable syntax → AST)
- Dice evaluator (roll dice, apply modifiers, resolve conditionals)
- Character sheet binding (`@field_name` resolves against active character)
- Rich output renderer (formatted cards with dice visuals, labels, color coding)
- Conditional blocks (on crit, on fail, DC checks)
- Macro composition (macros calling other macros)
- Macro sharing (save, load, share within campaign or publicly)
- Macro editor with syntax highlighting and preview

**Output:** Players and DMs can write macros in the DSL, execute them, and see beautifully formatted roll cards in chat. Macros pull from character sheets and compose together.

**Dependencies:** SP-3 (needs character sheet binding), SP-4 (output renders in chat)

**Estimated complexity:** High. Language design, parser, evaluator, and rich rendering are each non-trivial. This needs its own dedicated design spec before implementation.

---

### SP-8: AI Map Generation

**What:** DM prep tool that generates grid-aligned battle maps from natural language descriptions.

**Key features:**
- Natural language map description input
- Grid dimension specification (width x height in squares)
- Style presets (parchment, realistic, dark fantasy, etc.)
- Iterative refinement via conversation
- Grid-native output (exact dimensions, walls on grid lines)
- Save to campaign asset library
- BYO API key for image generation providers
- Multiple provider support (modular interface)

**Output:** DM describes a map, sets dimensions, picks a style, and generates a grid-aligned map. Can iterate and refine. Saves directly to the asset library.

**Dependencies:** SP-0 (needs the asset library), SP-1 (needs the grid system to define correct dimensions)

**Estimated complexity:** Medium-high. The VTT integration is straightforward; the challenge is prompt engineering for grid-aligned output from image generation models. Getting consistent, usable maps with walls aligned to grid lines is an unsolved problem with current image generation — expect R&D risk.

---

### SP-9: AI Token Generation

**What:** DM prep tool that generates correctly-sized tokens from natural language descriptions.

**Key features:**
- Natural language character/creature description input
- Correct token sizing per creature category (1x1, 2x2, etc.)
- Circular crop, transparent background, correct pixel dimensions
- Style presets (consistent with map styles)
- Iterative refinement via conversation
- Batch generation (multiple related tokens at once)
- Save to campaign asset library
- Same provider model as map generation (BYO API key, multi-provider)

**Output:** DM describes a character or creature, system generates a correctly-sized token. Can iterate, batch-generate, and save to the asset library.

**Dependencies:** SP-0 (needs asset library), SP-1 (needs grid system for sizing), SP-3 (needs creature size categories from game system plugin)

**Estimated complexity:** Low-medium. Simpler than map generation — tokens are single images with well-defined output requirements.

---

## Recommended Build Sequence

The dependency map suggests this build order, with significant parallelism possible:

```
Phase 1a: Foundation
  SP-0: Tech Stack & Foundation

Phase 1b: Core Systems (all start after SP-0, can parallelize)
  SP-1: Grid & Map Rendering Engine
  SP-2: Real-Time Sync & Session Infrastructure
  SP-3: Game System Plugin Architecture
  → Integration milestone: SP-1 + SP-2 connected (multiplayer canvas)

Phase 1c: Session Features (after SP-2)
  SP-4: Chat, Handouts & Communication System
  SP-6: Audio/Video Chat (core VTT feature, not optional)
  → SP-4 and SP-6 can parallelize; both depend on SP-2

Phase 1d: Game Mechanics (after SP-3 + SP-4)
  SP-7: Dice Macro DSL (needs its own design spec first)
  SP-3a: 3.5e System Plugin (after SP-7)

Phase 1e: Advanced Rendering (after SP-1 + SP-2)
  SP-5: Dynamic Lighting & Fog of War

Phase 1f: AI DM Tools (after core systems exist)
  SP-8: AI Map Generation
  SP-9: AI Token Generation
```

**Key parallelism opportunities:**
- SP-1, SP-2, and SP-3 can all begin immediately after SP-0
- SP-4 and SP-6 can parallelize after SP-2
- SP-5 can develop alongside Phase 1c/1d work
- SP-8 and SP-9 can parallelize with each other

**Recommended first sub-project to spec out:** SP-0 (Tech Stack & Foundation). Everything depends on it, and the tech stack decisions shape every subsequent sub-project.

---

## Next Steps

Each sub-project follows the full cycle:

1. **Brainstorm** — explore the design space for that subsystem (use superpowers:brainstorming)
2. **Spec** — write a detailed spec with decisions, tradeoffs, and open questions
3. **Plan** — write code-level implementation plan with TDD steps
4. **Implement** — build it
5. **Review** — validate against spec

Start with SP-0. The tech stack decisions will unblock everything else.
