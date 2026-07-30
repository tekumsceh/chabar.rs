-- Optional Google Maps URL for an event venue (share/place link).
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS maps_url TEXT NOT NULL DEFAULT '';
