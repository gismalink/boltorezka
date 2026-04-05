CREATE TABLE IF NOT EXISTS room_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT room_topics_slug_length_check CHECK (char_length(slug) BETWEEN 1 AND 64),
  CONSTRAINT room_topics_title_length_check CHECK (char_length(title) BETWEEN 1 AND 160),
  CONSTRAINT room_topics_slug_room_unique UNIQUE (room_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_room_topics_room_position ON room_topics(room_id, position, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_topics_room_archived ON room_topics(room_id, archived_at);

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES room_topics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_topic_created_at ON messages(topic_id, created_at DESC);

INSERT INTO room_topics (room_id, slug, title, position, created_by)
SELECT r.id, 'general', 'General', 0, r.created_by
FROM rooms r
WHERE NOT EXISTS (
  SELECT 1
  FROM room_topics rt
  WHERE rt.room_id = r.id
    AND rt.slug = 'general'
);

UPDATE messages m
SET topic_id = rt.id
FROM room_topics rt
WHERE m.room_id = rt.room_id
  AND rt.slug = 'general'
  AND m.topic_id IS NULL;

CREATE TABLE IF NOT EXISTS room_message_replies (
  message_id UUID PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  parent_message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT room_message_replies_no_self CHECK (message_id <> parent_message_id)
);

CREATE INDEX IF NOT EXISTS idx_room_message_replies_parent ON room_message_replies(parent_message_id, created_at DESC);

CREATE TABLE IF NOT EXISTS room_message_pins (
  message_id UUID PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  pinned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_message_pins_pinned_at ON room_message_pins(pinned_at DESC);

CREATE TABLE IF NOT EXISTS room_message_reactions (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji),
  CONSTRAINT room_message_reactions_emoji_length_check CHECK (char_length(emoji) BETWEEN 1 AND 32)
);

CREATE INDEX IF NOT EXISTS idx_room_message_reactions_message ON room_message_reactions(message_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_message_reactions_user ON room_message_reactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS room_reads (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES room_topics(id) ON DELETE CASCADE,
  last_read_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_room_reads_room_topic ON room_reads(room_id, topic_id, last_read_at DESC);

CREATE TABLE IF NOT EXISTS room_notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL,
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES room_topics(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'all',
  mute_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT room_notification_settings_scope_check CHECK (scope_type IN ('server', 'room', 'topic')),
  CONSTRAINT room_notification_settings_mode_check CHECK (mode IN ('all', 'mentions', 'none'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_room_notification_settings_server
  ON room_notification_settings(user_id, server_id)
  WHERE scope_type = 'server';

CREATE UNIQUE INDEX IF NOT EXISTS idx_room_notification_settings_room
  ON room_notification_settings(user_id, room_id)
  WHERE scope_type = 'room';

CREATE UNIQUE INDEX IF NOT EXISTS idx_room_notification_settings_topic
  ON room_notification_settings(user_id, topic_id)
  WHERE scope_type = 'topic';

CREATE TABLE IF NOT EXISTS moderation_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  server_id UUID REFERENCES servers(id) ON DELETE SET NULL,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  topic_id UUID REFERENCES room_topics(id) ON DELETE SET NULL,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_audit_log_server_created ON moderation_audit_log(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_audit_log_room_created ON moderation_audit_log(room_id, created_at DESC);
