-- Member-scoped finance on band-owned dates

CREATE TABLE IF NOT EXISTS event_member_finance (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price_eur NUMERIC(12, 2) NOT NULL DEFAULT 0,
  transport_rsd NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_member_finance_user_id_idx ON event_member_finance(user_id);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS payments_user_id_idx ON payments(user_id);

DROP TRIGGER IF EXISTS event_member_finance_set_updated_at ON event_member_finance;
CREATE TRIGGER event_member_finance_set_updated_at
BEFORE UPDATE ON event_member_finance
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
