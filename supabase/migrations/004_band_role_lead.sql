-- Band role rename: admin → lead (keep web "admin" untouched)
-- Safe to re-run.

UPDATE band_members SET member_role = 'lead' WHERE member_role = 'admin';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'band_invites'
  ) THEN
    UPDATE band_invites SET member_role = 'lead' WHERE member_role = 'admin';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'band_invite_links'
  ) THEN
    UPDATE band_invite_links SET member_role = 'lead' WHERE member_role = 'admin';
  END IF;
END $$;

ALTER TABLE band_members DROP CONSTRAINT IF EXISTS band_members_member_role_check;
ALTER TABLE band_members
  ADD CONSTRAINT band_members_member_role_check
  CHECK (member_role IN ('owner', 'lead', 'member'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'band_invites'
  ) THEN
    ALTER TABLE band_invites DROP CONSTRAINT IF EXISTS band_invites_member_role_check;
    ALTER TABLE band_invites
      ADD CONSTRAINT band_invites_member_role_check
      CHECK (member_role IN ('lead', 'member'));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'band_invite_links'
  ) THEN
    ALTER TABLE band_invite_links DROP CONSTRAINT IF EXISTS band_invite_links_member_role_check;
    ALTER TABLE band_invite_links
      ADD CONSTRAINT band_invite_links_member_role_check
      CHECK (member_role IN ('lead', 'member'));
  END IF;
END $$;
