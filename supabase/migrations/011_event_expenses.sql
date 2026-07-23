-- Per-date expenses (troškovi) for band finance.

CREATE TABLE IF NOT EXISTS event_expenses (
  id BIGSERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  description TEXT NOT NULL DEFAULT '',
  payee_kind TEXT NOT NULL CHECK (payee_kind IN ('member', 'band', 'external')),
  payee_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT event_expenses_payee_member_chk CHECK (
    (payee_kind = 'member' AND payee_user_id IS NOT NULL)
    OR (payee_kind IN ('band', 'external') AND payee_user_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS event_expenses_event_id_idx ON event_expenses (event_id);
CREATE INDEX IF NOT EXISTS event_expenses_band_id_idx ON event_expenses (band_id);

DROP TRIGGER IF EXISTS event_expenses_set_updated_at ON event_expenses;
CREATE TRIGGER event_expenses_set_updated_at
BEFORE UPDATE ON event_expenses
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
