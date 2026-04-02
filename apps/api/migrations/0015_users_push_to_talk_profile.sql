ALTER TABLE users
  ADD COLUMN IF NOT EXISTS walkie_talkie_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS walkie_talkie_hotkey TEXT NOT NULL DEFAULT 'Space';

UPDATE users
SET walkie_talkie_hotkey = 'Space'
WHERE COALESCE(BTRIM(walkie_talkie_hotkey), '') = '';