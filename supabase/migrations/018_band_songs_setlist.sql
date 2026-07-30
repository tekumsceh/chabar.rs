-- Band songbook + per-event set list items + set-list editor permission hook.

ALTER TABLE band_members
  ADD COLUMN IF NOT EXISTS can_edit_setlist BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN band_members.can_edit_setlist IS
  'When true, this member may edit band songs and event set lists (owner/lead always can).';

CREATE TABLE IF NOT EXISTS band_songs (
  id SERIAL PRIMARY KEY,
  band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  song_key TEXT NOT NULL DEFAULT '',
  lyrics TEXT NOT NULL DEFAULT '',
  duration_sec INTEGER NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS band_songs_band_sort_idx
  ON band_songs (band_id, sort_order);

CREATE INDEX IF NOT EXISTS band_songs_band_id_idx
  ON band_songs (band_id);

DROP TRIGGER IF EXISTS band_songs_set_updated_at ON band_songs;
CREATE TRIGGER band_songs_set_updated_at
BEFORE UPDATE ON band_songs
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TABLE IF NOT EXISTS event_setlist_items (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('main', 'encore', 'alts')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  song_id INTEGER NULL REFERENCES band_songs(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  song_key TEXT NOT NULL DEFAULT '',
  lyrics TEXT NOT NULL DEFAULT '',
  duration_sec INTEGER NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_setlist_items_event_section_idx
  ON event_setlist_items (event_id, section, sort_order);

CREATE INDEX IF NOT EXISTS event_setlist_items_band_id_idx
  ON event_setlist_items (band_id);

DROP TRIGGER IF EXISTS event_setlist_items_set_updated_at ON event_setlist_items;
CREATE TRIGGER event_setlist_items_set_updated_at
BEFORE UPDATE ON event_setlist_items
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
