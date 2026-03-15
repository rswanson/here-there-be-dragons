# SP-0: Tech Stack & Foundation — Design Spec

The foundational architecture and tech stack for Here There Be Dragons. Every subsequent sub-project builds on the decisions made here.

**Parent spec:** [Here There Be Dragons Design Spec](2026-03-15-here-there-be-dragons-design.md)
**Roadmap:** [Phase 1 Roadmap](../plans/2026-03-15-phase1-roadmap.md)
**License:** AGPL-3.0 — ensures the project stays open-source even when hosted as a service, while remaining compatible with the Rust and JavaScript ecosystems. All dependencies must be AGPL-compatible.

---

## Tech Stack Summary

| Layer | Choice | Key Dependencies |
|-------|--------|-----------------|
| Frontend | React + TypeScript | Vite, PixiJS, Zustand, TanStack Query |
| Canvas rendering | PixiJS (WebGL) | Custom integration via React ref |
| Backend | Rust + Axum | `tokio`, `tower`, `serde`, `tracing` |
| Database | PostgreSQL | `sqlx` (compile-time checked queries) |
| Real-time | WebSockets | Axum built-in WebSocket support |
| Asset storage | Local filesystem, optional S3 | `tokio::fs`, `aws-sdk-s3` |
| Auth | Email/password, JWT sessions | `argon2`, `jsonwebtoken` |
| Type sharing | Rust → TypeScript codegen | `ts-rs` |
| Accessibility | Radix UI primitives, design tokens | `@radix-ui/react-primitives` |
| Deployment | Docker Compose | Multi-stage Dockerfile |

---

## Project Structure

```
here-there-be-dragons/
├── crates/
│   ├── server/          # Axum HTTP + WebSocket server, routes, middleware
│   ├── core/            # Domain types, game state, plugin trait definitions
│   ├── db/              # sqlx queries, migrations, repository pattern
│   └── asset-store/     # Storage trait + local filesystem impl + optional S3 impl
├── client/              # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/  # React components (built on Radix primitives)
│   │   ├── canvas/      # PixiJS integration (maps, tokens, grid)
│   │   ├── state/       # Zustand stores
│   │   ├── api/         # REST + WebSocket client
│   │   └── types/       # Auto-generated from Rust via ts-rs
│   └── package.json
├── migrations/          # PostgreSQL migrations (managed by sqlx)
├── docker/
│   ├── Dockerfile       # Multi-stage build
│   └── docker-compose.yml
├── Cargo.toml           # Workspace root
└── .github/
    └── workflows/       # CI pipeline
```

### Crate Responsibilities

**`core`** — Pure domain types and logic. No dependencies on `db`, `server`, or any I/O. This is where game system plugin traits are defined, so plugins depend only on `core`. Types here are the single source of truth and are exported to TypeScript via `ts-rs`.

**`server`** — The composition root. Depends on `core`, `db`, and `asset-store`. Handles HTTP routing, WebSocket connections, auth middleware, and static file serving. This is the only crate that produces a binary.

**`db`** — Persistence layer. Depends on `core` for types. Implements repository traits using `sqlx` against PostgreSQL. Owns all database migrations.

**`asset-store`** — File storage abstraction. Defines a `StorageBackend` trait with `store`, `retrieve`, `delete`, and `list` operations. Ships with two implementations: local filesystem (default) and S3-compatible (optional). No other crate needs to know which backend is active.

---

## Backend Architecture

### Axum Server

The server has three responsibilities:

1. **REST API** — CRUD operations that don't need real-time: campaign management, character creation/editing, asset uploads, auth, handout management.
2. **WebSocket connections** — everything real-time: token movement, map changes, chat messages, initiative updates, dice rolls.
3. **Static file serving** — in production, serves the built React app.

### State Management

```
Client action (WebSocket)
  → Server validates (permissions, game rules)
  → Updates in-memory session state
  → Persists to PostgreSQL
  → Broadcasts delta to all clients in the session
```

