-- Technical rider channel patch (inputs + monitor/output routing) per event.

CREATE TABLE IF NOT EXISTS event_tech_channels (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
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
  level_db NUMERIC(6, 1) NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_tech_channels_event_kind_idx
  ON event_tech_channels (event_id, kind, sort_order);

CREATE INDEX IF NOT EXISTS event_tech_channels_band_id_idx
  ON event_tech_channels (band_id);

DROP TRIGGER IF EXISTS event_tech_channels_set_updated_at ON event_tech_channels;
CREATE TRIGGER event_tech_channels_set_updated_at
BEFORE UPDATE ON event_tech_channels
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
