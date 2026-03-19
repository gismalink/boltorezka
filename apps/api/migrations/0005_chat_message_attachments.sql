CREATE TABLE IF NOT EXISTS message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  download_url TEXT,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  checksum TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT message_attachments_type_check CHECK (type IN ('image')),
  CONSTRAINT message_attachments_size_bytes_check CHECK (size_bytes > 0),
  CONSTRAINT message_attachments_width_check CHECK (width IS NULL OR width > 0),
  CONSTRAINT message_attachments_height_check CHECK (height IS NULL OR height > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_message_attachments_storage_key ON message_attachments(storage_key);
CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id ON message_attachments(message_id);
