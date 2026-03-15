# Here There Be Dragons

An open-source virtual tabletop (VTT) that explores what D&D looks like when AI agents sit at the table alongside human players.

**Core question:** Can non-human participants make tabletop RPGs better without making them less human?

## What Is This?

A web-based virtual tabletop built for self-hosting. The VTT comes first — maps, tokens, dice, character sheets, dynamic lighting, integrated voice/video chat. The AI features (NPC characters that can hold conversations, respond in voice, and manage their own knowledge boundaries) are opt-in and layered on top.

The project ships in three phases:

1. **Phase 1** — An exceptional VTT with zero AI NPC involvement. Maps, tokens, grid, dice macro DSL, character sheets (3.5e first), dynamic lighting, fog of war, integrated voice/video chat, AI-assisted map and token generation for DM prep.
2. **Phase 2** — Text-based AI characters. NPCs with personality, knowledge boundaries, and a DM delegation dial (off / copilot / autopilot with guardrails).
3. **Phase 3** — AI voice. NPCs speak with distinct voices in real time via a streaming STT → LLM → TTS pipeline.

## Current Status

**SP-0 (Foundation)** is in active development. This is the project skeleton: Rust backend, React frontend, PostgreSQL, auth, campaigns, asset library, and deployment pipeline. No game functionality yet — that starts with SP-1 (grid and map rendering).

See [docs/superpowers/plans/2026-03-15-phase1-roadmap.md](docs/superpowers/plans/2026-03-15-phase1-roadmap.md) for the full sub-project dependency map.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Backend | Rust + Axum |
| Frontend | React 19 + TypeScript + Vite |
| Canvas | PixiJS (WebGL) |
| Database | PostgreSQL 16 |
| Real-time | WebSockets |
| State management | Zustand (client), TanStack Query (REST) |
| UI primitives | Radix UI |
| Type sharing | Rust → TypeScript via ts-rs |
| Deployment | Docker Compose |

## Quick Start

### Self-Hosted (Docker Compose)

```bash
docker compose -f docker/docker-compose.yml up
```

The app starts on `http://localhost:3000`. PostgreSQL runs alongside it. Assets are stored in a Docker volume.

Set `JWT_SECRET` to something secure in production:

```bash
JWT_SECRET=your-secret-here docker compose -f docker/docker-compose.yml up
```

### Local Development

**Prerequisites:** Rust (stable), Node.js 20+, Docker (for PostgreSQL)

```bash
# Start PostgreSQL
docker compose -f docker/docker-compose.dev.yml up -d

# Set up environment
cp .env.example .env

# Apply database migrations
sqlx migrate run

# Start the Rust server (port 3000)
cargo run -p server

# In a separate terminal — start the Vite dev server (port 5173)
cd client
npm install
npm run dev
```

The Vite dev server proxies `/api` requests to the Rust server on port 3000.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | Secret for signing JWT tokens |
| `ASSET_STORAGE_PATH` | Yes | — | Local filesystem path for uploaded assets |
| `BIND_ADDRESS` | No | `0.0.0.0:3000` | Server bind address |
| `MAX_UPLOAD_SIZE_MB` | No | `25` | Maximum upload file size |
| `RUST_LOG` | No | `info` | Log level filter |
| `S3_BUCKET` | No | — | S3 bucket name (enables S3 storage backend) |
| `S3_REGION` | No | — | AWS region for S3 |

## Project Structure

```
crates/
  htbd-core/       Pure domain types, WebSocket messages, ts-rs exports
  db/              sqlx queries, migrations, repository pattern
  asset-store/     StorageBackend trait + filesystem/S3 implementations
  server/          Axum HTTP + WebSocket server (the binary)
client/
  src/canvas/      PixiJS integration
  src/state/       Zustand stores (session, ui, prefs)
  src/api/         REST + WebSocket client
  src/components/  React components (Radix UI)
  src/types/       TypeScript types (mirroring htbd-core bindings)
migrations/        PostgreSQL migrations (sqlx)
docker/            Dockerfile + Docker Compose files
docs/              Design specs and implementation plans
```

## Testing

```bash
# Rust unit + integration tests
cargo test --workspace

# Frontend unit tests
cd client && npm run test

# Playwright end-to-end tests (requires running stack)
cd client && npm run test:e2e
```

## Design Documents

- [Product Design Spec](docs/superpowers/specs/2026-03-15-here-there-be-dragons-design.md) — experience pillars, VTT features, AI character system, voice architecture
- [Tech Stack & Foundation Spec](docs/superpowers/specs/2026-03-15-sp0-tech-stack-design.md) — architecture decisions, database schema, auth, deployment
- [Phase 1 Roadmap](docs/superpowers/plans/2026-03-15-phase1-roadmap.md) — sub-project dependency map (SP-0 through SP-9)

## License

[AGPL-3.0](LICENSE)
