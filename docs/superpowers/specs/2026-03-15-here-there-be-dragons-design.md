# Here There Be Dragons — Design Spec

An open-source virtual tabletop that explores what D&D looks like when AI agents sit at the table alongside human players.

## Core Question

Can non-human participants make tabletop RPGs better without making them less human?

## Experience Pillars

### 1. The VTT is the product

This is a virtual tabletop first. The AI features are a differentiator, but they are secondary. If the VTT isn't exceptional, nobody sticks around long enough to try the AI. Every design decision must pass the test: *does this make the tabletop better?*

### 2. The DM's fun matters

AI should make DMing more enjoyable, not turn the DM into a switchboard operator. What the AI handles vs. what the DM keeps is a tunable dial, not a fixed split. Most DMs will never touch the AI features — and that's fine. The ones who do should find it liberating, not overwhelming.

### 3. Immersion through voice

AI characters will eventually speak with distinct voices in real time. Players talk to NPCs naturally, and the NPCs talk back. Latency is the enemy — if an NPC pauses for 3 seconds before responding, the spell breaks. Voice is a separate module that plugs into well-defined interfaces; it does not exist at launch.

### 4. Open and community-driven

The design is public, the tradeoffs are documented honestly, and the architecture invites contribution. AI-in-TTRPG is uncharted territory; we need many perspectives to get it right.

---

## Experience Scenarios

These scenarios illustrate what playing with AI characters feels like in practice.

### The Tavern — Routine NPC Interaction

The party arrives in Millhaven after a long road. The DM narrates: *"You push open the door to the Rusty Anchor. It's warm inside, smells like stew and pipe smoke."* The DM has set up Bren, the barkeep — a gruff but kind AI character with a profile: knows local rumors, will sell rooms for 5 silver, doesn't know anything about the missing caravan (that's for a different NPC).

A player says, "Hey barkeep, what's good tonight?" Bren responds in character: "Stew's always good. Ale's better. You lot look like you've been on the road a while." The conversation flows naturally. The DM listens and watches the party explore. When a player asks Bren about the old ruins to the north, Bren stays in bounds: "I don't go near those hills. Nobody does. You want to know about that, talk to Old Maren at the temple."

The DM didn't have to voice Bren, manage the dialogue, or track what Bren should and shouldn't know. They set the character up and let the AI perform. The DM is free to think about what happens next.

### The Split Party — Parallel Conversations

The party splits up in a city. Two players go to the docks to investigate a lead. Two others stay at the inn to interrogate a captured spy. The DM is running the interrogation — that's the dramatic scene they care about.

Meanwhile, at the docks, the two players are talking to a harbormaster the DM set up as an AI character: knows ship manifests, is bureaucratic and unhelpful, will cave if bribed or intimidated. The AI harbormaster runs the conversation in real time. The players at the docks are having a full roleplay experience without the DM needing to context-switch.

**Protecting the DM's attention:** The DM's cognitive load is a scarce resource. The system protects it:

- **Interrupt-on-threshold** — the AI runs the dock conversation silently and only pings the DM when something hits a boundary: a player asks about something the NPC doesn't have info for, a player tries something unexpected, or the conversation touches a DM-flagged topic. Otherwise, no notification.
- **Post-conversation summary** — when the dock conversation wraps up, the DM gets a concise recap: "Players learned ships X and Y arrived last week. Harbormaster was bribed 10gp for access to the manifest. No plot boundaries were hit."
- **Pause & queue** — if the AI hits something it can't handle, it stalls in-character ("Hold on, let me check the records...") and queues the question for the DM to answer when they have a moment, rather than interrupting mid-scene.

### The DM Takes the Wheel

The party has tracked down Lady Ashworth, a key villain. The DM had her set up as an AI character for earlier social encounters — she was charming and evasive at the ball last session. But now, in the confrontation, the stakes are too high and the DM wants full control.

The DM hits "take the wheel" on Lady Ashworth. From this point, the DM runs her directly. The AI character indicator on the players' side changes to show this is now DM-controlled. The DM gets access to Ashworth's full AI conversation history from previous interactions, so they know exactly what she's already told the party. No continuity breaks.

---

## The DM Experience Dial

Every DM enjoys different parts of the game. There is no single correct split between human and AI. The system provides a per-character delegation level, defaulting to fully human-controlled.

| Level | Label | What the AI does | DM involvement |
|-------|-------|-------------------|----------------|
| 0 | **Off** (default) | Nothing. DM runs this character entirely. | Full |
| 1 | **Copilot** | Suggests responses the DM can use or edit. Tracks continuity across sessions. | DM speaks/types, AI assists |
| 2 | **Autopilot with guardrails** | AI runs the character within DM-defined boundaries. Flags boundary hits. Manages cognitive load (interrupt thresholds, summaries, pause & queue). | DM monitors, intervenes when needed |

