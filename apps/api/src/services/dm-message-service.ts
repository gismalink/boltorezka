// DM-сервис: CRUD сообщений, пагинация, редактирование, удаление.
import { db } from "../db.js";

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
};

const EDIT_WINDOW_MS = 10 * 60 * 1000;

// ─── send ───────────────────────────────────────────────

export async function sendDmMessage(params: {
  threadId: string;
  senderUserId: string;
  body: string;
  attachmentsJson?: unknown;
}): Promise<DmMessage> {
  const result = await db.query<DmMessage>(
    `INSERT INTO dm_messages (thread_id, sender_user_id, body, attachments_json)
     VALUES ($1, $2, $3, $4)
     RETURNING
       id, thread_id AS "threadId", sender_user_id AS "senderUserId",
       (SELECT name FROM users WHERE id = sender_user_id) AS "senderName",
       body, attachments_json AS "attachmentsJson",
       created_at AS "createdAt", edited_at AS "editedAt", deleted_at AS "deletedAt"`,
    [params.threadId, params.senderUserId, params.body, params.attachmentsJson ? JSON.stringify(params.attachmentsJson) : null]
  );

  // Обновляем updated_at на thread для сортировки
  await db.query(`UPDATE dm_threads SET updated_at = now() WHERE id = $1`, [params.threadId]);

  return result.rows[0];
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
       created_at AS "createdAt", edited_at AS "editedAt", deleted_at AS "deletedAt"`,
    [params.messageId, params.body]
  );

  return result.rows[0];
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
         m.created_at AS "createdAt", m.edited_at AS "editedAt", m.deleted_at AS "deletedAt"
       FROM dm_messages m
       JOIN users u ON u.id = m.sender_user_id
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
         m.created_at AS "createdAt", m.edited_at AS "editedAt", m.deleted_at AS "deletedAt"
       FROM dm_messages m
       JOIN users u ON u.id = m.sender_user_id
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

  return { messages, hasMore };
}
