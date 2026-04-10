/**
 * Тесты для room-access-service.
 *
 * Проверяют логику разрешения доступа к комнатам:
 * - resolveRoomById: базовый поиск по ID
 * - resolveRoomBySlugWithAccessCheck: полная проверка (hidden/public/private/NSFW)
 * - canBypassRoomSendPolicy: обход send-политик для admin/owner
 * - resolveRoomRealtimeAudienceUserIds: определение аудитории broadcast
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  canBypassRoomSendPolicy,
  resolveRoomById,
  resolveRoomBySlugWithAccessCheck,
  resolveRoomRealtimeAudienceUserIds
} from "./room-access-service.js";
import type { DbQuery } from "./room-access-service.js";

// --- resolveRoomById ---

test("room-access: resolveRoomById returns room when found", async () => {
  const dbQuery: DbQuery = async () => ({
    rowCount: 1,
    rows: [{ id: "r1", slug: "general", server_id: "s1", is_readonly: false, slowmode_seconds: 0 }]
  });

  const result = await resolveRoomById(dbQuery, "r1");
  assert.deepEqual(result, {
    roomId: "r1",
    roomSlug: "general",
    serverId: "s1",
    isReadonly: false,
    slowmodeSeconds: 0
  });
});

test("room-access: resolveRoomById returns null for archived/missing room", async () => {
  const dbQuery: DbQuery = async () => ({ rowCount: 0, rows: [] });
  const result = await resolveRoomById(dbQuery, "r-missing");
  assert.equal(result, null);
});

// --- resolveRoomBySlugWithAccessCheck ---

test("room-access: resolveRoomBySlugWithAccessCheck returns error for missing room", async () => {
  const dbQuery: DbQuery = async () => ({ rowCount: 0, rows: [] });
  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, "nope", "u1");
  assert.ok("error" in result);
  assert.equal(result.error.code, "RoomNotFound");
});

test("room-access: resolveRoomBySlugWithAccessCheck returns room for public room", async () => {
  const dbQuery: DbQuery = async () => ({
    rowCount: 1,
    rows: [{
      id: "r1", slug: "general", is_public: true, is_hidden: false,
      server_id: null, nsfw: false, is_readonly: false, slowmode_seconds: 5
    }]
  });

  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, "general", "u1");
  assert.ok("room" in result);
  assert.equal(result.room.roomSlug, "general");
  assert.equal(result.room.slowmodeSeconds, 5);
});

test("room-access: resolveRoomBySlugWithAccessCheck rejects hidden room without grant", async () => {
  let callCount = 0;
  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      return {
        rowCount: 1,
        rows: [{
          id: "r1", slug: "secret", is_public: false, is_hidden: true,
          server_id: null, nsfw: false, is_readonly: false, slowmode_seconds: 0
        }]
      };
    }
    // Проверка hidden access — нет доступа
    return { rowCount: 1, rows: [{ has_access: false }] };
  };

  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, "secret", "u1");
  assert.ok("error" in result);
  assert.equal(result.error.code, "Forbidden");
});

test("room-access: resolveRoomBySlugWithAccessCheck allows hidden room for active room bypass", async () => {
  let callCount = 0;
  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      // lookup room
      return {
        rowCount: 1,
        rows: [{
          id: "r1", slug: "secret", is_public: false, is_hidden: true,
          server_id: null, nsfw: false, is_readonly: false, slowmode_seconds: 0
        }]
      };
    }
    if (callCount === 2) {
      // hidden access check — нет гранта, но bypass через activeRoom
      return { rowCount: 1, rows: [{ has_access: false }] };
    }
    // private membership check — пользователь является членом комнаты
    return { rowCount: 1, rows: [{ _: 1 }] };
  };

  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, "secret", "u1", {
    activeRoomId: "r1",
    activeRoomSlug: "secret"
  });
  assert.ok("room" in result);
  assert.equal(result.room.roomId, "r1");
});

test("room-access: resolveRoomBySlugWithAccessCheck rejects private room without membership", async () => {
  let callCount = 0;
  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      return {
        rowCount: 1,
        rows: [{
          id: "r1", slug: "private-room", is_public: false, is_hidden: false,
          server_id: null, nsfw: false, is_readonly: true, slowmode_seconds: 0
        }]
      };
    }
    // Нет membership
    return { rowCount: 0, rows: [] };
  };

  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, "private-room", "u1");
  assert.ok("error" in result);
  assert.equal(result.error.code, "Forbidden");
});

// --- canBypassRoomSendPolicy ---

test("room-access: canBypassRoomSendPolicy returns true for global admin", async () => {
  const dbQuery: DbQuery = async () => ({
    rowCount: 1,
    rows: [{ role: "admin" }]
  });

  const result = await canBypassRoomSendPolicy(dbQuery, "u1", "s1");
  assert.equal(result, true);
});

test("room-access: canBypassRoomSendPolicy returns true for super_admin", async () => {
  const dbQuery: DbQuery = async () => ({
    rowCount: 1,
    rows: [{ role: "super_admin" }]
  });

  const result = await canBypassRoomSendPolicy(dbQuery, "u1", null);
  assert.equal(result, true);
});

test("room-access: canBypassRoomSendPolicy returns true for server owner", async () => {
  let callCount = 0;
  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      return { rowCount: 1, rows: [{ role: "member" }] };
    }
    return { rowCount: 1, rows: [{ role: "owner" }] };
  };

  const result = await canBypassRoomSendPolicy(dbQuery, "u1", "s1");
  assert.equal(result, true);
});

test("room-access: canBypassRoomSendPolicy returns false for regular member", async () => {
  let callCount = 0;
  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      return { rowCount: 1, rows: [{ role: "member" }] };
    }
    return { rowCount: 1, rows: [{ role: "member" }] };
  };

  const result = await canBypassRoomSendPolicy(dbQuery, "u1", "s1");
  assert.equal(result, false);
});

test("room-access: canBypassRoomSendPolicy returns false when no server", async () => {
  const dbQuery: DbQuery = async () => ({
    rowCount: 1,
    rows: [{ role: "member" }]
  });

  const result = await canBypassRoomSendPolicy(dbQuery, "u1", null);
  assert.equal(result, false);
});

// --- resolveRoomRealtimeAudienceUserIds ---

test("room-access: resolveRoomRealtimeAudienceUserIds returns empty for archived room", async () => {
  const dbQuery: DbQuery = async () => ({ rowCount: 0, rows: [] });
  const result = await resolveRoomRealtimeAudienceUserIds(dbQuery, "r-missing");
  assert.deepEqual(result, []);
});

test("room-access: resolveRoomRealtimeAudienceUserIds returns hidden room audience", async () => {
  let callCount = 0;
  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      return {
        rowCount: 1,
        rows: [{ id: "r1", server_id: "s1", is_public: false, is_hidden: true }]
      };
    }
    // hidden audience: grants + members
    return {
      rowCount: 2,
      rows: [{ user_id: "u1" }, { user_id: "u2" }]
    };
  };

  const result = await resolveRoomRealtimeAudienceUserIds(dbQuery, "r1");
  assert.deepEqual(result, ["u1", "u2"]);
});

test("room-access: resolveRoomRealtimeAudienceUserIds returns server audience for public room", async () => {
  let callCount = 0;
  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      return {
        rowCount: 1,
        rows: [{ id: "r1", server_id: "s1", is_public: true, is_hidden: false }]
      };
    }
    return {
      rowCount: 3,
      rows: [{ user_id: "u1" }, { user_id: "u2" }, { user_id: "u3" }]
    };
  };

  const result = await resolveRoomRealtimeAudienceUserIds(dbQuery, "r1");
  assert.deepEqual(result, ["u1", "u2", "u3"]);
});

test("room-access: resolveRoomRealtimeAudienceUserIds returns room members for private room", async () => {
  let callCount = 0;
  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      return {
        rowCount: 1,
        rows: [{ id: "r1", server_id: null, is_public: false, is_hidden: false }]
      };
    }
    return { rowCount: 1, rows: [{ user_id: "u1" }] };
  };

  const result = await resolveRoomRealtimeAudienceUserIds(dbQuery, "r1");
  assert.deepEqual(result, ["u1"]);
});
