import { db } from "../db.js";
import type { RoomMessageRow, RoomRow, RoomTopicRow } from "../db.types.ts";
import {
  canModerateMessage,
  ensureOwnMessageWithinWindow,
  ensureTopicReadAccess,
  ensureTopicSendAllowed,
  loadMessageContext,
  loadTopicWithRoom,
  mapRoom
} from "./room-topic-messages-core.js";
import { normalizeBoundedString } from "../validators.js";

export async function createTopicMessage(input: {
  topicId: string;
  userId: string;
  text: string;
}): Promise<{
  room: RoomRow;
  topic: Pick<RoomTopicRow, "id" | "room_id" | "slug" | "title" | "archived_at">;
  message: RoomMessageRow;
}> {
  const topic = await loadTopicWithRoom(input.topicId);
  await ensureTopicReadAccess(topic, input.userId);
  await ensureTopicSendAllowed(topic, input.userId);

  if (topic.topic_archived_at) {
    throw new Error("topic_archived");
  }

  const userResult = await db.query<{ id: string; name: string }>(
    `SELECT id, name
     FROM users
     WHERE id = $1
       AND is_banned = FALSE
     LIMIT 1`,
    [input.userId]
  );

  const user = userResult.rows[0];
  if (!user) {
    throw new Error("user_not_found");
  }

  const inserted = await db.query<{ id: string; room_id: string; topic_id: string; user_id: string; body: string; created_at: string }>(
    `INSERT INTO messages (room_id, topic_id, user_id, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id, room_id, topic_id, user_id, body, created_at`,
    [topic.room_id, topic.topic_id, input.userId, input.text]
  );

  const row = inserted.rows[0];
  if (!row) {
    throw new Error("message_create_failed");
  }

  return {
    room: mapRoom(topic),
    topic: {
      id: topic.topic_id,
      room_id: topic.room_id,
      slug: topic.topic_slug,
      title: topic.topic_title,
      archived_at: topic.topic_archived_at
    },
    message: {
      id: row.id,
      room_id: row.room_id,
      topic_id: row.topic_id,
      user_id: row.user_id,
      text: row.body,
      created_at: row.created_at,
      edited_at: null,
      user_name: user.name,
      attachments: []
    }
  };
}

export async function editTopicMessage(input: {
  messageId: string;
  userId: string;
  text: string;
}): Promise<{
  room: RoomRow;
  topic: { id: string; slug: string };
  message: RoomMessageRow;
}> {
  const context = await loadMessageContext(input.messageId);
  await ensureTopicReadAccess(context, input.userId);

  const canModerate = await canModerateMessage(context, input.userId);
  if (!canModerate) {
    ensureOwnMessageWithinWindow(context, input.userId);
  }

  const updated = await db.query<{ id: string; room_id: string; topic_id: string; user_id: string; body: string; created_at: string; updated_at: string }>(
    `UPDATE messages
     SET body = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, room_id, topic_id, user_id, body, created_at, updated_at`,
    [input.messageId, input.text]
  );

  const updatedRow = updated.rows[0];
  if (!updatedRow) {
    throw new Error("message_not_found");
  }

  const userResult = await db.query<{ name: string }>(
    `SELECT name FROM users WHERE id = $1 LIMIT 1`,
    [updatedRow.user_id]
  );

  return {
    room: mapRoom(context),
    topic: {
      id: context.topic_id,
      slug: context.topic_slug
    },
    message: {
      id: updatedRow.id,
      room_id: updatedRow.room_id,
      topic_id: updatedRow.topic_id,
      user_id: updatedRow.user_id,
      text: updatedRow.body,
      created_at: updatedRow.created_at,
      edited_at: updatedRow.updated_at,
      user_name: String(userResult.rows[0]?.name || "Unknown"),
      attachments: []
    }
  };
}

export async function deleteTopicMessage(input: {
  messageId: string;
  userId: string;
}): Promise<{
  room: RoomRow;
  topic: { id: string; slug: string };
  messageId: string;
  deletedAt: string;
}> {
  const context = await loadMessageContext(input.messageId);
  await ensureTopicReadAccess(context, input.userId);

  const canModerate = await canModerateMessage(context, input.userId);
  if (!canModerate) {
    ensureOwnMessageWithinWindow(context, input.userId);
  }

  const deleted = await db.query<{ id: string }>(
    `DELETE FROM messages
     WHERE id = $1
     RETURNING id`,
    [input.messageId]
  );

  if ((deleted.rowCount || 0) === 0) {
    throw new Error("message_not_found");
  }

  return {
    room: mapRoom(context),
    topic: {
      id: context.topic_id,
      slug: context.topic_slug
    },
    messageId: input.messageId,
    deletedAt: new Date().toISOString()
  };
}

