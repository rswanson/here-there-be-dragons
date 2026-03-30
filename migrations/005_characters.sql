-- migrations/005_characters.sql

-- Character entity: campaign-scoped, owned by a user
CREATE TABLE characters (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id         UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    owner_id            UUID NOT NULL REFERENCES users(id),
    game_system_id      TEXT NOT NULL,
    name                TEXT NOT NULL,
    portrait_asset_id   UUID REFERENCES assets(id) ON DELETE SET NULL,
    visible_to_players  BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_characters_campaign ON characters(campaign_id);
CREATE INDEX idx_characters_owner ON characters(owner_id);

CREATE TABLE character_field_values (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    field_id     TEXT NOT NULL,
    value        JSONB NOT NULL,
    PRIMARY KEY (character_id, field_id)
);

CREATE TABLE character_bonuses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id    UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    field_id        TEXT NOT NULL,
    source          TEXT NOT NULL,
    bonus_type      TEXT NOT NULL,
    value           INTEGER NOT NULL
);

CREATE INDEX idx_character_bonuses_char_field ON character_bonuses(character_id, field_id);

ALTER TABLE tokens ADD COLUMN character_id UUID REFERENCES characters(id) ON DELETE SET NULL;
