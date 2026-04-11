/**
 * Permission-matrix тесты для resolveRoomBySlugWithAccessCheck.
 *
 * 14 комбинаций: visibility (public/hidden/private) × membership × grant × activeRoom bypass.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveRoomBySlugWithAccessCheck,
} from "./room-access-service.js";
import type { DbQuery } from "./room-access-service.js";

// --- Фабрика: стандартный room row ---

function roomRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    slug: "test-room",
    is_public: true,
    is_hidden: false,
    server_id: "s1",
    nsfw: false,
    is_readonly: false,
    slowmode_seconds: 0,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════
// 1. PUBLIC ROOMS
// ═══════════════════════════════════════════════════════

test("perm-matrix: public room — allowed, all fields correct", async () => {
  const dbQuery: DbQuery = async () => ({
    rowCount: 1,
    rows: [roomRow()],
  });

  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, "test-room", "u1");
  assert.ok("room" in result);
  assert.deepEqual(result.room, {
    roomId: "r1",
    roomSlug: "test-room",
    serverId: "s1",
    isReadonly: false,
    slowmodeSeconds: 0,
  });
});

test("perm-matrix: public room — readonly and slowmode flags propagate", async () => {
  const dbQuery: DbQuery = async () => ({
    rowCount: 1,
    rows: [roomRow({ is_readonly: true, slowmode_seconds: 30 })],
  });

  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, "test-room", "u1");
  assert.ok("room" in result);
  assert.equal(result.room.isReadonly, true);
  assert.equal(result.room.slowmodeSeconds, 30);
});

test("perm-matrix: public room without server — allowed", async () => {
  const dbQuery: DbQuery = async () => ({
    rowCount: 1,
    rows: [roomRow({ server_id: null })],
  });

  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, "test-room", "u1");
  assert.ok("room" in result);
  assert.equal(result.room.serverId, null);
});

// ═══════════════════════════════════════════════════════
// 2. HIDDEN ROOMS (is_hidden=true, is_public=false)
// ═══════════════════════════════════════════════════════

test("perm-matrix: hidden room — grant only (no membership) → forbidden", async () => {
  // Grant делает комнату видимой, но для входа нужна membership
  let callCount = 0;
  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      return { rowCount: 1, rows: [roomRow({ is_public: false, is_hidden: true })] };
    }
    if (callCount === 2) {
      // hidden access check: has grant → true
      return { rowCount: 1, rows: [{ has_access: true }] };
    }
    // private membership check: no membership
    return { rowCount: 0, rows: [] };
  };

  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, "test-room", "u1");
  assert.ok("error" in result);
  assert.equal(result.error.code, "Forbidden");
});

test("perm-matrix: hidden room — membership (no grant) → allowed", async () => {
  let callCount = 0;
  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      return { rowCount: 1, rows: [roomRow({ is_public: false, is_hidden: true })] };
    }
    if (callCount === 2) {
      // hidden access: membership → true
      return { rowCount: 1, rows: [{ has_access: true }] };
    }
    // private membership: yes
    return { rowCount: 1, rows: [{ _: 1 }] };
  };

  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, "test-room", "u1");
  assert.ok("room" in result);
  assert.equal(result.room.roomId, "r1");
});

test("perm-matrix: hidden room — grant + membership → allowed", async () => {
  let callCount = 0;
  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      return { rowCount: 1, rows: [roomRow({ is_public: false, is_hidden: true })] };
    }
    if (callCount === 2) {
      return { rowCount: 1, rows: [{ has_access: true }] };
    }
    return { rowCount: 1, rows: [{ _: 1 }] };
  };

  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, "test-room", "u1");
  assert.ok("room" in result);
});

test("perm-matrix: hidden room — no grant, no membership → forbidden", async () => {
  let callCount = 0;
  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      return { rowCount: 1, rows: [roomRow({ is_public: false, is_hidden: true })] };
    }
    // hidden access: no
    return { rowCount: 1, rows: [{ has_access: false }] };
  };

  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, "test-room", "u1");
  assert.ok("error" in result);
  assert.equal(result.error.code, "Forbidden");
});

test("perm-matrix: hidden room — active bypass + membership → allowed", async () => {
  let callCount = 0;
  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      return { rowCount: 1, rows: [roomRow({ is_public: false, is_hidden: true })] };
    }
    if (callCount === 2) {
      // hidden access: false (but bypass via activeRoom)
      return { rowCount: 1, rows: [{ has_access: false }] };
    }
    // private membership: yes
    return { rowCount: 1, rows: [{ _: 1 }] };
  };

  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, "test-room", "u1", {
    activeRoomId: "r1",
    activeRoomSlug: "test-room",
  });
  assert.ok("room" in result);
});

test("perm-matrix: hidden room — active bypass, no membership → forbidden", async () => {
  let callCount = 0;
  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      return { rowCount: 1, rows: [roomRow({ is_public: false, is_hidden: true })] };
    }
    if (callCount === 2) {
      return { rowCount: 1, rows: [{ has_access: false }] };
    }
    // private membership: no
    return { rowCount: 0, rows: [] };
  };

  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, "test-room", "u1", {
    activeRoomId: "r1",
    activeRoomSlug: "test-room",
  });
  assert.ok("error" in result);
  assert.equal(result.error.code, "Forbidden");
});

test("perm-matrix: hidden room — active bypass wrong slug → forbidden", async () => {
  let callCount = 0;
  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      return { rowCount: 1, rows: [roomRow({ is_public: false, is_hidden: true })] };
    }
    return { rowCount: 1, rows: [{ has_access: false }] };
  };

  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, "test-room", "u1", {
    activeRoomId: "r1",
    activeRoomSlug: "wrong-slug",
  });
  assert.ok("error" in result);
  assert.equal(result.error.code, "Forbidden");
});

test("perm-matrix: hidden room — active bypass wrong id → forbidden", async () => {
  let callCount = 0;
  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      return { rowCount: 1, rows: [roomRow({ is_public: false, is_hidden: true })] };
    }
    return { rowCount: 1, rows: [{ has_access: false }] };
  };

  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, "test-room", "u1", {
    activeRoomId: "wrong-id",
    activeRoomSlug: "test-room",
  });
  assert.ok("error" in result);
  assert.equal(result.error.code, "Forbidden");
});

// ═══════════════════════════════════════════════════════
// 3. PRIVATE ROOMS (is_public=false, is_hidden=false)
// ═══════════════════════════════════════════════════════

test("perm-matrix: private room — member → allowed", async () => {
  let callCount = 0;
  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      return { rowCount: 1, rows: [roomRow({ is_public: false })] };
    }
    return { rowCount: 1, rows: [{ _: 1 }] };
  };

  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, "test-room", "u1");
  assert.ok("room" in result);
});

test("perm-matrix: private room — non-member → forbidden", async () => {
  let callCount = 0;
  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      return { rowCount: 1, rows: [roomRow({ is_public: false })] };
    }
    return { rowCount: 0, rows: [] };
  };

  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, "test-room", "u1");
  assert.ok("error" in result);
  assert.equal(result.error.code, "Forbidden");
});

// ═══════════════════════════════════════════════════════
// 4. ROOM NOT FOUND
// ═══════════════════════════════════════════════════════

test("perm-matrix: room not found → RoomNotFound", async () => {
  const dbQuery: DbQuery = async () => ({ rowCount: 0, rows: [] });
  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, "ghost", "u1");
  assert.ok("error" in result);
  assert.equal(result.error.code, "RoomNotFound");
});
