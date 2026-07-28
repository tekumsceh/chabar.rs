-- Expand in-app notification types + payload; Web Push subscriptions.

ALTER TABLE user_notifications DROP CONSTRAINT IF EXISTS user_notifications_type_check;

ALTER TABLE user_notifications
  ADD CONSTRAINT user_notifications_type_check
  CHECK (type IN (
    'member_joined',
    'member_removed',
    'member_role_changed',
    'event_created',
    'event_updated',
    'event_deleted',
    'finance_changed',
    'expense_changed',
    'comment_added',
    'payment_changed'
  ));

ALTER TABLE user_notifications
  ADD COLUMN IF NOT EXISTS payload JSONB;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON push_subscriptions (user_id);
