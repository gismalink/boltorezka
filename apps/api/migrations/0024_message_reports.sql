CREATE TABLE IF NOT EXISTS room_message_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES room_topics(id) ON DELETE SET NULL,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  server_id UUID REFERENCES servers(id) ON DELETE SET NULL,
  reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT room_message_reports_reason_length_check CHECK (char_length(reason) BETWEEN 1 AND 160),
  CONSTRAINT room_message_reports_details_length_check CHECK (details IS NULL OR char_length(details) <= 2000),
  CONSTRAINT room_message_reports_unique_reporter UNIQUE (message_id, reporter_user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_message_reports_server_created
  ON room_message_reports(server_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_room_message_reports_room_created
  ON room_message_reports(room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_room_message_reports_reporter_created
  ON room_message_reports(reporter_user_id, created_at DESC);
