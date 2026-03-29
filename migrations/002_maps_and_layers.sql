-- migrations/002_maps_and_layers.sql

CREATE TABLE maps (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id      UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    grid_enabled     BOOLEAN NOT NULL DEFAULT true,
    grid_size_px     INTEGER NOT NULL DEFAULT 70,
    grid_color       TEXT NOT NULL DEFAULT '#000000',
    grid_opacity     REAL NOT NULL DEFAULT 0.3,
    grid_line_width  REAL NOT NULL DEFAULT 1.0,
    grid_scale       REAL NOT NULL DEFAULT 5.0,
    grid_scale_unit  TEXT NOT NULL DEFAULT 'ft',
    snap_mode        TEXT NOT NULL DEFAULT 'center'
                     CHECK (snap_mode IN ('off', 'center', 'corner')),
    diagonal_mode    TEXT NOT NULL DEFAULT 'dnd_standard'
                     CHECK (diagonal_mode IN ('dnd_standard', 'euclidean', 'manhattan')),
    width_squares    INTEGER NOT NULL DEFAULT 30,
    height_squares   INTEGER NOT NULL DEFAULT 20,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_maps_campaign_id ON maps(campaign_id);

CREATE TABLE map_layers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id      UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    layer_type  TEXT NOT NULL CHECK (layer_type IN ('map_image', 'token', 'drawing')),
    sort_order  INTEGER NOT NULL DEFAULT 0,
    visible     BOOLEAN NOT NULL DEFAULT true,
    locked      BOOLEAN NOT NULL DEFAULT false,
    opacity     REAL NOT NULL DEFAULT 1.0,
    dm_only     BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_map_layers_map_id ON map_layers(map_id);

CREATE TABLE map_images (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layer_id    UUID NOT NULL REFERENCES map_layers(id) ON DELETE CASCADE,
    asset_id    UUID NOT NULL REFERENCES assets(id),
    x           REAL NOT NULL DEFAULT 0,
    y           REAL NOT NULL DEFAULT 0,
    width       REAL NOT NULL,
    height      REAL NOT NULL,
    rotation    REAL NOT NULL DEFAULT 0,
    opacity     REAL NOT NULL DEFAULT 1.0
);

CREATE INDEX idx_map_images_layer_id ON map_images(layer_id);
