-- Day timeline / kompletni detalji for a date (times + soundcheck duration).

CREATE TABLE IF NOT EXISTS event_day_details (
  event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  gathering_time TEXT NOT NULL DEFAULT '',
  departure_time TEXT NOT NULL DEFAULT '',
  lodging_arrival_time TEXT NOT NULL DEFAULT '',
  load_in_time TEXT NOT NULL DEFAULT '',
  set_up_time TEXT NOT NULL DEFAULT '',
  soundcheck_time TEXT NOT NULL DEFAULT '',
  soundcheck_duration_min INTEGER NULL CHECK (
    soundcheck_duration_min IS NULL
    OR (soundcheck_duration_min >= 0 AND soundcheck_duration_min <= 24 * 60)
  ),
  show_start_time TEXT NOT NULL DEFAULT '',
  show_end_time TEXT NOT NULL DEFAULT '',
  curfew_time TEXT NOT NULL DEFAULT '',
  leave_time TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_day_details_band_id_idx ON event_day_details (band_id);

DROP TRIGGER IF EXISTS event_day_details_set_updated_at ON event_day_details;
CREATE TRIGGER event_day_details_set_updated_at
BEFORE UPDATE ON event_day_details
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
