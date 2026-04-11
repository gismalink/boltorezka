/**
 * Error-scenario тесты: проверяют graceful degradation при сбоях DB.
 *
 * 6 кейсов: ошибки connection/timeout/pool + пустые результаты.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  canBypassRoomSendPolicy,
  resolveRoomById,
  resolveRoomBySlugWithAccessCheck,
  resolveRoomRealtimeAudienceUserIds,
} from "./room-access-service.js";
import type { DbQuery } from "./room-access-service.js";

test("error: resolveRoomById — DB throws → error propagates", async () => {
  const dbQuery: DbQuery = async () => { throw new Error("connection refused"); };
  await assert.rejects(
    () => resolveRoomById(dbQuery, "r1"),
    { message: "connection refused" }
  );
});

test("error: resolveRoomBySlugWithAccessCheck — DB throws on room lookup → error propagates", async () => {
  const dbQuery: DbQuery = async () => { throw new Error("timeout"); };
  await assert.rejects(
    () => resolveRoomBySlugWithAccessCheck(dbQuery, "slug", "u1"),
    { message: "timeout" }
  );
});

test("error: resolveRoomBySlugWithAccessCheck — DB throws on hidden check → error propagates", async () => {
  let callCount = 0;
  const dbQuery: DbQuery = async () => {
    callCount++;
    if (callCount === 1) {
      return {
        rowCount: 1,
        rows: [{
          id: "r1", slug: "s", is_public: false, is_hidden: true,
          server_id: null, nsfw: false, is_readonly: false, slowmode_seconds: 0
        }]
      };
    }
    throw new Error("connection reset");
  };

  await assert.rejects(
    () => resolveRoomBySlugWithAccessCheck(dbQuery, "s", "u1"),
    { message: "connection reset" }
  );
});

test("error: canBypassRoomSendPolicy — DB throws → error propagates", async () => {
  const dbQuery: DbQuery = async () => { throw new Error("pool exhausted"); };
  await assert.rejects(
    () => canBypassRoomSendPolicy(dbQuery, "u1", "s1"),
    { message: "pool exhausted" }
  );
});

test("error: resolveRoomRealtimeAudienceUserIds — DB throws → error propagates", async () => {
  const dbQuery: DbQuery = async () => { throw new Error("disk full"); };
  await assert.rejects(
    () => resolveRoomRealtimeAudienceUserIds(dbQuery, "r1"),
    { message: "disk full" }
  );
});

test("error: canBypassRoomSendPolicy — user not found (empty rows) → false", async () => {
  const dbQuery: DbQuery = async () => ({ rowCount: 0, rows: [] });
  const result = await canBypassRoomSendPolicy(dbQuery, "u-ghost", "s1");
  assert.equal(result, false);
});
