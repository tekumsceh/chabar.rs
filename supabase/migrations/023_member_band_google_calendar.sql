-- Per-member Google Calendar prefs per band + multi-target sync mapping

CREATE TABLE IF NOT EXISTS user_band_calendar_prefs (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, band_id)
);

CREATE TABLE IF NOT EXISTS event_google_sync (
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL,
  google_event_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('band', 'member')),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, kind, user_id)
);

CREATE INDEX IF NOT EXISTS event_google_sync_google_event_id_idx
  ON event_google_sync (google_event_id)
  WHERE google_event_id IS NOT NULL;

COMMENT ON TABLE user_band_calendar_prefs IS
  'Member opts in to sync this band''s dates into their own Google calendar.';
COMMENT ON TABLE event_google_sync IS
  'Maps a Chabar event to Google events (band shared + per-member copies).';

-- Backfill band sync rows from legacy events columns
INSERT INTO event_google_sync (event_id, user_id, calendar_id, google_event_id, kind, synced_at)
SELECT e.id, bgc.connected_by_user_id, e.google_calendar_id, e.google_event_id, 'band', COALESCE(e.synced_at, NOW())
FROM events e
JOIN band_google_calendars bgc
  ON bgc.band_id = e.band_id AND bgc.google_calendar_id = e.google_calendar_id
WHERE e.google_event_id IS NOT NULL
  AND e.google_calendar_id IS NOT NULL
ON CONFLICT (event_id, kind, user_id) DO NOTHING;
