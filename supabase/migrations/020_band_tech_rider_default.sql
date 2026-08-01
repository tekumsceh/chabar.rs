-- Band-level default technical rider (template) + per-event origin flag.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS tech_rider_origin TEXT NOT NULL DEFAULT 'none';

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_tech_rider_origin_check;

ALTER TABLE events
  ADD CONSTRAINT events_tech_rider_origin_check
  CHECK (tech_rider_origin IN ('none', 'default', 'custom'));

CREATE TABLE IF NOT EXISTS band_tech_rider_defaults (
  band_id UUID PRIMARY KEY REFERENCES bands(id) ON DELETE CASCADE,
  console_ids TEXT NOT NULL DEFAULT '[]',
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS band_tech_rider_defaults_set_updated_at ON band_tech_rider_defaults;
CREATE TRIGGER band_tech_rider_defaults_set_updated_at
BEFORE UPDATE ON band_tech_rider_defaults
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TABLE IF NOT EXISTS band_tech_rider_default_channels (
  id SERIAL PRIMARY KEY,
  band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('input', 'output')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  gear TEXT NOT NULL DEFAULT '',
  cable TEXT NOT NULL DEFAULT '',
  hardware TEXT NOT NULL DEFAULT '',
  phantom_48v BOOLEAN NOT NULL DEFAULT FALSE,
  pad BOOLEAN NOT NULL DEFAULT FALSE,
  stereo BOOLEAN NOT NULL DEFAULT FALSE,
  is_empty BOOLEAN NOT NULL DEFAULT FALSE,
  level_db NUMERIC(6, 1) NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS band_tech_rider_default_channels_band_kind_idx
  ON band_tech_rider_default_channels (band_id, kind, sort_order);

DROP TRIGGER IF EXISTS band_tech_rider_default_channels_set_updated_at ON band_tech_rider_default_channels;
CREATE TRIGGER band_tech_rider_default_channels_set_updated_at
BEFORE UPDATE ON band_tech_rider_default_channels
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
