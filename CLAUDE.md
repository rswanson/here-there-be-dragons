# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Here There Be Dragons is an open-source virtual tabletop (VTT) exploring AI agents alongside human players in D&D. Currently in SP-0 (foundation) phase — auth, campaigns, asset library, and empty canvas shell. No game functionality yet.

**License:** AGPL-3.0

## Repository Structure

The main branch contains only docs and specs. Active development happens in `.worktrees/sp0-foundation/` (a git worktree on the `sp0-foundation` branch).

```
.worktrees/sp0-foundation/
├── crates/
│   ├── htbd-core/     # Domain types, models, WebSocket messages. ts-rs exports to bindings/
│   ├── db/            # sqlx queries, repository pattern (users, campaigns, assets, refresh_tokens)
│   ├── asset-store/   # StorageBackend trait + local filesystem impl
│   └── server/        # Axum HTTP + WebSocket server (the only binary crate)
├── client/            # React 19 + TypeScript + Vite 8
│   ├── src/canvas/    # PixiJS integration (NOT @pixi/react — manual ref-based)
│   ├── src/state/     # Zustand stores (session, ui, prefs)
│   ├── src/api/       # REST client + WebSocket client
│   ├── src/types/     # Manually maintained TS types (mirroring htbd-core/bindings/)
│   └── src/components/# React components (Radix UI primitives)
├── migrations/        # PostgreSQL migrations (sqlx)
├── docker/            # Dockerfile + docker-compose.yml + docker-compose.dev.yml
└── .sqlx/             # Offline query data (committed to repo)
```

## Development Commands

### Backend (Rust) — run from worktree root

```bash
cargo build --workspace            # Build all crates
cargo test --workspace             # Run all tests (also regenerates ts-rs bindings)
cargo test -p server               # Test single crate
cargo clippy --workspace -- -D warnings  # Lint
cargo fmt --all                    # Format
cargo fmt --all -- --check         # Check formatting
sqlx migrate run                   # Apply database migrations
cargo sqlx prepare --workspace     # Regenerate .sqlx/ offline query data
```

### Frontend (React) — run from client/ directory

```bash
npm run dev          # Vite dev server (port 5173, proxies /api to localhost:3000)
npm run build        # TypeScript check + Vite build
npm run lint         # ESLint
npm run test         # Vitest (unit tests)
npm run test:watch   # Vitest watch mode
npm run test:e2e     # Playwright e2e tests
```

### Local Dev Environment

```bash
docker compose -f docker/docker-compose.dev.yml up db   # PostgreSQL only
# Then in separate terminals:
cargo run -p server                                       # Rust server on :3000
cd client && npm run dev                                  # Vite dev on :5173
```

Environment variables: copy `.env.example` → `.env`. Key vars: `DATABASE_URL`, `JWT_SECRET`, `ASSET_STORAGE_PATH`.

### Docker (Production)

```bash
docker compose -f docker/docker-compose.yml up   # Full stack
docker build -f docker/Dockerfile -t htbd:latest .
```

## Architecture Decisions

- **Type sharing:** Rust types in `htbd-core` derive `TS` (ts-rs) and export to `crates/htbd-core/bindings/`. These are the source of truth. `client/src/types/` mirrors them (manually maintained for now). Running `cargo test` regenerates bindings.
- **WebSocket messages:** Typed enums in `htbd-core/src/messages.rs` with `serde(tag = "type", content = "payload")` — produces `{"type": "MoveToken", "payload": {...}}` JSON.
- **Database queries:** sqlx with compile-time checking. Set `SQLX_OFFLINE=true` for builds without a live DB. Commit `.sqlx/` directory after schema changes.
- **Canvas:** PixiJS via manual React ref integration. React manages UI around the canvas; PixiJS owns all canvas rendering.
- **State flow:** WebSocket delta from server → Zustand store update → React re-render + PixiJS canvas update.
- **Auth:** JWT access tokens (15min, httpOnly cookie) + refresh tokens (7 days, DB-stored, rotated).
- **Crate dependency direction:** `server` → `db` → `core`, `server` → `asset-store` → (standalone). `core` has no I/O dependencies.

## CI Pipeline

GitHub Actions runs: `cargo fmt --check`, `cargo clippy`, `cargo test`, `cargo sqlx prepare --check`, client `npm lint` + `npm build`, Docker image build on main.

## Design Docs

- `docs/superpowers/specs/2026-03-15-here-there-be-dragons-design.md` — product vision and experience pillars
- `docs/superpowers/specs/2026-03-15-sp0-tech-stack-design.md` — tech stack decisions and architecture
- `docs/superpowers/plans/2026-03-15-phase1-roadmap.md` — sub-project dependency map (SP-0 through SP-9)
- `docs/superpowers/plans/2026-03-15-sp0-implementation.md` — SP-0 implementation plan with task breakdown
