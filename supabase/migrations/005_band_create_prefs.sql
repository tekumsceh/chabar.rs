-- Profile prefs for band ownership limits and invite spam control

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS extra_band_grants INTEGER NOT NULL DEFAULT 0;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS invite_preference TEXT NOT NULL DEFAULT 'accept';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_invite_preference_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_invite_preference_check
      CHECK (invite_preference IN ('accept', 'digest', 'block'));
  END IF;
END $$;

COMMENT ON COLUMN profiles.extra_band_grants IS
  'Extra group bands this user may own beyond the default 5 (grants / future paid).';
COMMENT ON COLUMN profiles.invite_preference IS
  'accept = join/invite now; digest = queue for later summary; block = refuse invites.';
