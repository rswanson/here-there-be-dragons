-- migrations/003_tokens.sql

CREATE TABLE tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layer_id        UUID NOT NULL REFERENCES map_layers(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    asset_id        UUID REFERENCES assets(id),
    owner_id        UUID REFERENCES users(id),
    x               REAL NOT NULL DEFAULT 0,
    y               REAL NOT NULL DEFAULT 0,
    size            INTEGER NOT NULL DEFAULT 1 CHECK (size BETWEEN 1 AND 4),
    rotation        REAL NOT NULL DEFAULT 0,
    bars_json       JSONB NOT NULL DEFAULT '[]',
    status_markers  TEXT[] NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tokens_layer_id ON tokens(layer_id);
CREATE INDEX idx_tokens_owner_id ON tokens(owner_id);
