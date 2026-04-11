-- DM Stage 1: core tables for direct messaging
-- dm_threads, dm_messages, dm_read_cursors, dm_contacts, dm_user_settings, dm_block_list

-- == dm_threads ==
-- One thread per unique pair of users.
-- user_low_id < user_high_id (normalised order for dedup).

CREATE TABLE IF NOT EXISTS dm_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_low_id UUID NOT NULL REFERENCES users(id),
  user_high_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dm_threads_users_ordered CHECK (user_low_id < user_high_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_threads_pair
  ON dm_threads(user_low_id, user_high_id);

-- Fast lookup: "all threads for user X"
CREATE INDEX IF NOT EXISTS idx_dm_threads_user_low  ON dm_threads(user_low_id);
CREATE INDEX IF NOT EXISTS idx_dm_threads_user_high ON dm_threads(user_high_id);

-- == dm_messages ==

CREATE TABLE IF NOT EXISTS dm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL DEFAULT '',
  attachments_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_thread_created
  ON dm_messages(thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_messages_sender
  ON dm_messages(sender_user_id);

-- == dm_read_cursors ==
-- Per-user read position in each thread.

CREATE TABLE IF NOT EXISTS dm_read_cursors (
  thread_id UUID NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  last_read_message_id UUID REFERENCES dm_messages(id),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

-- == dm_contacts ==

CREATE TABLE IF NOT EXISTS dm_contacts (
  owner_user_id UUID NOT NULL REFERENCES users(id),
  contact_user_id UUID NOT NULL REFERENCES users(id),
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, contact_user_id),
  CONSTRAINT dm_contacts_no_self CHECK (owner_user_id <> contact_user_id)
);

-- == dm_user_settings ==

CREATE TABLE IF NOT EXISTS dm_user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  allow_dm_from TEXT NOT NULL DEFAULT 'everyone',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- == dm_block_list ==

CREATE TABLE IF NOT EXISTS dm_block_list (
  owner_user_id UUID NOT NULL REFERENCES users(id),
  blocked_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, blocked_user_id),
  CONSTRAINT dm_block_no_self CHECK (owner_user_id <> blocked_user_id)
);
