import test from "node:test";
import assert from "node:assert/strict";
import { handleChatDelete, handleChatEdit, handleChatSend } from "./realtime-chat.js";

test("realtime-chat: send rejects when user has no active room", async () => {
  let noRoomNackCalls = 0;

  await handleChatSend({
    connection: {} as any,
    state: { userId: "u1", userName: "Alice", roomId: null, roomSlug: null },
    payload: { text: "hello" },
    requestId: "req-1",
    eventType: "chat.send",
    normalizeRequestId: (value) => (typeof value === "string" ? value : null),
    getPayloadString: (payload: any, key: string) => {
      const value = payload?.[key];
      return typeof value === "string" ? value : null;
    },
    sendNoActiveRoomNack: () => {
      noRoomNackCalls += 1;
    },
    sendValidationNack: () => {},
    sendForbiddenNack: () => {},
    sendNack: () => {},
    incrementMetric: async () => {},
    sendJson: () => {},
    sendAckWithMetrics: () => {},
    broadcastRoom: () => {},
    buildChatMessageEnvelope: (payload: unknown) => payload,
    buildChatEditedEnvelope: () => ({}),
    buildChatDeletedEnvelope: () => ({}),
    redisGet: async () => null,
    redisDel: async () => 0,
    redisSetEx: async () => "OK",
    dbQuery: async () => ({ rowCount: 0, rows: [] })
  });

  assert.equal(noRoomNackCalls, 1);
});

test("realtime-chat: duplicate idempotency key returns cached payload and duplicate ack", async () => {
  const sentPayloads: unknown[] = [];
  let ackMeta: Record<string, unknown> | null = null;
  let ackMetrics: string[] = [];

  await handleChatSend({
    connection: {} as any,
    state: { userId: "u1", userName: "Alice", roomId: "room-1", roomSlug: "general" },
    payload: { text: "hello" },
    requestId: "req-2",
    eventType: "chat.send",
    normalizeRequestId: (value) => (typeof value === "string" ? value : null),
    getPayloadString: (payload: any, key: string) => {
      const value = payload?.[key];
      return typeof value === "string" ? value : null;
    },
    sendNoActiveRoomNack: () => {},
    sendValidationNack: () => {},
    sendForbiddenNack: () => {},
    sendNack: () => {},
    incrementMetric: async () => {},
    sendJson: (_socket, payload) => {
      sentPayloads.push(payload);
    },
    sendAckWithMetrics: (_socket, _requestId, _eventType, meta, additionalMetrics) => {
      ackMeta = meta || null;
      ackMetrics = additionalMetrics || [];
    },
    broadcastRoom: () => {
      throw new Error("broadcastRoom should not be called on duplicate idempotency key");
    },
    buildChatMessageEnvelope: (payload: unknown) => payload,
    buildChatEditedEnvelope: () => ({}),
    buildChatDeletedEnvelope: () => ({}),
    redisGet: async () =>
      JSON.stringify({
        id: "m1",
        roomId: "room-1",
        roomSlug: "general",
        userId: "u1",
        userName: "Alice",
        text: "hello",
        createdAt: "2026-03-11T00:00:00.000Z"
      }),
    redisDel: async () => 0,
    redisSetEx: async () => "OK",
    dbQuery: async () => {
      throw new Error("dbQuery should not be called on duplicate idempotency key");
    },
    incomingIdempotencyKey: "idem-1"
  });

  const resolvedMeta = ackMeta as { duplicate?: boolean; idempotencyKey?: string } | null;

  assert.equal(sentPayloads.length, 1);
  assert.equal(resolvedMeta?.duplicate, true);
  assert.equal(resolvedMeta?.idempotencyKey, "idem-1");
  assert.deepEqual(ackMetrics, ["chat_idempotency_hit"]);
});

test("realtime-chat: chat.edit rejects editing message from another user", async () => {
  let forbiddenMessage: string | null = null;
  let queryCalls = 0;

  await handleChatEdit({
    connection: {} as any,
    state: { userId: "u1", userName: "Alice", roomId: "room-1", roomSlug: "general" },
    payload: { messageId: "m-1", text: "updated" },
    requestId: "req-edit-1",
    eventType: "chat.edit",
    normalizeRequestId: (value) => (typeof value === "string" ? value : null),
    getPayloadString: (payload: any, key: string) => {
      const value = payload?.[key];
      return typeof value === "string" ? value : null;
    },
    sendNoActiveRoomNack: () => {},
    sendValidationNack: () => {},
    sendForbiddenNack: (_socket, _requestId, _eventType, message) => {
      forbiddenMessage = message || null;
    },
    sendNack: () => {},
    incrementMetric: async () => {},
    sendJson: () => {},
    sendAckWithMetrics: () => {
      throw new Error("sendAckWithMetrics should not be called for forbidden edit");
    },
    broadcastRoom: () => {
      throw new Error("broadcastRoom should not be called for forbidden edit");
    },
    buildChatMessageEnvelope: () => ({}),
    buildChatEditedEnvelope: () => ({}),
    buildChatDeletedEnvelope: () => ({}),
    redisGet: async () => null,
    redisDel: async () => 0,
    redisSetEx: async () => "OK",
    dbQuery: async <T = unknown>() => {
      queryCalls += 1;
      return {
        rowCount: 1,
        rows: [
          {
            id: "m-1",
            room_id: "room-1",
            user_id: "u2",
            created_at: new Date().toISOString()
          }
        ] as unknown as T[]
      };
    }
  });

  assert.equal(queryCalls, 1);
  assert.equal(forbiddenMessage, "You can edit only your own messages");
});

test("realtime-chat: chat.delete rejects expired delete window and increments nack metric", async () => {
  let nackCode: string | null = null;
  let nackMetricCalls = 0;

  await handleChatDelete({
    connection: {} as any,
    state: { userId: "u1", userName: "Alice", roomId: "room-1", roomSlug: "general" },
    payload: { messageId: "m-2" },
    requestId: "req-del-1",
    eventType: "chat.delete",
    normalizeRequestId: (value) => (typeof value === "string" ? value : null),
    getPayloadString: (payload: any, key: string) => {
      const value = payload?.[key];
      return typeof value === "string" ? value : null;
    },
    sendNoActiveRoomNack: () => {},
    sendValidationNack: () => {},
    sendForbiddenNack: () => {},
    sendNack: (_socket, _requestId, _eventType, code) => {
      nackCode = code;
    },
    incrementMetric: async (name) => {
      if (name === "nack_sent") {
        nackMetricCalls += 1;
      }
    },
    sendJson: () => {},
    sendAckWithMetrics: () => {
      throw new Error("sendAckWithMetrics should not be called for expired delete window");
    },
    broadcastRoom: () => {
      throw new Error("broadcastRoom should not be called for expired delete window");
    },
    buildChatMessageEnvelope: () => ({}),
    buildChatEditedEnvelope: () => ({}),
    buildChatDeletedEnvelope: () => ({}),
    redisGet: async () => null,
    redisDel: async () => 0,
    redisSetEx: async () => "OK",
    dbQuery: async <T = unknown>() => ({
      rowCount: 1,
      rows: [
        {
          id: "m-2",
          room_id: "room-1",
          user_id: "u1",
          created_at: "2020-01-01T00:00:00.000Z"
        }
      ] as unknown as T[]
    })
  });

  assert.equal(nackCode, "DeleteWindowExpired");
  assert.equal(nackMetricCalls, 1);
});
