# Stage 1: Build Rust server
FROM rust:latest AS rust-builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY crates/ crates/
COPY migrations/ migrations/
COPY .sqlx/ .sqlx/
ENV SQLX_OFFLINE=true
RUN cargo build --release -p server

# Stage 2: Build React client
FROM node:20 AS client-builder
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ .
RUN npm run build

# Stage 3: Runtime
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=rust-builder /app/target/release/server /usr/local/bin/server
COPY --from=client-builder /app/client/dist /srv/client
COPY migrations/ /srv/migrations

ENV ASSET_STORAGE_PATH=/data/assets
ENV BIND_ADDRESS=0.0.0.0:3000

EXPOSE 3000
CMD ["server"]
