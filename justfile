# Load .env automatically for all recipes
set dotenv-load

# Default recipe: show help
default:
    @just --list

# Install all dependencies
setup:
    cargo build --workspace
    cd client && npm install

# Start PostgreSQL (docker)
[group("dev")]
dev-db:
    docker compose -f docker/docker-compose.dev.yml up db

# Run Rust backend (port 3000)
[group("dev")]
dev-server:
    cargo run -p server

# Run Vite dev server (port 5173)
[group("dev")]
dev-client:
    cd client && npm run dev

# Build everything
[group("build")]
build: build-server build-client

# Build all Rust crates
[group("build")]
build-server:
    cargo build --workspace

# Build React client
[group("build")]
build-client:
    cd client && npm run build

# Run all tests
[group("test")]
test: test-server test-client

# Run Rust tests (also regenerates ts-rs bindings)
[group("test")]
test-server:
    cargo test --workspace

# Run Vitest unit tests
[group("test")]
test-client:
    cd client && npm run test

# Run Vitest in watch mode
[group("test")]
test-watch:
    cd client && npm run test:watch

# Run Playwright e2e tests
[group("test")]
test-e2e:
    cd client && npm run test:e2e

# Lint everything
[group("lint")]
lint: lint-server lint-client

# Run clippy
[group("lint")]
lint-server:
    SQLX_OFFLINE=true cargo clippy --workspace -- -D warnings

# Run ESLint
[group("lint")]
lint-client:
    cd client && npm run lint

# Format all code
[group("lint")]
fmt:
    cargo fmt --all
    cd client && npx prettier --write 'src/**/*.{ts,tsx}'

# Check formatting without changes
[group("lint")]
fmt-check:
    cargo fmt --all -- --check

# Run database migrations
[group("db")]
db-migrate:
    sqlx migrate run

# Regenerate .sqlx/ offline query data
[group("db")]
db-prepare:
    cargo sqlx prepare --workspace

# Build and run full stack via docker compose
[group("docker")]
docker:
    docker compose -f docker/docker-compose.yml up --build

# Start dev dependencies (DB) via docker compose
[group("docker")]
docker-dev:
    docker compose -f docker/docker-compose.dev.yml up

# Remove stale worktree metadata (directory already deleted)
[group("worktree")]
worktree-prune:
    git worktree prune -v

# Remove worktrees whose branch was merged or deleted on remote
[group("worktree")]
worktree-clean:
    #!/usr/bin/env bash
    set -euo pipefail
    git worktree prune
    git fetch --prune
    root=$(git rev-parse --show-toplevel)
    git worktree list --porcelain | grep '^worktree ' | sed 's/^worktree //' | while read -r wt; do
        [ "$wt" = "$root" ] && continue
        branch=$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null) || continue
        [ -z "$branch" ] && continue
        if git branch -vv | grep -q "^\s*$branch\b.*: gone]"; then
            echo "Removing worktree $wt (branch '$branch' is gone from remote)"
            git worktree remove "$wt"
        fi
    done

# Run all pre-push checks (mirrors CI exactly)
[group("ci")]
check: fmt-check lint test build-client

# Run full CI including e2e (starts/stops DB, server, and Vite automatically)
[group("ci")]
check-all: check
    #!/usr/bin/env bash
    set -euo pipefail
    set -a; source .env; set +a

    cleanup() {
        echo "Tearing down..."
        [ -n "${VITE_PID:-}" ] && kill "$VITE_PID" 2>/dev/null && wait "$VITE_PID" 2>/dev/null || true
        [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null && wait "$SERVER_PID" 2>/dev/null || true
        docker compose -f docker/docker-compose.dev.yml stop db 2>/dev/null || true
    }
    trap cleanup EXIT

    # Start DB
    docker compose -f docker/docker-compose.dev.yml up db -d --wait
    echo "DB ready"

    # Run migrations (install sqlx-cli if missing)
    command -v sqlx >/dev/null || cargo install sqlx-cli --no-default-features --features postgres
    sqlx migrate run

    # Start server
    cargo run -p server &
    SERVER_PID=$!
    for i in $(seq 1 30); do
        curl -sf http://localhost:3000/api/health >/dev/null 2>&1 && break
        sleep 1
    done
    curl -sf http://localhost:3000/api/health >/dev/null || { echo "Server failed to start"; exit 1; }
    echo "Server ready"

    # Start Vite
    cd client && npm run dev &
    VITE_PID=$!
    cd ..
    for i in $(seq 1 15); do
        curl -sf http://localhost:5173 >/dev/null 2>&1 && break
        sleep 1
    done
    curl -sf http://localhost:5173 >/dev/null || { echo "Vite failed to start"; exit 1; }
    echo "Vite ready"

    # Run E2E
    cd client && npx playwright test

# Update visual regression snapshots for Linux (requires running DB + server + Vite)
[group("test")]
update-snapshots-linux:
    #!/usr/bin/env bash
    set -euo pipefail

    # Verify the dev stack is reachable
    curl -sf http://localhost:3000/api/health >/dev/null || { echo "Server not running on :3000 — start with: just dev-db & just dev-server"; exit 1; }
    curl -sf http://localhost:5173 >/dev/null || { echo "Vite not running on :5173 — start with: just dev-client"; exit 1; }

    PW_VERSION=$(cd client && node -p "require('@playwright/test/package.json').version")
    echo "Using Playwright v${PW_VERSION} Docker image"

    # host.docker.internal resolves to the host on macOS/Windows Docker Desktop.
    # On Linux Docker, --add-host provides it. We use it as the base URL so
    # the containerized browser can reach the host's Vite dev server.
    docker run --rm \
        --add-host=host.docker.internal:host-gateway \
        -v "$(pwd)/client:/work" \
        -w /work \
        -e BASE_URL=http://host.docker.internal:5173 \
        "mcr.microsoft.com/playwright:v${PW_VERSION}" \
        npx playwright test e2e/visual-regression.spec.ts --update-snapshots

    echo "Linux snapshots updated. Review and commit:"
    echo "  ls client/e2e/visual-regression.spec.ts-snapshots/*-linux.png"

# Remove build artifacts
clean:
    cargo clean
    rm -rf client/dist client/node_modules/.vite
