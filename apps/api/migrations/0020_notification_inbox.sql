CREATE TABLE IF NOT EXISTS notification_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES room_topics(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  CONSTRAINT notification_inbox_event_type_check CHECK (event_type IN ('reply_to_me', 'mention_me', 'message_pinned')),
  CONSTRAINT notification_inbox_priority_check CHECK (priority IN ('normal', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_notification_inbox_user_created
  ON notification_inbox(user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_notification_inbox_user_unread
  ON notification_inbox(user_id, read_at, created_at DESC)
  WHERE read_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_inbox_user_dedupe
  ON notification_inbox(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
