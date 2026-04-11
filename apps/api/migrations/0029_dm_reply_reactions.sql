-- DM Stage 2: reply support + message reactions

-- == reply_to_message_id on dm_messages ==
ALTER TABLE dm_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES dm_messages(id) ON DELETE SET NULL;

-- == dm_message_reactions ==
CREATE TABLE IF NOT EXISTS dm_message_reactions (
  message_id UUID NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji),
  CONSTRAINT dm_message_reactions_emoji_length_check
    CHECK (char_length(emoji) BETWEEN 1 AND 32)
);

CREATE INDEX IF NOT EXISTS idx_dm_message_reactions_message
  ON dm_message_reactions(message_id, created_at DESC);
