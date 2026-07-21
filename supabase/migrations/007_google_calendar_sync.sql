-- Google Calendar sync (band link + personal opt-in)

CREATE TABLE IF NOT EXISTS user_google_accounts (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  google_sub TEXT,
  email TEXT,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_calendar_prefs (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  personal_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  personal_calendar_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS band_google_calendars (
  band_id UUID PRIMARY KEY REFERENCES bands(id) ON DELETE CASCADE,
  google_calendar_id TEXT NOT NULL,
  calendar_summary TEXT,
  connected_by_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sync_token TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT,
  ADD COLUMN IF NOT EXISTS sync_source TEXT NOT NULL DEFAULT 'chabar',
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS events_google_event_id_idx ON events (google_event_id)
  WHERE google_event_id IS NOT NULL;

COMMENT ON TABLE band_google_calendars IS
  'Linked Google Calendar for a band. connected_by_user_id is sticky (v1).';
COMMENT ON COLUMN events.sync_source IS
  'chabar = created in app; google = imported from band calendar.';
