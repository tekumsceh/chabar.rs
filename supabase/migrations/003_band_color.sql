-- Band accent color for UI chips (assigned on create)

ALTER TABLE bands
  ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#276ef1';

-- Backfill distinct colors for existing bands (stable by id)
UPDATE bands
SET color = (ARRAY[
  '#276ef1',
  '#0b875b',
  '#b45309',
  '#7c3aed',
  '#be123c',
  '#0e7490',
  '#c2410c',
  '#4338ca',
  '#15803d',
  '#a21caf'
])[1 + (abs(hashtext(id::text)) % 10)];
