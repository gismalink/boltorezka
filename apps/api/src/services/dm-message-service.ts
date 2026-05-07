// DM-сервис: CRUD сообщений, пагинация, редактирование, удаление.
import { db } from "../db.js";
import { enrichDmAttachmentsJson } from "../chat-attachment-metadata.js";

// ─── types ──────────────────────────────────────────────

export type DmMessage = {
  id: string;
  threadId: string;
  senderUserId: string;
  senderName: string;
  body: string;
  attachmentsJson: unknown | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyToMessageId: string | null;
  replyToUserId: string | null;
  replyToUserName: string | null;
  replyToText: string | null;
};

const EDIT_WINDOW_MS = 10 * 60 * 1000;

function withDerivedAttachmentMetadata(message: DmMessage): DmMessage {
  return {
    ...message,
    attachmentsJson: enrichDmAttachmentsJson(message.attachmentsJson)
  };
}

// ─── send ───────────────────────────────────────────────

export async function sendDmMessage(params: {
  threadId: string;
  senderUserId: string;
  body: string;
  attachmentsJson?: unknown;
  replyToMessageId?: string;
}): Promise<DmMessage> {
  const result = await db.query<DmMessage>(
    `INSERT INTO dm_messages (thread_id, sender_user_id, body, attachments_json, reply_to_message_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING
       id, thread_id AS "threadId", sender_user_id AS "senderUserId",
       (SELECT name FROM users WHERE id = sender_user_id) AS "senderName",
       body, attachments_json AS "attachmentsJson",
       created_at AS "createdAt", edited_at AS "editedAt", deleted_at AS "deletedAt",
       reply_to_message_id AS "replyToMessageId",
       (SELECT sender_user_id FROM dm_messages WHERE id = reply_to_message_id) AS "replyToUserId",
       (SELECT u.name FROM dm_messages pm JOIN users u ON u.id = pm.sender_user_id WHERE pm.id = reply_to_message_id) AS "replyToUserName",
       (SELECT body FROM dm_messages WHERE id = reply_to_message_id) AS "replyToText"`,
    [params.threadId, params.senderUserId, params.body, params.attachmentsJson ? JSON.stringify(params.attachmentsJson) : null, params.replyToMessageId || null]
  );

  // Обновляем updated_at на thread для сортировки
  await db.query(`UPDATE dm_threads SET updated_at = now() WHERE id = $1`, [params.threadId]);

  return withDerivedAttachmentMetadata(result.rows[0]);
}

// ─── edit ───────────────────────────────────────────────

export async function editDmMessage(params: {
  messageId: string;
  senderUserId: string;
  body: string;
}): Promise<DmMessage> {
  const existing = await db.query<{ id: string; sender_user_id: string; created_at: string }>(
    `SELECT id, sender_user_id, created_at FROM dm_messages WHERE id = $1 AND deleted_at IS NULL`,
    [params.messageId]
  );

  if ((existing.rowCount || 0) === 0) {
    throw new Error("dm_message_not_found");
  }

  const row = existing.rows[0];
  if (row.sender_user_id !== params.senderUserId) {
    throw new Error("dm_forbidden_edit");
  }

  const createdAtTs = Number(new Date(row.created_at));
  if (Number.isFinite(createdAtTs) && Date.now() - createdAtTs > EDIT_WINDOW_MS) {
    throw new Error("dm_edit_window_expired");
  }

  const result = await db.query<DmMessage>(
    `UPDATE dm_messages
     SET body = $2, edited_at = now()
     WHERE id = $1
     RETURNING
       id, thread_id AS "threadId", sender_user_id AS "senderUserId",
       (SELECT name FROM users WHERE id = sender_user_id) AS "senderName",
       body, attachments_json AS "attachmentsJson",
       created_at AS "createdAt", edited_at AS "editedAt", deleted_at AS "deletedAt",
       reply_to_message_id AS "replyToMessageId",
       (SELECT sender_user_id FROM dm_messages WHERE id = reply_to_message_id) AS "replyToUserId",
       (SELECT u.name FROM dm_messages pm JOIN users u ON u.id = pm.sender_user_id WHERE pm.id = reply_to_message_id) AS "replyToUserName",
       (SELECT body FROM dm_messages WHERE id = reply_to_message_id) AS "replyToText"`,
    [params.messageId, params.body]
  );

  return withDerivedAttachmentMetadata(result.rows[0]);
}

// ─── delete ─────────────────────────────────────────────

