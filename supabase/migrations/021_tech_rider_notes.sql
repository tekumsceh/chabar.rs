-- Event-level technical rider notes (for organizers / tech crew).
-- Also stored on band default so new dates inherit them.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS tech_rider_notes TEXT NOT NULL DEFAULT '';

ALTER TABLE band_tech_rider_defaults
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
