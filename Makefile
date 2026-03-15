.PHONY: help setup dev dev-db dev-server dev-client \
       build build-server build-client \
       test test-server test-client test-e2e test-watch \
       lint lint-server lint-client fmt fmt-check \
       db-migrate db-prepare \
       docker docker-dev clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# --- Setup ---

setup: ## Install all dependencies
	cargo build --workspace
	cd client && npm install

# --- Development ---

dev-db: ## Start PostgreSQL (docker)
	docker compose -f docker/docker-compose.dev.yml up db

dev-server: ## Run Rust backend (port 3000)
	cargo run -p server

dev-client: ## Run Vite dev server (port 5173)
	cd client && npm run dev

dev: ## Start DB, backend, and frontend (requires tmux or run each in a separate terminal)
	@echo "Run these in separate terminals:"
	@echo "  make dev-db"
	@echo "  make dev-server"
	@echo "  make dev-client"

# --- Build ---

build: build-server build-client ## Build everything

build-server: ## Build all Rust crates
	cargo build --workspace

build-client: ## Build React client
	cd client && npm run build

# --- Test ---

test: test-server test-client ## Run all tests

test-server: ## Run Rust tests (also regenerates ts-rs bindings)
	cargo test --workspace

test-client: ## Run Vitest unit tests
	cd client && npm run test

test-watch: ## Run Vitest in watch mode
	cd client && npm run test:watch

test-e2e: ## Run Playwright e2e tests
	cd client && npm run test:e2e

# --- Lint & Format ---

lint: lint-server lint-client ## Lint everything

lint-server: ## Run clippy
	SQLX_OFFLINE=true cargo clippy --workspace -- -D warnings

lint-client: ## Run ESLint
	cd client && npm run lint

fmt: ## Format all code
	cargo fmt --all
	cd client && npx prettier --write 'src/**/*.{ts,tsx}'

fmt-check: ## Check formatting without changes
	cargo fmt --all -- --check

# --- Database ---

db-migrate: ## Run database migrations
	sqlx migrate run

db-prepare: ## Regenerate .sqlx/ offline query data
	cargo sqlx prepare --workspace

# --- Docker ---

docker: ## Build and run full stack via docker compose
	docker compose -f docker/docker-compose.yml up --build

docker-dev: ## Start dev dependencies (DB) via docker compose
	docker compose -f docker/docker-compose.dev.yml up

# --- Cleanup ---

clean: ## Remove build artifacts
	cargo clean
	rm -rf client/dist client/node_modules/.vite
