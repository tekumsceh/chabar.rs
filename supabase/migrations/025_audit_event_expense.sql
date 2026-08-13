-- Audit troškovi (event_expenses) insert/delete.

ALTER TABLE transaction_audit DROP CONSTRAINT IF EXISTS transaction_audit_entity_type_check;
ALTER TABLE transaction_audit
  ADD CONSTRAINT transaction_audit_entity_type_check
  CHECK (entity_type IN (
    'event',
    'payment',
    'event_member_finance',
    'band_member',
    'event_expense'
  ));
