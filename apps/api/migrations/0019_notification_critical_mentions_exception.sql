ALTER TABLE room_notification_settings
  ADD COLUMN IF NOT EXISTS allow_critical_mentions BOOLEAN NOT NULL DEFAULT TRUE;
