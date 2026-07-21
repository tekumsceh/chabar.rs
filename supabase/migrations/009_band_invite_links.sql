-- Reusable shareable invite links (one active token per band).
-- Opening the link after sign-in/sign-up auto-joins as member.

CREATE TABLE IF NOT EXISTS band_invite_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  member_role TEXT NOT NULL DEFAULT 'member'
    CHECK (member_role IN ('lead', 'member')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (band_id)
);

CREATE INDEX IF NOT EXISTS band_invite_links_token_idx ON band_invite_links (token);
