CREATE TABLE IF NOT EXISTS notification_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  expiration_time TIMESTAMPTZ,
  runtime TEXT NOT NULL DEFAULT 'web',
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error TEXT,
  CONSTRAINT notification_push_subscriptions_runtime_check CHECK (runtime IN ('web', 'desktop'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_push_subscriptions_user_endpoint
  ON notification_push_subscriptions(user_id, endpoint);

CREATE INDEX IF NOT EXISTS idx_notification_push_subscriptions_user_runtime
  ON notification_push_subscriptions(user_id, runtime);
