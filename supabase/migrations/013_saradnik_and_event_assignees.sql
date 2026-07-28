-- Saradnik band role + per-date event assignment
-- Saradnici only see/access events they are explicitly assigned to.

ALTER TABLE band_members
  DROP CONSTRAINT IF EXISTS band_members_member_role_check;

ALTER TABLE band_members
  ADD CONSTRAINT band_members_member_role_check
  CHECK (member_role IN ('owner', 'lead', 'member', 'saradnik'));

CREATE TABLE IF NOT EXISTS event_assignees (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_assignees_user_id_idx ON event_assignees(user_id);
CREATE INDEX IF NOT EXISTS event_assignees_event_id_idx ON event_assignees(event_id);

-- Saradnik should not invite by default (existing rows if any)
UPDATE band_members
SET can_invite = FALSE
WHERE member_role = 'saradnik' AND can_invite IS DISTINCT FROM FALSE;
