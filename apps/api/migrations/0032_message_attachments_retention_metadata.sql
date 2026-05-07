ALTER TABLE message_attachments
  ADD COLUMN IF NOT EXISTS size_class TEXT;

ALTER TABLE message_attachments
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE message_attachments
SET size_class = CASE
  WHEN size_bytes > 26214400 THEN 'large'
  ELSE 'small'
END
WHERE size_class IS NULL;

UPDATE message_attachments
SET expires_at = created_at + INTERVAL '7 days'
WHERE size_class = 'large' AND expires_at IS NULL;

UPDATE message_attachments
SET expires_at = NULL
WHERE size_class = 'small' AND expires_at IS NOT NULL;

ALTER TABLE message_attachments
  ALTER COLUMN size_class SET NOT NULL;

ALTER TABLE message_attachments
  DROP CONSTRAINT IF EXISTS message_attachments_size_class_check;

ALTER TABLE message_attachments
  ADD CONSTRAINT message_attachments_size_class_check
  CHECK (size_class IN ('small', 'large'));

CREATE INDEX IF NOT EXISTS idx_message_attachments_size_class ON message_attachments(size_class);
CREATE INDEX IF NOT EXISTS idx_message_attachments_expires_at ON message_attachments(expires_at) WHERE expires_at IS NOT NULL;
