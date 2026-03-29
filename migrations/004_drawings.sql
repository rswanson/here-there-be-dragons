-- migrations/004_drawings.sql

CREATE TABLE drawings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layer_id        UUID NOT NULL REFERENCES map_layers(id) ON DELETE CASCADE,
    drawing_type    TEXT NOT NULL CHECK (drawing_type IN
                    ('freehand', 'line', 'rectangle', 'circle', 'polygon',
                     'aoe_cone', 'aoe_cube', 'aoe_sphere', 'aoe_line')),
    points_json     JSONB NOT NULL,
    stroke_color    TEXT NOT NULL DEFAULT '#ffffff',
    stroke_width    REAL NOT NULL DEFAULT 2,
    stroke_opacity  REAL NOT NULL DEFAULT 1.0,
    fill_color      TEXT,
    fill_opacity    REAL NOT NULL DEFAULT 0.3,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_drawings_layer_id ON drawings(layer_id);