Game state for active sessions lives in memory for fast reads and broadcasting. Writes persist to PostgreSQL eagerly on every meaningful state change — PostgreSQL can easily handle the write throughput of a VTT session (dozens of writes per second at peak, not thousands). The in-memory layer is a read cache and broadcast source, not a write buffer.

If the server restarts, it reloads from the database. No state is lost.

### WebSocket Message Format

All WebSocket messages are JSON with a typed envelope. Message types are defined as Rust enums in the `core` crate and exported to TypeScript via `ts-rs`.

```rust
// Defined in core crate
#[derive(Serialize, Deserialize, TS)]
#[serde(tag = "type", content = "payload")]
enum ClientMessage {
    MoveToken { token_id: Uuid, x: f64, y: f64 },
    ChatMessage { content: String, character_id: Option<Uuid> },
    RollDice { expression: String },
    // ... added by sub-projects
}

#[derive(Serialize, Deserialize, TS)]
#[serde(tag = "type", content = "payload")]
enum ServerMessage {
    TokenMoved { token_id: Uuid, x: f64, y: f64, moved_by: Uuid },
    ChatReceived { message: ChatMsg },
    DiceResult { result: RollResult },
    Error { code: String, message: String },
    // ... added by sub-projects
}
```

The `serde(tag = "type")` attribute produces JSON like `{"type": "MoveToken", "payload": {"token_id": "...", "x": 5.0, "y": 3.0}}`, which is easy to discriminate on the client side. SP-0 defines the envelope structure and a minimal set of message types; each subsequent sub-project adds its own variants.

### Future WebRTC Signaling

The Axum route structure should reserve a namespace (e.g., `/api/rtc/`) for WebRTC signaling endpoints that SP-6 (Audio/Video Chat) will implement. SP-0 does not implement these routes — just avoids conflicts.

### Key Crates

- `axum` — HTTP routing, WebSocket upgrade, middleware
- `tokio` — async runtime
- `sqlx` — async PostgreSQL with compile-time query checking
- `tower` — middleware stack (auth, CORS, rate limiting, logging)
- `serde` — serialization for API types and WebSocket messages
- `argon2` — password hashing
- `jsonwebtoken` — JWT session tokens
- `ts-rs` — TypeScript type generation from Rust structs
- `tracing` — structured logging
- `aws-sdk-s3` — optional S3 storage backend

---

## Frontend Architecture

### Two Rendering Contexts

The UI has two fundamentally different rendering layers:

1. **PixiJS canvas** — maps, tokens, grid, drawing tools, lighting. WebGL-rendered. React does not manage the canvas directly — a React component provides a `<canvas>` ref and initializes the PixiJS `Application` on mount. React manages the controls *around* the canvas (toolbars, menus, settings), but PixiJS owns all canvas rendering. We do not use `@pixi/react` — it adds coupling between React's render cycle and PixiJS for no benefit given our architecture.

2. **React application UI** — everything else: chat panel, character sheets, initiative tracker, handouts, campaign management, settings. Standard React components built on Radix primitives.

### State Management

