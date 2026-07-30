-- Mark a tech-rider channel as intentionally empty (do not patch).

ALTER TABLE event_tech_channels
  ADD COLUMN IF NOT EXISTS is_empty BOOLEAN NOT NULL DEFAULT FALSE;
