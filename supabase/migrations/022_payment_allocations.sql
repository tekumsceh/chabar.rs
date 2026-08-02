-- Payment allocations tie uplate to specific dates; exchange_rate snapshots FX at pay time.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(12, 4);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id SERIAL PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  amount_eur NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payment_id, event_id)
);

CREATE INDEX IF NOT EXISTS payment_allocations_event_id_idx ON payment_allocations(event_id);
CREATE INDEX IF NOT EXISTS payment_allocations_payment_id_idx ON payment_allocations(payment_id);
