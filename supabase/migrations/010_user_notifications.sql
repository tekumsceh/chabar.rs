-- In-app notices for band events (e.g. member joined after invite / link).

CREATE TABLE IF NOT EXISTS user_notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('member_joined')),
  band_id UUID REFERENCES bands(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  message TEXT NOT NULL DEFAULT '',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_notifications_user_unread_idx
  ON user_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS user_notifications_user_created_idx
  ON user_notifications (user_id, created_at DESC);
