-- Append-only comments on events (allowed even when the event date is past).
-- Mutation audit for dated ledger rows (events, payments, member wages).

CREATE TABLE IF NOT EXISTS event_comments (
  id BIGSERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT event_comments_body_len CHECK (
    char_length(trim(body)) > 0 AND char_length(body) <= 2000
  )
);

CREATE INDEX IF NOT EXISTS event_comments_event_id_created_idx
  ON event_comments (event_id, created_at);

CREATE TABLE IF NOT EXISTS transaction_audit (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('event', 'payment', 'event_member_finance')),
  entity_id TEXT NOT NULL,
  band_id UUID REFERENCES bands(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  before_json JSONB,
  after_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transaction_audit_entity_idx
  ON transaction_audit (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS transaction_audit_band_idx
  ON transaction_audit (band_id, created_at DESC);