Levels are set **per-character** and can be changed at any time mid-session. "Take the wheel" is simply moving a character from Level 1 or 2 to Level 0.

**Adoption expectations:** Most DMs will stay at Level 0. Some will experiment with Level 1. Few will use Level 2. The product must be excellent at Level 0 — AI features are invisible unless actively sought.

The DM can change the level at any time mid-session. "Take the wheel" moves any character from Level 1/2 to Level 0 instantly. The DM also has full player capabilities (voice, VTT interaction, character control) in addition to DM-specific tools — they are a player and a DM simultaneously.

---

## VTT Core Features

The VTT must cover the core features that make a virtual tabletop session-ready, using Roll20 as a reference point. This is the product. Everything below is required before AI features matter.

**Deployment model:** The VTT is a web-based client-server application. Players connect via browser. Campaigns, assets, and state are server-managed. Self-hosting is a first-class use case — an open-source project must not depend on a vendor's infrastructure to function. Details of hosting architecture (database, asset storage, real-time sync) are implementation concerns, but the commitment to self-hostability is a design constraint.

**Assumptions:** The current design assumes a single DM per session. Co-DM setups (common in West Marches-style play) are a potential future extension but are not in scope for the initial design.

### Maps & Rendering
- Upload and display battle maps
- Multiple layers (map, token, DM-only)
- Drawing tools for on-the-fly map creation
- Dynamic lighting and line-of-sight
- Fog of war (explored/unexplored)
- Light sources on tokens
- Smooth performance and fast load times

### Tokens & Characters
- Drag-and-drop token placement
- Token bars (HP, mana, etc.)
- Status markers and conditions
- Token vision and light emission
- Character sheets — editable, game-system-aware
- Character portraits and art

### Game Mechanics
- Full dice engine with visible rolls, whisper rolls
- Initiative tracker — sortable, editable, round tracking
- Measurement tools (distance, area of effect)

### Dice Macro Engine / DSL

A domain-specific language for writing dice macros that are both human-readable and produce rich visual output. This is a core VTT feature, not an afterthought.

**Design principles:**

- **Readable syntax** — a new player should be able to look at a macro and understand what it does. No cryptic bracket notation.
- **Character-sheet-aware** — macros reference character sheet fields via `@field_name`. The fields available depend on the game system plugin, but the DSL syntax is universal.
- **Rich visual output** — macros render as formatted cards in chat: dice shown visually with individual die faces, labels, color coding, conditional sections (crit/fail), embedded images, and character portraits.
- **Composable** — macros can call other macros. A "Full Attack" macro in 3.5e can chain multiple attack rolls at different BAB values.
- **Shareable** — DMs can create macros and share them with the table. Community macro libraries per game system.

The DSL should feel closer to writing markdown than writing code. It requires its own dedicated design phase to get the syntax, visual rendering, and character sheet binding right (see Open Questions).

**Example (illustrative, not final syntax):**

```
/attack "Longsword" {
  roll 1d20 + @str_mod + @bab
  damage 1d8 + @str_mod slashing
  on crit: damage + 1d8 slashing
}
```

Output: a formatted card showing the weapon name, roll result with dice visuals, damage calculation, and crit highlighting.

```
/check Persuasion {
  roll 1d20 + @cha_mod + @persuasion_ranks
  dc 15
  on success: "The merchant lowers the price"
  on fail: "The merchant scoffs"
}
```

Output: a skill check card with pass/fail state, modifier breakdown, and flavor text.

### AI Map Generation (DM Tool)

A DM prep tool that generates battle maps from natural language descriptions, constrained to the VTT's grid system. This is a creative tool for the DM, not a session-time feature — it lives in the map editor, not the live session.

**How it works:**

1. The DM describes the map in plain language: *"A 30x20 tavern interior. Bar along the north wall, four round tables in the center, a fireplace on the east wall, a staircase in the southwest corner leading up, and a back door behind the bar."*
2. The DM sets grid dimensions (e.g., 30x20 squares) and style preferences (parchment, realistic, dark fantasy, etc.)
3. The system generates a map that fits the grid exactly — no resizing, no alignment issues
4. The DM iterates: *"Move the staircase to the southeast corner. Add a storage room behind the bar accessible through the back door."*
5. Once satisfied, the map is saved directly to the campaign asset library, grid-aligned and ready for play

**Design principles:**

