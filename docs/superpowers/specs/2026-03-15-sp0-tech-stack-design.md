# SP-0: Tech Stack & Foundation — Design Spec

The foundational architecture and tech stack for Here There Be Dragons. Every subsequent sub-project builds on the decisions made here.

**Parent spec:** [Here There Be Dragons Design Spec](2026-03-15-here-there-be-dragons-design.md)
**Roadmap:** [Phase 1 Roadmap](../plans/2026-03-15-phase1-roadmap.md)

---

## Tech Stack Summary

| Layer | Choice | Key Dependencies |
|-------|--------|-----------------|
| Frontend | React + TypeScript | Vite, PixiJS, Zustand, TanStack Query |
| Canvas rendering | PixiJS (WebGL) | `@pixi/react` or custom integration |
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

1. **PixiJS canvas** — maps, tokens, grid, drawing tools, lighting. WebGL-rendered. React does not manage this directly — React manages the controls *around* the canvas (toolbars, menus, settings), but PixiJS owns the canvas rendering.

2. **React application UI** — everything else: chat panel, character sheets, initiative tracker, handouts, campaign management, settings. Standard React components built on Radix primitives.

### State Management

- **Zustand** for client-side state — session state (who's connected, permissions), UI state (active tool, selected token, panel visibility), local user preferences.
- **WebSocket messages** are the source of truth for game state. Server broadcasts a delta → Zustand store updates → React re-renders UI + PixiJS updates canvas. One incoming flow, two rendering targets.
- **TanStack Query** for REST API calls — campaign list, character loading, asset management. Handles caching, refetching, and loading states.

### Type Safety Across the Boundary

`ts-rs` generates TypeScript interfaces from Rust structs in the `core` crate. A `build.rs` script in the `server` crate runs the export on every `cargo build`, writing generated types to `client/src/types/generated.ts`. The Vite dev server picks up the file change and hot-reloads. Every API response and WebSocket message type is defined once in Rust and automatically available in TypeScript.

---

## Auth & Permissions

### Authentication

- Email/password registration and login
- Passwords hashed with Argon2
- JWT tokens for session management (access token + refresh token)
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
- TypeScript types regenerate automatically on every Rust build — zero manual steps

### CI Pipeline (GitHub Actions)

- `cargo test` + `cargo clippy` — Rust tests and lints
- `npm test` + `eslint` — frontend tests and lints
- `cargo sqlx prepare --check` — verify compile-time SQL queries match migrations
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