- **Zustand** for client-side state, organized as separate stores by domain: a `sessionStore` (who's connected, permissions, game state from WebSocket), a `uiStore` (active tool, selected token, panel visibility), and a `prefsStore` (local user preferences, persisted to localStorage). Separate stores avoid a monolithic state blob and allow independent subscriptions.
- **WebSocket messages** are the source of truth for game state. Server broadcasts a delta → Zustand store updates → React re-renders UI + PixiJS updates canvas. One incoming flow, two rendering targets.
- **TanStack Query** for REST API calls — campaign list, character loading, asset management. Handles caching, refetching, and loading states.

### Type Safety Across the Boundary

`ts-rs` generates TypeScript interfaces from Rust structs in the `core` crate. All shared types derive the `TS` trait. Type export is triggered via `#[test] fn export_bindings()` tests (the standard `ts-rs` pattern) that write to `client/src/types/generated.ts`. A `cargo test` run regenerates all types. For the dev workflow, `cargo watch` is configured to run tests on change, so types stay in sync automatically. The Vite dev server picks up the file change and hot-reloads.

Every API response and WebSocket message type is defined once in Rust and automatically available in TypeScript.

---

## Auth & Permissions

### Authentication

- Email/password registration and login
- Passwords hashed with Argon2
- JWT access tokens (short-lived, 15 minutes) + refresh tokens (long-lived, 7 days)
- Access token stored in httpOnly cookie; refresh token stored in httpOnly cookie on a `/api/auth/refresh` path
- Refresh tokens stored in the database (a `refresh_tokens` table) so they can be revoked
- Token refresh: client calls `/api/auth/refresh` when access token expires; server validates refresh token, issues new access token, rotates refresh token
- Tokens stored in httpOnly cookies (not localStorage — XSS protection)

### Authorization

Two roles per campaign: **DM** and **Player**.

| Capability | DM | Player |
|-----------|-----|--------|
| Manage campaign settings | Yes | No |
| Upload assets | Yes | No |
| Edit maps, place tokens | Yes | No |
| Control fog of war | Yes | No |
| See all layers | Yes | No |
| Manage handouts | Yes | View shared only |
| Set initiative | Yes | No |
| Move own token(s) | Yes | Yes |
| Edit own character sheet | Yes | Yes |
| Chat and roll dice | Yes | Yes |

### Campaign Access

DM creates a campaign and gets an invite link (unique invite code). Players join via the link. DM can remove players. No public campaign discovery.

The campaign owner (creator) is automatically added to `campaign_members` as the sole DM. The schema enforces at most one DM per campaign via a unique partial index: `CREATE UNIQUE INDEX one_dm_per_campaign ON campaign_members (campaign_id) WHERE role = 'dm'`. This aligns with the parent spec's single-DM assumption.

---

## Database Schema (SP-0 Baseline)

SP-0 establishes only the tables needed for the foundation. Later sub-projects add their own tables via migrations.

```sql
-- Users
CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          TEXT UNIQUE NOT NULL,
    password_hash  TEXT NOT NULL,
    display_name   TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campaigns
CREATE TABLE campaigns (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT NOT NULL,
    owner_id       UUID NOT NULL REFERENCES users(id),
    invite_code    TEXT UNIQUE NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campaign membership
CREATE TABLE campaign_members (
    campaign_id    UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role           TEXT NOT NULL CHECK (role IN ('dm', 'player')),
    joined_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (campaign_id, user_id)
);

-- Refresh tokens (for JWT rotation)
CREATE TABLE refresh_tokens (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash     TEXT NOT NULL,
    expires_at     TIMESTAMPTZ NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uploaded assets (maps, tokens, portraits, etc.)
CREATE TABLE assets (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id    UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    uploaded_by    UUID NOT NULL REFERENCES users(id),
    filename       TEXT NOT NULL,
    content_type   TEXT NOT NULL,
    storage_path   TEXT NOT NULL,
    size_bytes     BIGINT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Asset Library

The asset library is how maps, tokens, portraits, and other files get into the system. SP-0 delivers a functional asset library — upload, browse, and delete.

### REST API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/api/campaigns/:id/assets` | Upload file (multipart form) | DM only |
| `GET` | `/api/campaigns/:id/assets` | List assets (paginated, filterable by content type) | Campaign members |
| `GET` | `/api/assets/:id` | Download/serve asset file | Campaign members |
| `DELETE` | `/api/assets/:id` | Delete asset | DM only |

### Upload Handling

- Multipart form upload with file and optional metadata
- File type validation: images (PNG, JPEG, WebP, SVG), PDFs (for handouts)
- Size limit: configurable via env var `MAX_UPLOAD_SIZE_MB` (default: 25MB)
- Thumbnail generation for images (stored alongside original) for grid/list views in the asset browser
- Files stored via the `StorageBackend` trait — local filesystem or S3

### Client-Side Asset Browser

A React component (Radix dialog) for browsing, uploading, and managing campaign assets:

- Grid view with thumbnails and list view with file details
- Filter by type (maps, tokens, portraits, handouts)
- Drag-and-drop upload
- Delete with confirmation

Tagging and folder organization are deferred — the initial asset library is a flat list filtered by content type. Tags can be added later via a migration without architectural changes.

---

## Accessibility Foundation

Accessibility is established as a baseline in SP-0 so every subsequent sub-project builds on it rather than retrofitting.

### Component Library

All UI components built with semantic HTML and ARIA attributes from the start. `@radix-ui/react-primitives` provides the base for interactive components (dialogs, menus, dropdowns, tabs) — unstyled, accessible primitives that we style ourselves. This gives keyboard navigation, focus management, and screen reader support without building it from scratch.

### Design Tokens

- Color palette defined as CSS custom properties with a colorblind-safe default theme
- No color-only indicators — always pair color with shape, icon, or text
- WCAG AA contrast ratios baked into the token system

### Canvas Accessibility

The PixiJS canvas is inherently inaccessible to screen readers. For canvas interactions, we maintain a parallel DOM representation — an off-screen element that describes tokens, their positions, statuses, and available actions. This pattern is established in SP-0 and evolves with SP-1 (Grid & Map Rendering).

- Keyboard navigation for token selection and movement
- Visible focus indicators on canvas elements
- Screen reader announcements for state changes (token moved, turn started, etc.)

### Focus Management

- Keyboard shortcuts for common actions (documented and configurable)
- Visible focus indicators on all interactive elements
- Focus trapping in modals and dialogs (handled by Radix)

---

## Developer Experience

### Local Development

- `cargo watch` — auto-recompiles Rust server on changes, triggers `build.rs` which regenerates TypeScript types
- `vite dev` — React dev server with HMR, proxies API/WebSocket calls to the Rust server
- `docker compose up db` — PostgreSQL only for local dev
- `sqlx migrate run` — apply database migrations
- `cargo sqlx prepare` — generate offline query data (`.sqlx/` directory, committed to repo) so CI and other developers can build without a live database
- TypeScript types regenerate automatically on every `cargo test` run via `ts-rs` export tests

### Testing

Testing at three levels: unit, integration, and end-to-end. All levels run in CI on every PR.

**Unit tests (Rust — `cargo test`):**
- Auth flows: registration, login, JWT issuance/refresh, password hashing
- Asset upload/download: file validation, storage/retrieval, size limits
- Campaign CRUD: creation, invite code generation, member join/leave, permissions
- Database migrations: verify all migrations apply cleanly to a fresh database
- WebSocket: connection establishment, message serialization/deserialization

**Unit tests (Frontend — Vitest):**
- Component rendering: key UI components render without errors
- API client: REST and WebSocket client handle success/error cases
- Zustand stores: state transitions, subscription behavior
- Type generation: verify generated TypeScript types compile

**Integration tests (Rust — against real PostgreSQL):**
- Full auth flow: register → login → refresh token → access protected route → token expiry
- Campaign lifecycle: create → generate invite → join via invite → verify membership and permissions
- Asset upload: upload file via API → verify it's stored and retrievable → verify thumbnail generated → delete and verify removal
- WebSocket session: connect → send message → receive broadcast → disconnect → reconnect

**End-to-end tests (Playwright — full stack in browser):**

Playwright tests exercise the complete stack (browser → Axum server → PostgreSQL) through real user interactions. SP-0 establishes the Playwright infrastructure and delivers e2e coverage for all SP-0 functionality:

- **Registration & login:** fill out registration form → submit → verify redirect to campaigns page → log out → log back in → verify session persists across page reload
- **Campaign management:** create a campaign → verify it appears in the list → copy invite link → open a second browser context → join via invite link → verify both users see the campaign
- **Asset library:** open asset browser → upload a file via drag-and-drop or file picker → verify thumbnail appears in the grid → verify the file is downloadable → delete the asset → verify it's removed
- **Canvas shell:** navigate to a campaign → verify the PixiJS canvas initializes without errors (SP-0 scope: empty canvas, no grid or tokens yet)
- **Multi-user real-time:** DM and player browser contexts connected to the same campaign — verify that both see the same campaign state
- **Permissions:** verify player cannot access DM-only actions (asset upload, campaign settings) through the UI; verify API rejects unauthorized requests

**Playwright infrastructure (established in SP-0, used by all subsequent sub-projects):**
- `docker compose -f docker/docker-compose.test.yml` spins up the full stack (server + database) for test runs
- Each test suite gets a fresh database (migrations applied, no stale data between suites)
- Playwright's multi-browser-context support enables multi-user scenarios (DM + player in the same test)
- Visual regression snapshots for canvas rendering (baseline established in SP-0, extended by SP-1+)
- Test helpers for common flows: `registerAndLogin(page, user)`, `createCampaign(page, name)`, `joinCampaign(page, inviteCode)`

Every subsequent sub-project adds its own Playwright tests as part of its acceptance criteria. A feature without e2e coverage is not complete.

### CI Pipeline (GitHub Actions)

- `cargo fmt --check` — Rust formatting
- `cargo clippy --workspace -- -D warnings` — Rust lints
- `cargo test --workspace` — Rust unit + integration tests
- `cargo sqlx prepare --check` — verify compile-time SQL queries match migrations
- `npm run lint` + `npm run build` — frontend lints and type checking
- `npm run test` — Vitest unit tests
- `npm run test:e2e` — Playwright end-to-end tests (against Docker Compose test stack)
- Docker image build on main branch

---

## Deployment

### Self-Hosted (Docker Compose)

Single `docker compose up` starts the application:

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://user:pass@db:5432/dragons
      - ASSET_STORAGE_PATH=/data/assets
      - JWT_SECRET=<generated>
      # Optional S3 configuration:
      # - S3_BUCKET=my-bucket
      # - S3_REGION=us-east-1
      # - AWS_ACCESS_KEY_ID=...
      # - AWS_SECRET_ACCESS_KEY=...
    volumes:
      - assets:/data/assets
  db:
    image: postgres:16
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=dragons
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  assets:
  pgdata:
```

### Dockerfile (Multi-Stage)

1. **Build Rust:** Compile the server binary in a Rust build image
2. **Build React:** Build the client in a Node image
3. **Runtime:** Copy binary + static files into a slim Debian image

The Rust server serves the React build as static files. One port, one process, one container.

### Configuration

Environment variables only. No config files. Everything configurable via the `environment` section in `docker-compose.yml` or a `.env` file.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for signing JWT tokens |
| `ASSET_STORAGE_PATH` | Yes | Local filesystem path for assets |
| `S3_BUCKET` | No | S3 bucket name (enables S3 storage) |
| `S3_REGION` | No | AWS region for S3 |
| `BIND_ADDRESS` | No | Server bind address (default: `0.0.0.0:3000`) |
| `MAX_UPLOAD_SIZE_MB` | No | Maximum asset upload size (default: 25) |

---

## SP-0 Deliverable

When SP-0 is complete, the following works end-to-end:

1. `docker compose up` starts the application
2. User registers with email/password and logs in
3. User creates a campaign and gets an invite link
4. Another user joins the campaign via the invite link
5. DM uploads map images and token art to the asset library
6. Both users see an empty canvas (PixiJS initialized, grid not yet rendered — that's SP-1)
7. The foundation is ready for SP-1 (grid/rendering), SP-2 (real-time sync), and SP-3 (game system plugins) to build on

No game functionality yet. No grid, no tokens, no dice, no chat. Just the skeleton that everything plugs into.