export async function deleteDmMessage(params: {
  messageId: string;
  senderUserId: string;
}): Promise<{ id: string; threadId: string }> {
  const existing = await db.query<{ id: string; thread_id: string; sender_user_id: string; created_at: string }>(
    `SELECT id, thread_id, sender_user_id, created_at FROM dm_messages WHERE id = $1 AND deleted_at IS NULL`,
    [params.messageId]
  );

  if ((existing.rowCount || 0) === 0) {
    throw new Error("dm_message_not_found");
  }

  const row = existing.rows[0];
  if (row.sender_user_id !== params.senderUserId) {
    throw new Error("dm_forbidden_delete");
  }

  const createdAtTs = Number(new Date(row.created_at));
  if (Number.isFinite(createdAtTs) && Date.now() - createdAtTs > EDIT_WINDOW_MS) {
    throw new Error("dm_edit_window_expired");
  }

  await db.query(`UPDATE dm_messages SET deleted_at = now() WHERE id = $1`, [params.messageId]);

  return { id: row.id, threadId: row.thread_id };
}

// ─── history (cursor pagination) ────────────────────────

export async function getDmMessages(params: {
  threadId: string;
  cursor?: string;
  limit?: number;
}): Promise<{ messages: DmMessage[]; hasMore: boolean }> {
  const limit = Math.min(params.limit || 50, 100);

  let messages: DmMessage[];

  if (params.cursor) {
    const result = await db.query<DmMessage>(
      `SELECT
         m.id, m.thread_id AS "threadId", m.sender_user_id AS "senderUserId",
         u.name AS "senderName",
         m.body, m.attachments_json AS "attachmentsJson",
         m.created_at AS "createdAt", m.edited_at AS "editedAt", m.deleted_at AS "deletedAt",
         m.reply_to_message_id AS "replyToMessageId",
         pm.sender_user_id AS "replyToUserId",
         pu.name AS "replyToUserName",
         pm.body AS "replyToText"
       FROM dm_messages m
       JOIN users u ON u.id = m.sender_user_id
       LEFT JOIN dm_messages pm ON pm.id = m.reply_to_message_id
       LEFT JOIN users pu ON pu.id = pm.sender_user_id
       WHERE m.thread_id = $1
         AND m.deleted_at IS NULL
         AND m.created_at < (SELECT created_at FROM dm_messages WHERE id = $2)
       ORDER BY m.created_at DESC
       LIMIT $3`,
      [params.threadId, params.cursor, limit + 1]
    );
    messages = result.rows;
  } else {
    const result = await db.query<DmMessage>(
      `SELECT
         m.id, m.thread_id AS "threadId", m.sender_user_id AS "senderUserId",
         u.name AS "senderName",
         m.body, m.attachments_json AS "attachmentsJson",
         m.created_at AS "createdAt", m.edited_at AS "editedAt", m.deleted_at AS "deletedAt",
         m.reply_to_message_id AS "replyToMessageId",
         pm.sender_user_id AS "replyToUserId",
         pu.name AS "replyToUserName",
         pm.body AS "replyToText"
       FROM dm_messages m
       JOIN users u ON u.id = m.sender_user_id
       LEFT JOIN dm_messages pm ON pm.id = m.reply_to_message_id
       LEFT JOIN users pu ON pu.id = pm.sender_user_id
       WHERE m.thread_id = $1 AND m.deleted_at IS NULL
       ORDER BY m.created_at DESC
       LIMIT $2`,
      [params.threadId, limit + 1]
    );
    messages = result.rows;
  }

  const hasMore = messages.length > limit;
  if (hasMore) {
    messages = messages.slice(0, limit);
  }

  return { messages: messages.map((message) => withDerivedAttachmentMetadata(message)), hasMore };
}

// ─── reactions ──────────────────────────────────────────

export type DmReactionRow = {
  messageId: string;
  emoji: string;
  userId: string;
};

export async function toggleDmReaction(params: {
  messageId: string;
  userId: string;
  emoji: string;
  active: boolean;
}): Promise<{ threadId: string }> {
  const normalizedEmoji = params.emoji.trim().slice(0, 32);
  if (!normalizedEmoji) throw new Error("validation_error");

  // Verify message exists and get threadId
  const msgResult = await db.query<{ thread_id: string }>(
    `SELECT thread_id FROM dm_messages WHERE id = $1 AND deleted_at IS NULL`,
    [params.messageId]
  );
  if ((msgResult.rowCount || 0) === 0) throw new Error("dm_message_not_found");

  if (params.active) {
    await db.query(
      `INSERT INTO dm_message_reactions (message_id, user_id, emoji)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
      [params.messageId, params.userId, normalizedEmoji]
    );
  } else {
    await db.query(
      `DELETE FROM dm_message_reactions
       WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [params.messageId, params.userId, normalizedEmoji]
    );
  }

  return { threadId: msgResult.rows[0].thread_id };
}

export async function getDmReactionsForThread(threadId: string): Promise<DmReactionRow[]> {
  const result = await db.query<DmReactionRow>(
    `SELECT r.message_id AS "messageId", r.emoji, r.user_id AS "userId"
     FROM dm_message_reactions r
     JOIN dm_messages m ON m.id = r.message_id
     WHERE m.thread_id = $1 AND m.deleted_at IS NULL
     ORDER BY r.created_at ASC`,
    [threadId]
  );
  return result.rows;
}
