-- migrations/006_chat_handouts_initiative.sql

-- ── Chat messages ───────────────────────────────────────────────────

CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL REFERENCES users(id),
    character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
    message_type TEXT NOT NULL,
    content TEXT NOT NULL,
    whisper_target_ids UUID[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_campaign ON chat_messages(campaign_id, created_at);
CREATE INDEX idx_chat_messages_campaign_recent ON chat_messages(campaign_id, created_at DESC);

-- ── Handouts ────────────────────────────────────────────────────────

CREATE TABLE handouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    visibility TEXT NOT NULL DEFAULT 'dm_only',
    player_ids UUID[] NOT NULL DEFAULT '{}',
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_handouts_campaign ON handouts(campaign_id);

-- ── Initiative tracker ──────────────────────────────────────────────

CREATE TABLE initiative_encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    active BOOLEAN NOT NULL DEFAULT true,
    current_turn_index INTEGER NOT NULL DEFAULT 0,
    round_number INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_initiative_encounters_campaign ON initiative_encounters(campaign_id);

CREATE TABLE initiative_combatants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES initiative_encounters(id) ON DELETE CASCADE,
    character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    initiative_value INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_initiative_combatants_encounter ON initiative_combatants(encounter_id);