export async function replyTopicMessage(input: {
  messageId: string;
  userId: string;
  text: string;
}): Promise<{
  room: RoomRow;
  topic: { id: string; slug: string; title: string; archivedAt: string | null };
  message: RoomMessageRow;
  parentMessageId: string;
}> {
  const context = await loadMessageContext(input.messageId);
  await ensureTopicReadAccess(context, input.userId);
  await ensureTopicSendAllowed(context, input.userId);

  if (context.topic_archived_at) {
    throw new Error("topic_archived");
  }

  const userResult = await db.query<{ id: string; name: string }>(
    `SELECT id, name FROM users WHERE id = $1 AND is_banned = FALSE LIMIT 1`,
    [input.userId]
  );
  const user = userResult.rows[0];
  if (!user) {
    throw new Error("user_not_found");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const inserted = await client.query<{ id: string; room_id: string; topic_id: string; user_id: string; body: string; created_at: string }>(
      `INSERT INTO messages (room_id, topic_id, user_id, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, room_id, topic_id, user_id, body, created_at`,
      [context.room_id, context.topic_id, input.userId, input.text]
    );

    const row = inserted.rows[0];
    if (!row) {
      throw new Error("message_create_failed");
    }

    await client.query(
      `INSERT INTO room_message_replies (message_id, parent_message_id)
       VALUES ($1, $2)
       ON CONFLICT (message_id) DO UPDATE SET parent_message_id = EXCLUDED.parent_message_id`,
      [row.id, input.messageId]
    );

    await client.query("COMMIT");

    return {
      room: mapRoom(context),
      topic: {
        id: context.topic_id,
        slug: context.topic_slug,
        title: context.topic_title,
        archivedAt: context.topic_archived_at
      },
      message: {
        id: row.id,
        room_id: row.room_id,
        topic_id: row.topic_id,
        reply_to_message_id: input.messageId,
        reply_to_user_id: context.message_user_id,
        reply_to_user_name: context.message_user_name,
        reply_to_text: context.message_body,
        user_id: row.user_id,
        text: row.body,
        created_at: row.created_at,
        edited_at: null,
        user_name: user.name,
        attachments: []
      },
      parentMessageId: input.messageId
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setTopicMessagePinned(input: {
  messageId: string;
  userId: string;
  pinned: boolean;
}): Promise<{
  room: RoomRow;
  topic: { id: string; slug: string };
  messageId: string;
  messageAuthorUserId: string;
  pinned: boolean;
}> {
  const context = await loadMessageContext(input.messageId);
  await ensureTopicReadAccess(context, input.userId);

  const canModerate = await canModerateMessage(context, input.userId);
  if (!canModerate) {
    throw new Error("forbidden_topic_manage");
  }

  if (input.pinned) {
    await db.query(
      `INSERT INTO room_message_pins (message_id, pinned_by)
       VALUES ($1, $2)
       ON CONFLICT (message_id) DO UPDATE SET pinned_by = EXCLUDED.pinned_by, pinned_at = NOW()`,
      [input.messageId, input.userId]
    );
  } else {
    await db.query(
      `DELETE FROM room_message_pins WHERE message_id = $1`,
      [input.messageId]
    );
  }

  return {
    room: mapRoom(context),
    topic: {
      id: context.topic_id,
      slug: context.topic_slug
    },
    messageId: input.messageId,
    messageAuthorUserId: context.message_user_id,
    pinned: input.pinned
  };
}

export async function setTopicMessageReaction(input: {
  messageId: string;
  userId: string;
  emoji: string;
  active: boolean;
}): Promise<{
  room: RoomRow;
  topic: { id: string; slug: string };
  messageId: string;
  emoji: string;
  userId: string;
  active: boolean;
}> {
  const context = await loadMessageContext(input.messageId);
  await ensureTopicReadAccess(context, input.userId);

  const normalizedEmoji = input.emoji.trim().slice(0, 32);
  if (!normalizedEmoji) {
    throw new Error("validation_error");
  }

  if (input.active) {
    await db.query(
      `INSERT INTO room_message_reactions (message_id, user_id, emoji)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
      [input.messageId, input.userId, normalizedEmoji]
    );
  } else {
    await db.query(
      `DELETE FROM room_message_reactions
       WHERE message_id = $1
         AND user_id = $2
         AND emoji = $3`,
      [input.messageId, input.userId, normalizedEmoji]
    );
  }

  return {
    room: mapRoom(context),
    topic: {
      id: context.topic_id,
      slug: context.topic_slug
    },
    messageId: input.messageId,
    emoji: normalizedEmoji,
    userId: input.userId,
    active: input.active
  };
}

export async function createTopicMessageReport(input: {
  messageId: string;
  userId: string;
  reason: string;
  details?: string;
}): Promise<{
  reportId: string;
  messageId: string;
}> {
  const context = await loadMessageContext(input.messageId);
  await ensureTopicReadAccess(context, input.userId);

  if (context.message_user_id === input.userId) {
    throw new Error("cannot_report_own_message");
  }

  const normalizedReason = input.reason.trim().slice(0, 160);
  const normalizedDetails = typeof input.details === "string"
    ? input.details.trim().slice(0, 2000)
    : "";

  try {
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO room_message_reports (
         message_id,
         topic_id,
         room_id,
         server_id,
         reporter_user_id,
         reason,
         details
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        input.messageId,
        context.topic_id,
        context.room_id,
        context.room_server_id,
        input.userId,
        normalizedReason,
        normalizedDetails || null
      ]
    );

    await db.query(
      `INSERT INTO moderation_audit_log (
         action,
         actor_user_id,
         target_user_id,
         server_id,
         room_id,
         topic_id,
         message_id,
         meta
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        "message_reported",
        input.userId,
        context.message_user_id,
        context.room_server_id,
        context.room_id,
        context.topic_id,
        input.messageId,
        JSON.stringify({
          reason: normalizedReason,
          details: normalizedDetails || null
        })
      ]
    );

    return {
      reportId: normalizeBoundedString(inserted.rows[0]?.id, 128) || "",
      messageId: input.messageId
    };
  } catch (error) {
    const code = normalizeBoundedString((error as { code?: string } | null)?.code, 32) || "";
    if (code === "23505") {
      throw new Error("message_report_exists");
    }

    throw error;
  }
}