- **Grid-native** — generated maps respect the grid dimensions the DM specifies. A 30x20 map is exactly 30x20 squares. Walls align to grid lines. This is non-negotiable — a beautiful map that doesn't align to the grid is useless for tactical play.
- **Iterative** — the DM should be able to refine through conversation, not start over each time. "Add a secret passage between these two rooms" should modify the existing map.
- **Style-consistent** — a campaign's maps should be able to share a visual style. If the DM picks "dark fantasy parchment," all generated maps should feel cohesive.
- **DM prep, not live generation** — this is for session prep or between-session work. No latency pressure. Quality over speed.

Like the voice module, this depends on external AI services (image generation models). It should support BYO API key and ideally multiple providers. The interface should be defined early so it can be built as a module.

### Content & Communication
- Handouts and journals (player-visible vs. DM-only)
- Text chat with roll integration and whispers
- Asset library for maps, tokens, and character art
- Campaign management — persistent campaigns, session history

### Audio/Video

Human-to-human voice and video chat ships in Phase 1 as a core VTT feature. This is not optional — "use Discord on the side" is one of Roll20's biggest pain points and we will not repeat it.

Phase 3 builds the AI voice pipeline (STT → LLM → TTS) on top of the same audio infrastructure. Phase 1 defines the interfaces that Phase 3 will plug into, so the AI voice module slots in without retrofitting. See the [Voice Architecture](#voice-architecture-interfaces-in-phase-1-implementation-in-phase-3) section for details.

### Game System Architecture
- **Platform-agnostic** — the core VTT does not assume any specific game system
- **Plugin-based** — game systems are modules that define character sheet fields, rules, and macros
- **3.5e ships first** — the first supported system, with deeper mechanical support
- **Community-extensible** — architecture supports community-contributed plugins for 5e, Pathfinder, and other systems

### Accessibility
- Keyboard navigation for all core features
- Screen reader support for chat, character sheets, and dice results
- Colorblind-friendly defaults for tokens, status markers, and dynamic lighting
- Accessibility is a baseline, not a stretch goal

### Where We Aim to Improve on Roll20
- Modern UI/UX (Roll20's interface is dated)
- Integrated voice/video, not "use Discord on the side"
- A dice macro DSL that's readable and produces beautiful output
- Performance — smooth rendering, fast loads
- Accessible by default
- Open source — community can extend, theme, contribute

---

## AI Character System (Opt-in, Phase 2)

All AI features are opt-in. The default experience has no AI involvement.

### NPC Character Profiles

When a DM enables AI for a character (Level 1 or 2), they configure:

- **Personality** — tone, mannerisms, speech patterns
- **Knowledge** — what this character knows and doesn't know
- **Goals** — what the character wants from interactions
- **Boundaries** — topics the character will not engage with or information they will never reveal
- **Escalation triggers** — conditions that cause the AI to flag the DM rather than respond autonomously

### Transparency

AI-controlled characters are visibly marked in the UI. Players always know when they're interacting with an AI character vs. a DM-controlled one. This is by design — the voices and behavior will be distinct, so pretending otherwise would be disingenuous.

**Conscious tradeoff:** When the DM "takes the wheel" on a character, the indicator changes — which gives players a meta-signal that something important is happening. We accept this as a transparency-over-immersion tradeoff. Hiding the indicator would mean players can't trust the UI, which is worse.

### Player Experience with AI Characters

The player's interaction with an AI NPC should feel like talking to any other character at the table — just one that happens to respond faster and more consistently than a DM juggling five NPCs.

- **AI characters appear in chat and (eventually) voice like any NPC** — the only visual difference is a subtle indicator showing AI vs. DM control
- **Players interact normally** — they speak or type to the NPC; no special syntax or mode-switching required
- **Players cannot opt out of AI on a per-character basis** — if the DM has set a character to Level 2, that's a DM decision. However, a player who prefers DM-only interaction can tell their DM, and the DM can adjust. This is a social contract, not a system feature.
- **When an AI stalls** (pause & queue), it stays in character — the player sees a natural conversational pause ("Let me think on that..."), not a loading spinner

### Cognitive Load Management

When AI characters are running parallel to the DM's active scene:

- The DM's attention is treated as a scarce resource
- AI conversations run silently unless a boundary or escalation trigger is hit
- Post-conversation summaries are generated automatically
- The AI can stall in-character to queue questions for the DM
- The system never forces the DM to context-switch

---

## Voice Architecture (Interfaces in Phase 1, Implementation in Phase 3)

Voice is a separate module. Phase 1 defines the interfaces it will plug into. Phase 3 builds it. Until then, it's a black box.

### Interface Requirements (Phase 1)

The VTT must define clean interfaces for:

- **Audio input/output routing** — where voice data flows between participants
- **Character-to-voice mapping** — associating a character with a voice identity
- **Speech event hooks** — knowing when a player starts/stops speaking, and to whom
- **AI response injection** — a channel for AI-generated audio to enter the voice stream

### Implementation Vision (Phase 3)

**Pipeline:**
```
Player speaks → STT → LLM generates response → TTS → Player hears NPC
```

**Latency target:** Under 1.5 seconds from end of player speech to start of NPC audio response.

**Latency strategy:** Streaming pipeline — STT streams partial transcripts to the LLM, LLM begins generating immediately, TTS synthesizes and plays from the first sentence while the rest is still being generated.

**Voice identity:** Each AI character gets a distinct voice profile (target). Fallback: single TTS voice with character identity conveyed through text labels.

---

## Project Phases

### Phase 1: Exceptional Virtual Tabletop
- All VTT core features listed above (maps, tokens, lighting, dice, character sheets, chat)
- Human-to-human voice/video chat (integrated, not bolted on)
- AI map generation tool for DM session prep
- Game system plugin architecture with 3.5e as first system
- AI voice and character interfaces defined (not implemented)
- The product stands alone as an excellent VTT with zero AI NPC involvement

### Phase 2: Text-Based AI Characters
- NPC character profiles and boundaries
- DM delegation dial (Levels 0–2)
- Copilot mode (Level 1) and Autopilot with guardrails (Level 2)
- Take-the-wheel controls
- Cognitive load management for parallel conversations
- All AI interaction via text chat
- Entirely opt-in; default remains Level 0

### Phase 3: AI Voice Module
- STT → LLM → TTS pipeline for AI characters (human voice/video already exists from Phase 1)
- Per-character voice profiles
- Streaming architecture for conversational latency
- Crosstalk and turn-taking handling
- Fallback to single voice when latency is untenable

### Ongoing: Game System Plugins
- The plugin architecture and 3.5e system ship with Phase 1; community contributions begin after the plugin API stabilizes
- Community contributes additional systems (5e, Pathfinder, etc.)
- Each system defines its character sheet fields, rules, and macro libraries

---

## Open Questions

These are deliberately unresolved. They need research, prototyping, or playtesting.

1. **Session memory vs. context limits** — AI characters need to remember what happened earlier in the session and across sessions. LLM context windows are finite. How do we manage long-running campaign memory? Summarization? Retrieval-augmented generation?

2. **Character boundary enforcement** — when an AI NPC is set to "doesn't know about the missing caravan," how hard is that boundary? Players will try to trick, persuade, or intimidate information out of NPCs. The AI needs to stay in bounds without breaking character. This is a prompt engineering challenge with gameplay consequences.

3. **Cost at scale** — LLM inference + TTS for every NPC conversation across a 4-hour session adds up. How do we handle this for an open-source project? BYO API key? Hosted tier? Local model support?

4. **Crosstalk and turn-taking** — in voice, how does the system know when a player is talking to an NPC vs. talking to another player? How does it handle interruptions?

5. **Content safety** — AI characters exist in a fantasy world where players may push boundaries. How do we handle this responsibly without being heavy-handed? Per-table configuration seems likely.

6. **DM cognitive load measurement** — we want to protect the DM's attention, but how do we know if we're succeeding? Playtesting metrics? In-session feedback mechanisms?

7. **Dice macro DSL design** — the macro language needs its own design phase. Syntax, rendering engine, character sheet binding, composability, and community sharing all need dedicated exploration.

8. **Local vs. cloud AI** — the spec assumes LLM inference, but doesn't commit to where it runs. Cloud-hosted (OpenAI, Anthropic, etc.) gives best quality but raises privacy concerns — players may not want in-character conversations sent to third-party servers. Local models (Ollama, llama.cpp) give privacy and zero marginal cost but sacrifice quality. This is an architecture decision, a privacy decision, and a cost decision rolled into one.

9. **AI error recovery** — when an AI NPC says something that breaks continuity, contradicts established lore, or doesn't make sense, what's the DM's recovery path? "Take the wheel" handles going forward, but not correcting what was just said. The DM needs a way to retcon an AI response mid-conversation without breaking immersion ("Actually, what the barkeep meant was...").

10. **Text-based AI response latency (Phase 2)** — the spec defines a 1.5-second latency target for voice (Phase 3), but says nothing about acceptable response time for text-based AI chat. Text has more tolerance than voice, but a 10-second wait for a chat response from a tavern keeper still breaks flow. Needs a stated target.
