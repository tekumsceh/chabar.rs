-- Bands-first ownership for IO Organize
-- Safe to re-run partially; backfill script handles data attribution.

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('superadmin', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'group' CHECK (kind IN ('personal', 'group')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS band_members (
  band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'member' CHECK (member_role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (band_id, user_id)
);

CREATE INDEX IF NOT EXISTS band_members_user_id_idx ON band_members(user_id);
CREATE INDEX IF NOT EXISTS bands_kind_idx ON bands(kind);

ALTER TABLE events ADD COLUMN IF NOT EXISTS band_id UUID REFERENCES bands(id) ON DELETE CASCADE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS band_id UUID REFERENCES bands(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS events_band_id_idx ON events(band_id);
CREATE INDEX IF NOT EXISTS payments_band_id_idx ON payments(band_id);

-- Rebuild settings as per-band key/value store
CREATE TABLE IF NOT EXISTS settings_band (
  band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  setting_key VARCHAR(64) NOT NULL,
  setting_value VARCHAR(255) NOT NULL,
  PRIMARY KEY (band_id, setting_key)
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON profiles;
CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS bands_set_updated_at ON bands;
CREATE TRIGGER bands_set_updated_at
BEFORE UPDATE ON bands
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
