ALTER TABLE notification_inbox
  DROP CONSTRAINT IF EXISTS notification_inbox_event_type_check;

ALTER TABLE notification_inbox
  ADD CONSTRAINT notification_inbox_event_type_check
  CHECK (event_type IN ('reply_to_me', 'mention_me', 'message_pinned', 'moderation_action'));
