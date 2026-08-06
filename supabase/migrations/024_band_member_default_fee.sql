-- Per-member default honorar (EUR) on band_members + audit entity for changes.

ALTER TABLE band_members
  ADD COLUMN IF NOT EXISTS default_price_eur NUMERIC(12,2);

COMMENT ON COLUMN band_members.default_price_eur IS
  'Default fee (EUR) for this member; used by «Podrazumevano» on new dates.';

ALTER TABLE transaction_audit DROP CONSTRAINT IF EXISTS transaction_audit_entity_type_check;
ALTER TABLE transaction_audit
  ADD CONSTRAINT transaction_audit_entity_type_check
  CHECK (entity_type IN ('event', 'payment', 'event_member_finance', 'band_member'));
