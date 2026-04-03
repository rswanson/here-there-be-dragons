-- migrations/007_walls_fog_token_vision.sql

-- ── Walls ────────────────────────────────────────────────────────────

CREATE TABLE walls (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id      UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    x1          REAL NOT NULL,
    y1          REAL NOT NULL,
    x2          REAL NOT NULL,
    y2          REAL NOT NULL,
    wall_type   TEXT NOT NULL DEFAULT 'wall'
                CHECK (wall_type IN ('wall', 'door', 'secret_door')),
    door_state  TEXT NOT NULL DEFAULT 'closed'
                CHECK (door_state IN ('closed', 'open', 'locked')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_walls_map ON walls(map_id);

-- ── Fog cells (DM reveals) ──────────────────────────────────────────

CREATE TABLE fog_cells (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id      UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    x           INTEGER NOT NULL,
    y           INTEGER NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(map_id, x, y)
);

CREATE INDEX idx_fog_cells_map ON fog_cells(map_id);

-- ── Token vision extensions ─────────────────────────────────────────

ALTER TABLE tokens ADD COLUMN has_vision       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tokens ADD COLUMN vision_range      REAL NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN darkvision_range  REAL NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN light_bright      REAL NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN light_dim         REAL NOT NULL DEFAULT 0;

-- ── Map: player door control toggle ─────────────────────────────────

ALTER TABLE maps ADD COLUMN player_door_control BOOLEAN NOT NULL DEFAULT true;
