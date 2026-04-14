import { db } from "../db.js";
import { isReadPointerAdvance } from "./read-pointer.js";
import { ensureTopicReadAccess, loadTopicWithRoom } from "./room-topic-messages-core.js";
import { normalizeBoundedString } from "../validators.js";

function normalizePointerCreatedAtIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const raw = normalizeBoundedString(value, 128) || "";
  if (!raw) {
    return "";
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : raw;
}

export async function markTopicRead(input: {
  topicId: string;
  userId: string;
  lastReadMessageId?: string | null;
}): Promise<{
  roomId: string;
  topicId: string;
  lastReadMessageId: string | null;
  lastReadAt: string;
  unreadDelta: number;
  mentionDelta: number;
}> {
  type ReadPointerPosition = {
    messageId: string;
    createdAtIso: string;
  };

  const topic = await loadTopicWithRoom(input.topicId);
  await ensureTopicReadAccess(topic, input.userId);

  const currentReadResult = await db.query<{
    last_read_message_id: string | null;
    last_read_at: string | null;
    last_read_message_created_at: string | null;
  }>(
    `SELECT
       rr.last_read_message_id,
       rr.last_read_at,
       m.created_at AS last_read_message_created_at
     FROM room_reads rr
     LEFT JOIN messages m ON m.id = rr.last_read_message_id
     WHERE rr.user_id = $1
       AND rr.topic_id = $2
     LIMIT 1`,
    [input.userId, input.topicId]
  );

  const currentReadRow = currentReadResult.rows[0] || null;
  const currentPointer: ReadPointerPosition | null = currentReadRow
    && currentReadRow.last_read_message_id
    && currentReadRow.last_read_message_created_at
    ? {
        messageId: normalizeBoundedString(currentReadRow.last_read_message_id, 128) || "",
        createdAtIso: normalizePointerCreatedAtIso(currentReadRow.last_read_message_created_at)
      }
    : null;

  let requestedPointer: ReadPointerPosition | null = null;

  if (input.lastReadMessageId) {
    const messageCheck = await db.query<{ id: string; created_at: string }>(
      `SELECT id, created_at
       FROM messages
       WHERE id = $1
         AND topic_id = $2
       LIMIT 1`,
      [input.lastReadMessageId, input.topicId]
    );

    if ((messageCheck.rowCount || 0) === 0) {
      throw new Error("message_not_found");
    }

    requestedPointer = {
      messageId: normalizeBoundedString(messageCheck.rows[0]?.id, 128) || "",
      createdAtIso: normalizePointerCreatedAtIso(messageCheck.rows[0]?.created_at)
    };

    if (currentPointer && requestedPointer && !isReadPointerAdvance(currentPointer, requestedPointer)) {
      return {
        roomId: topic.room_id,
        topicId: input.topicId,
        lastReadMessageId: currentReadRow?.last_read_message_id || null,
        lastReadAt: String(currentReadRow?.last_read_at || new Date().toISOString()),
        unreadDelta: 0,
        mentionDelta: 0
      };
    }
  }

  const unreadSnapshot = await db.query<{ unread_count: string }>(
    `SELECT
       GREATEST(
         0,
         (
           SELECT COUNT(*)::int
           FROM messages m
           WHERE m.topic_id = $1
             AND m.user_id <> $2
             AND m.created_at > COALESCE(
               (SELECT created_at FROM messages WHERE id = rr.last_read_message_id),
               to_timestamp(0)
             )
         )
       ) AS unread_count
     FROM (SELECT 1) AS _
     LEFT JOIN room_reads rr ON rr.user_id = $2 AND rr.topic_id = $1`,
    [input.topicId, input.userId]
  );

  const unreadDelta = Math.max(0, Number(unreadSnapshot.rows[0]?.unread_count || 0));
  const mentionDelta = 0;

  let persistedLastReadMessageId = input.lastReadMessageId || null;
  if (!persistedLastReadMessageId) {
    const latestMessage = await db.query<{ id: string }>(
      `SELECT id
       FROM messages
       WHERE topic_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [input.topicId]
    );
    persistedLastReadMessageId = normalizeBoundedString(latestMessage.rows[0]?.id, 128);
  }

  const upserted = await db.query<{ last_read_message_id: string | null; last_read_at: string }>(
    `INSERT INTO room_reads (user_id, room_id, topic_id, last_read_message_id, last_read_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, topic_id)
     DO UPDATE SET
       room_id = EXCLUDED.room_id,
       last_read_message_id = EXCLUDED.last_read_message_id,
       last_read_at = NOW()
     RETURNING last_read_message_id, last_read_at`,
    [input.userId, topic.room_id, input.topicId, persistedLastReadMessageId]
  );

  return {
    roomId: topic.room_id,
    topicId: input.topicId,
    lastReadMessageId: upserted.rows[0]?.last_read_message_id || null,
    lastReadAt: String(upserted.rows[0]?.last_read_at || new Date().toISOString()),
    unreadDelta,
    mentionDelta
  };
}
