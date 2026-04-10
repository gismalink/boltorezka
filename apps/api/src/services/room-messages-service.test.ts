/**
 * Тесты для room-messages-service.
 *
 * Проверяют CRUD для legacy (non-topic) сообщений:
 * - insertRoomMessage: создание сообщения
 * - editRoomMessage: редактирование (права, окно)
 * - deleteRoomMessage: удаление (права, окно)
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  insertRoomMessage,
  editRoomMessage,
  deleteRoomMessage
} from "./room-messages-service.js";
import type { DbQuery } from "./room-access-service.js";

// --- insertRoomMessage ---

test("room-messages: insertRoomMessage returns inserted row", async () => {
  const dbQuery: DbQuery = async () => ({
    rowCount: 1,
    rows: [{
      id: "m1",
      room_id: "r1",
      user_id: "u1",
      body: "hello",
      created_at: "2026-04-11T12:00:00Z"
    }]
  });

  const result = await insertRoomMessage(dbQuery, {
    roomId: "r1",
    userId: "u1",
    text: "hello"
  });

  assert.equal(result.id, "m1");
  assert.equal(result.body, "hello");
});

// --- editRoomMessage ---

test("room-messages: editRoomMessage edits own message within window", async () => {
  let callCount = 0;
  const now = new Date().toISOString();

  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      // SELECT existing message — автор u1, только что создано
      return {
        rowCount: 1,
        rows: [{
          id: "m1",
          room_id: "r1",
          user_id: "u1",
          created_at: now
        }]
      };
    }
    // UPDATE
    return {
      rowCount: 1,
      rows: [{
        id: "m1",
        room_id: "r1",
        body: "updated",
        updated_at: now
      }]
    };
  };

  const result = await editRoomMessage(dbQuery, {
    messageId: "m1",
    roomId: "r1",
    userId: "u1",
    text: "updated"
  });

  assert.equal(result.body, "updated");
});

test("room-messages: editRoomMessage throws message_not_found for missing message", async () => {
  const dbQuery: DbQuery = async () => ({ rowCount: 0, rows: [] });

  await assert.rejects(
    () => editRoomMessage(dbQuery, {
      messageId: "m-gone",
      roomId: "r1",
      userId: "u1",
      text: "edit"
    }),
    { message: "message_not_found" }
  );
});

test("room-messages: editRoomMessage throws forbidden_edit for other user", async () => {
  const dbQuery: DbQuery = async () => ({
    rowCount: 1,
    rows: [{
      id: "m1",
      room_id: "r1",
      user_id: "u-author",
      created_at: new Date().toISOString()
    }]
  });

  await assert.rejects(
    () => editRoomMessage(dbQuery, {
      messageId: "m1",
      roomId: "r1",
      userId: "u-attacker",
      text: "hacked"
    }),
    { message: "forbidden_edit" }
  );
});

test("room-messages: editRoomMessage throws edit_window_expired for old message", async () => {
  const oldDate = new Date(Date.now() - 11 * 60 * 1000).toISOString(); // 11 минут назад

  const dbQuery: DbQuery = async () => ({
    rowCount: 1,
    rows: [{
      id: "m1",
      room_id: "r1",
      user_id: "u1",
      created_at: oldDate
    }]
  });

  await assert.rejects(
    () => editRoomMessage(dbQuery, {
      messageId: "m1",
      roomId: "r1",
      userId: "u1",
      text: "too late"
    }),
    { message: "edit_window_expired" }
  );
});

// --- deleteRoomMessage ---

test("room-messages: deleteRoomMessage deletes own message within window", async () => {
  let callCount = 0;
  const now = new Date().toISOString();

  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      return {
        rowCount: 1,
        rows: [{
          id: "m1",
          room_id: "r1",
          user_id: "u1",
          created_at: now
        }]
      };
    }
    // DELETE RETURNING
    return {
      rowCount: 1,
      rows: [{ id: "m1", room_id: "r1" }]
    };
  };

  const result = await deleteRoomMessage(dbQuery, {
    messageId: "m1",
    roomId: "r1",
    userId: "u1"
  });

  assert.equal(result.id, "m1");
});

test("room-messages: deleteRoomMessage throws message_not_found", async () => {
  const dbQuery: DbQuery = async () => ({ rowCount: 0, rows: [] });

  await assert.rejects(
    () => deleteRoomMessage(dbQuery, {
      messageId: "m-gone",
      roomId: "r1",
      userId: "u1"
    }),
    { message: "message_not_found" }
  );
});

test("room-messages: deleteRoomMessage throws forbidden_delete for other user", async () => {
  const dbQuery: DbQuery = async () => ({
    rowCount: 1,
    rows: [{
      id: "m1",
      room_id: "r1",
      user_id: "u-author",
      created_at: new Date().toISOString()
    }]
  });

  await assert.rejects(
    () => deleteRoomMessage(dbQuery, {
      messageId: "m1",
      roomId: "r1",
      userId: "u-attacker"
    }),
    { message: "forbidden_delete" }
  );
});

test("room-messages: deleteRoomMessage throws delete_window_expired for old message", async () => {
  const oldDate = new Date(Date.now() - 11 * 60 * 1000).toISOString();

  const dbQuery: DbQuery = async () => ({
    rowCount: 1,
    rows: [{
      id: "m1",
      room_id: "r1",
      user_id: "u1",
      created_at: oldDate
    }]
  });

  await assert.rejects(
    () => deleteRoomMessage(dbQuery, {
      messageId: "m1",
      roomId: "r1",
      userId: "u1"
    }),
    { message: "delete_window_expired" }
  );
});
