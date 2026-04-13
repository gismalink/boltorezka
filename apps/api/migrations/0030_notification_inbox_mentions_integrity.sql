-- Enforce actionable mention notifications with strict message linkage.
-- 1) Cleanup legacy orphan mention rows.
-- 2) Switch message FK to ON DELETE CASCADE so dangling message references cannot remain.
-- 3) Require message_id for mention_me events.

DELETE FROM notification_inbox ni
WHERE ni.event_type = 'mention_me'
  AND (
    ni.message_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM messages m
      WHERE m.id = ni.message_id
    )
  );

ALTER TABLE notification_inbox
  DROP CONSTRAINT IF EXISTS notification_inbox_message_id_fkey;

ALTER TABLE notification_inbox
  ADD CONSTRAINT notification_inbox_message_id_fkey
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE;

ALTER TABLE notification_inbox
  DROP CONSTRAINT IF EXISTS notification_inbox_mention_message_required_check;

ALTER TABLE notification_inbox
  ADD CONSTRAINT notification_inbox_mention_message_required_check
  CHECK (event_type <> 'mention_me' OR message_id IS NOT NULL);
