-- Per-member invite privilege (owners/leads can revoke one-by-one)

ALTER TABLE band_members
  ADD COLUMN IF NOT EXISTS can_invite BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN band_members.can_invite IS
  'When true, this member may send band invites. Owner/lead can revoke per member.';
