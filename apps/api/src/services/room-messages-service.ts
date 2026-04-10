/**
 * CRUD-сервис для legacy (non-topic) сообщений комнаты.
 *
 * Извлечён из inline-запросов handleChatSend/Edit/Delete в realtime-chat.ts.
 * Бросает доменные ошибки (message_not_found, forbidden_edit, edit_window_expired и т.д.),
 * которые отлавливаются через mapChatDomainErrorToWsNack в вызывающем коде.
 *
 * Правила:
 * - Окно редактирования/удаления: 10 минут (EDIT_WINDOW_MS).
 * - Только автор может редактировать/удалять свои сообщения.
 * - Insert не проверяет права — ожидается, что проверка доступа к комнате
 *   уже выполнена через room-access-service.
 */
import type { DbQuery } from "./room-access-service.js";

export type InsertedRoomMessage = {
  id: string;
  room_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

export type EditedRoomMessage = {
  id: string;
  room_id: string;
  body: string;
  updated_at: string;
};

export type DeletedRoomMessage = {
  id: string;
  room_id: string;
};

const EDIT_WINDOW_MS = 10 * 60 * 1000;

export async function insertRoomMessage(
  dbQuery: DbQuery,
  params: { roomId: string; userId: string; text: string }
): Promise<InsertedRoomMessage> {
  const inserted = await dbQuery<InsertedRoomMessage>(
    `INSERT INTO messages (room_id, user_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, room_id, user_id, body, created_at`,
    [params.roomId, params.userId, params.text]
  );

  return inserted.rows[0];
}

export async function editRoomMessage(
  dbQuery: DbQuery,
  params: { messageId: string; roomId: string; userId: string; text: string }
): Promise<EditedRoomMessage> {
  const existing = await dbQuery<{
    id: string;
    room_id: string;
    user_id: string;
    created_at: string;
  }>(
    `SELECT id, room_id, user_id, created_at
     FROM messages
     WHERE id = $1 AND room_id = $2
     LIMIT 1`,
    [params.messageId, params.roomId]
  );

  if ((existing.rowCount || 0) === 0) {
    throw new Error("message_not_found");
  }

  const messageRow = existing.rows[0];
  if (messageRow.user_id !== params.userId) {
    throw new Error("forbidden_edit");
  }

  const createdAtTs = Number(new Date(messageRow.created_at));
  const withinWindow = Number.isFinite(createdAtTs) && Date.now() - createdAtTs <= EDIT_WINDOW_MS;
  if (!withinWindow) {
    throw new Error("edit_window_expired");
  }

  const updated = await dbQuery<EditedRoomMessage>(
    `UPDATE messages
     SET body = $1, updated_at = NOW()
     WHERE id = $2 AND room_id = $3
     RETURNING id, room_id, body, updated_at`,
    [params.text, params.messageId, params.roomId]
  );

  if ((updated.rowCount || 0) === 0) {
    throw new Error("message_not_found");
  }

  return updated.rows[0];
}

export async function deleteRoomMessage(
  dbQuery: DbQuery,
  params: { messageId: string; roomId: string; userId: string }
): Promise<DeletedRoomMessage> {
  const existing = await dbQuery<{
    id: string;
    room_id: string;
    user_id: string;
    created_at: string;
  }>(
    `SELECT id, room_id, user_id, created_at
     FROM messages
     WHERE id = $1 AND room_id = $2
     LIMIT 1`,
    [params.messageId, params.roomId]
  );

  if ((existing.rowCount || 0) === 0) {
    throw new Error("message_not_found");
  }

  const messageRow = existing.rows[0];
  if (messageRow.user_id !== params.userId) {
    throw new Error("forbidden_delete");
  }

  const createdAtTs = Number(new Date(messageRow.created_at));
  const withinWindow = Number.isFinite(createdAtTs) && Date.now() - createdAtTs <= EDIT_WINDOW_MS;
  if (!withinWindow) {
    throw new Error("delete_window_expired");
  }

  const deleted = await dbQuery<DeletedRoomMessage>(
    `DELETE FROM messages
     WHERE id = $1 AND room_id = $2
     RETURNING id, room_id`,
    [params.messageId, params.roomId]
  );

  if ((deleted.rowCount || 0) === 0) {
    throw new Error("message_not_found");
  }

  return deleted.rows[0];
}
