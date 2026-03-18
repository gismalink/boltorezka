CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_state TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users
SET access_state = 'active'
WHERE access_state IS NULL OR COALESCE(TRIM(access_state), '') = '';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_access_state_check;
ALTER TABLE users
ADD CONSTRAINT users_access_state_check CHECK (access_state IN ('pending', 'active', 'blocked'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_theme TEXT NOT NULL DEFAULT '8-neon-bit';

UPDATE users
SET ui_theme = '8-neon-bit'
WHERE ui_theme IS NULL OR COALESCE(TRIM(ui_theme), '') = '';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_ui_theme_check;
ALTER TABLE users
ADD CONSTRAINT users_ui_theme_check CHECK (ui_theme IN ('8-neon-bit', 'material-classic'));

UPDATE users
SET username = split_part(email, '@', 1)
WHERE COALESCE(TRIM(username), '') = ''
  AND COALESCE(TRIM(email), '') <> '';

CREATE TABLE IF NOT EXISTS server_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  audio_quality TEXT NOT NULL DEFAULT 'standard',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT server_settings_singleton CHECK (id = TRUE),
  CONSTRAINT server_settings_audio_quality_check CHECK (audio_quality IN ('retro', 'low', 'standard', 'high'))
);

INSERT INTO server_settings (id, audio_quality)
VALUES (TRUE, 'standard')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE server_settings DROP CONSTRAINT IF EXISTS server_settings_audio_quality_check;
ALTER TABLE server_settings
ADD CONSTRAINT server_settings_audio_quality_check CHECK (audio_quality IN ('retro', 'low', 'standard', 'high'));

CREATE TABLE IF NOT EXISTS room_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'text';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS audio_quality_override TEXT;

ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_audio_quality_override_check;
ALTER TABLE rooms
ADD CONSTRAINT rooms_audio_quality_override_check
CHECK (audio_quality_override IS NULL OR audio_quality_override IN ('retro', 'low', 'standard', 'high'));

UPDATE rooms SET kind = 'text_voice' WHERE kind = 'voice';
UPDATE rooms SET kind = 'text' WHERE kind NOT IN ('text', 'text_voice', 'text_voice_video');

ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_kind_check;
ALTER TABLE rooms
ADD CONSTRAINT rooms_kind_check CHECK (kind IN ('text', 'text_voice', 'text_voice_video'));

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES room_categories(id) ON DELETE SET NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS user_member_preferences (
  viewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  volume SMALLINT NOT NULL DEFAULT 100,
  note VARCHAR(32) NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (viewer_user_id, target_user_id),
  CONSTRAINT user_member_preferences_volume_check CHECK (volume BETWEEN 0 AND 100),
  CONSTRAINT user_member_preferences_note_length_check CHECK (char_length(note) <= 32)
);

CREATE INDEX IF NOT EXISTS idx_user_member_preferences_viewer ON user_member_preferences(viewer_user_id);
CREATE INDEX IF NOT EXISTS idx_rooms_category_position ON rooms(category_id, position);
CREATE INDEX IF NOT EXISTS idx_rooms_archived ON rooms(is_archived);
