-- Chabar schema for Supabase (PostgreSQL) — bands-first

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('superadmin', 'admin', 'assistant', 'editor', 'member')),
  invite_preference TEXT NOT NULL DEFAULT 'accept' CHECK (invite_preference IN ('accept', 'digest', 'block')),
  extra_band_grants INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'group' CHECK (kind IN ('personal', 'group')),
  color TEXT NOT NULL DEFAULT '#276ef1',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS band_members (
  band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'member' CHECK (member_role IN ('owner', 'lead', 'member', 'saradnik')),
  can_edit_setlist BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (band_id, user_id)
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  event_date_text VARCHAR(32) NOT NULL DEFAULT '',
  city VARCHAR(255) NOT NULL DEFAULT '',
  venue VARCHAR(255) NOT NULL DEFAULT '',
  maps_url TEXT NOT NULL DEFAULT '',
  tech_console_ids TEXT NOT NULL DEFAULT '[]',
  tech_rider_origin TEXT NOT NULL DEFAULT 'none'
    CHECK (tech_rider_origin IN ('none', 'default', 'custom')),
  tech_rider_notes TEXT NOT NULL DEFAULT '',
  note VARCHAR(255) NOT NULL DEFAULT '',
  price_eur NUMERIC(12, 2) NOT NULL DEFAULT 0,
  transport_rsd NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  payment_date_text VARCHAR(32) NOT NULL DEFAULT '',
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR' CHECK (currency IN ('EUR', 'RSD')),
  exchange_rate NUMERIC(12, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id SERIAL PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  amount_eur NUMERIC(12, 2) NOT NULL DEFAULT 0,
  line_kind TEXT NOT NULL DEFAULT 'event',
  expense_key TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payment_id, event_id, line_kind, expense_key)
);

CREATE INDEX IF NOT EXISTS payment_allocations_event_id_idx ON payment_allocations(event_id);
CREATE INDEX IF NOT EXISTS payment_allocations_payment_id_idx ON payment_allocations(payment_id);

CREATE TABLE IF NOT EXISTS settings (
  band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  setting_key VARCHAR(64) NOT NULL,
  setting_value VARCHAR(255) NOT NULL,
  PRIMARY KEY (band_id, setting_key)
);

CREATE TABLE IF NOT EXISTS event_member_finance (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price_eur NUMERIC(12, 2) NOT NULL DEFAULT 0,
  transport_rsd NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_member_finance_user_id_idx ON event_member_finance(user_id);
CREATE INDEX IF NOT EXISTS payments_user_id_idx ON payments(user_id);

CREATE TABLE IF NOT EXISTS event_assignees (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_assignees_user_id_idx ON event_assignees(user_id);
CREATE INDEX IF NOT EXISTS event_assignees_event_id_idx ON event_assignees(event_id);

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
  is_empty BOOLEAN NOT NULL DEFAULT FALSE,
  level_db NUMERIC(6, 1) NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_tech_channels_event_kind_idx
  ON event_tech_channels (event_id, kind, sort_order);

CREATE TABLE IF NOT EXISTS band_tech_rider_defaults (
  band_id UUID PRIMARY KEY REFERENCES bands(id) ON DELETE CASCADE,
  console_ids TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_set_updated_at ON events;
CREATE TRIGGER events_set_updated_at
BEFORE UPDATE ON events
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS payments_set_updated_at ON payments;
CREATE TRIGGER payments_set_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS profiles_set_updated_at ON profiles;
CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS bands_set_updated_at ON bands;
CREATE TRIGGER bands_set_updated_at
BEFORE UPDATE ON bands
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS band_songs_set_updated_at ON band_songs;
CREATE TRIGGER band_songs_set_updated_at
BEFORE UPDATE ON band_songs
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS event_setlist_items_set_updated_at ON event_setlist_items;
CREATE TRIGGER event_setlist_items_set_updated_at
BEFORE UPDATE ON event_setlist_items
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
