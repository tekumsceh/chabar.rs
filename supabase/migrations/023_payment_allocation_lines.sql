-- Line-level payment targets: expense lines before fee within each date.

ALTER TABLE payment_allocations
  ADD COLUMN IF NOT EXISTS line_kind TEXT NOT NULL DEFAULT 'event';

ALTER TABLE payment_allocations
  ADD COLUMN IF NOT EXISTS expense_key TEXT NOT NULL DEFAULT '';

ALTER TABLE payment_allocations DROP CONSTRAINT IF EXISTS payment_allocations_payment_id_event_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS payment_allocations_line_unique
  ON payment_allocations (payment_id, event_id, line_kind, expense_key);
