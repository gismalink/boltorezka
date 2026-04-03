ALTER TABLE message_attachments
  DROP CONSTRAINT IF EXISTS message_attachments_type_check;

ALTER TABLE message_attachments
  ADD CONSTRAINT message_attachments_type_check
  CHECK (type IN ('image', 'document', 'audio'));
