import test from "node:test";
import assert from "node:assert/strict";
import {
  handleChatDelete,
  handleChatEdit,
  handleChatPin,
  handleChatReactionAdd,
  handleChatReactionRemove,
  handleChatReport,
  handleChatSend,
  handleChatUnpin,
  setNotificationInboxOpsLoaderForTests,
  setTopicMessageOpsLoaderForTests
} from "./realtime-chat.js";

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
  let queryCalls = 0;

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
    dbQuery: async <T = unknown>() => {
      queryCalls += 1;
      if (queryCalls === 1) {
        return {
          rowCount: 1,
          rows: [
            {
              id: "room-1",
              slug: "general",
              is_public: true,
              is_hidden: false,
              server_id: null,
              nsfw: false,
              is_readonly: false,
              slowmode_seconds: 0
            }
          ] as unknown as T[]
        };
      }

      throw new Error("dbQuery should not be called after room resolve on duplicate idempotency key");
    },
    incomingIdempotencyKey: "idem-1"
  });

  const resolvedMeta = ackMeta as { duplicate?: boolean; idempotencyKey?: string } | null;

  assert.equal(sentPayloads.length, 1);
  assert.equal(queryCalls, 1);
  assert.equal(resolvedMeta?.duplicate, true);
  assert.equal(resolvedMeta?.idempotencyKey, "idem-1");
  assert.deepEqual(ackMetrics, ["chat_idempotency_hit"]);
});

test("realtime-chat: topic reply send uses topic service and broadcasts topic payload", async () => {
  const broadcasts: Array<{ roomId: string; envelope: any }> = [];
  let ackMeta: Record<string, unknown> | null = null;
  const mentionCalls: Array<Record<string, unknown>> = [];
  const replyCalls: Array<Record<string, unknown>> = [];

  setTopicMessageOpsLoaderForTests(async () => ({
    createTopicMessage: async () => {
      throw new Error("not_used");
    },
    replyTopicMessage: async () => ({
      room: { id: "room-1", slug: "general" },
      topic: { id: "topic-1", slug: "main" },
      parentMessageId: "parent-1",
      message: {
        id: "m-reply-1",
        room_id: "room-1",
        topic_id: "topic-1",
        reply_to_message_id: "parent-1",
        reply_to_user_id: "u2",
        reply_to_user_name: "Bob",
        reply_to_text: "hello",
        user_id: "u1",
        user_name: "Alice",
        text: "reply text",
        created_at: "2026-04-07T00:00:00.000Z"
      }
    }),
    setTopicMessagePinned: async () => {
      throw new Error("not_used");
    },
    setTopicMessageReaction: async () => {
      throw new Error("not_used");
    },
    createTopicMessageReport: async () => {
      throw new Error("not_used");
    },
    markTopicRead: async () => {
      throw new Error("not_used");
    }
  }));
  setNotificationInboxOpsLoaderForTests(async () => ({
    emitMentionInboxEvents: async (input) => {
      mentionCalls.push(input as unknown as Record<string, unknown>);
    },
    emitReplyInboxEvent: async (input) => {
      replyCalls.push(input as unknown as Record<string, unknown>);
    }
  }));

  try {
    await handleChatSend({
      connection: {} as any,
      state: { userId: "u1", userName: "Alice", roomId: "room-1", roomSlug: "general" },
      payload: {
        text: "reply text",
        topicId: "topic-1",
        replyToMessageId: "parent-1",
        mentionUserIds: ["u3"],
        roomSlug: "general"
      },
      requestId: "req-topic-1",
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
      sendJson: () => {},
      sendAckWithMetrics: (_socket, _requestId, _eventType, meta) => {
        ackMeta = meta || null;
      },
      broadcastRoom: (roomId, envelope) => {
        broadcasts.push({ roomId, envelope });
      },
      buildChatMessageEnvelope: (payload: unknown) => ({ type: "chat.message", payload }),
      buildChatEditedEnvelope: () => ({}),
      buildChatDeletedEnvelope: () => ({}),
      redisGet: async () => null,
      redisDel: async () => 0,
      redisSetEx: async () => "OK",
      dbQuery: async <T = unknown>() => ({
        rowCount: 1,
        rows: [
          {
            id: "room-1",
            slug: "general",
            is_public: true,
            is_hidden: false,
            server_id: null,
            nsfw: false,
            is_readonly: false,
            slowmode_seconds: 0
          }
        ] as unknown as T[]
      })
    });
  } finally {
    setNotificationInboxOpsLoaderForTests(null);
    setTopicMessageOpsLoaderForTests(null);
  }

  assert.equal(broadcasts.length, 1);
  assert.equal(broadcasts[0]?.envelope?.payload?.topicId, "topic-1");
  assert.equal(broadcasts[0]?.envelope?.payload?.replyToMessageId, "parent-1");
  assert.deepEqual(ackMeta, {
    messageId: "m-reply-1",
    idempotencyKey: "req-topic-1",
    topicId: "topic-1",
    replyToMessageId: "parent-1"
  });
  assert.equal(replyCalls.length, 1);
  assert.equal(replyCalls[0]?.targetUserId, "u2");
  assert.equal(mentionCalls.length, 1);
  assert.deepEqual(mentionCalls[0]?.mentionUserIds, ["u3"]);
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
      if (queryCalls === 1) {
        return {
          rowCount: 1,
          rows: [
            {
              id: "room-1",
              slug: "general",
              is_public: true,
              is_hidden: false,
              server_id: null,
              nsfw: false,
              is_readonly: false,
              slowmode_seconds: 0
            }
          ] as unknown as T[]
        };
      }

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

  assert.equal(queryCalls, 2);
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

function createTopicMutationParams(overrides: Record<string, unknown> = {}) {
  return {
    connection: {} as any,
    state: { userId: "u1", userName: "Alice", roomId: "room-1", roomSlug: "general" },
    payload: { messageId: "m-1", emoji: "👍" },
    requestId: "req-1",
    eventType: "chat.pin",
    normalizeRequestId: (value: unknown) => (typeof value === "string" ? value : null),
    getPayloadString: (payload: any, key: string) => {
      const value = payload?.[key];
      return typeof value === "string" ? value : null;
    },
    sendNoActiveRoomNack: () => {},
    sendValidationNack: () => {},
    sendForbiddenNack: () => {},
    sendNack: () => {},
    incrementMetric: async () => {},
    sendJson: () => {},
    sendAckWithMetrics: () => {},
    broadcastRoom: () => {},
    buildChatMessageEnvelope: () => ({}),
    buildChatEditedEnvelope: () => ({}),
    buildChatDeletedEnvelope: () => ({}),
    buildChatTypingEnvelope: () => ({}),
    redisGet: async () => null,
    redisDel: async () => 0,
    redisSetEx: async () => "OK",
    dbQuery: async () => ({ rowCount: 0, rows: [] }),
    ...overrides
  };
}

test("realtime-chat: chat.pin broadcasts and acks on success", async () => {
  const broadcasts: Array<{ roomId: string; envelope: any }> = [];
  let ackMeta: Record<string, unknown> | null = null;

  setTopicMessageOpsLoaderForTests(async () => ({
    createTopicMessage: async () => {
      throw new Error("not_used");
    },
    replyTopicMessage: async () => {
      throw new Error("not_used");
    },
    setTopicMessagePinned: async () => ({
      room: { id: "room-1", slug: "general" },
      topic: { id: "topic-1", slug: "main" },
      messageId: "m-1",
      pinned: true
    }),
    setTopicMessageReaction: async () => {
      throw new Error("not_used");
    },
    createTopicMessageReport: async () => {
      throw new Error("not_used");
    },
    markTopicRead: async () => {
      throw new Error("not_used");
    }
  }));

  try {
    await handleChatPin(createTopicMutationParams({
      eventType: "chat.pin",
      sendAckWithMetrics: (_socket: unknown, _requestId: string | null, _eventType: string, meta?: Record<string, unknown>) => {
        ackMeta = meta || null;
      },
      broadcastRoom: (roomId: string, envelope: any) => {
        broadcasts.push({ roomId, envelope });
      }
    }) as any);
  } finally {
    setTopicMessageOpsLoaderForTests(null);
  }

  assert.equal(broadcasts.length, 1);
  assert.equal(broadcasts[0]?.roomId, "room-1");
  assert.equal(broadcasts[0]?.envelope?.type, "chat.message.pinned");
  assert.equal(broadcasts[0]?.envelope?.payload?.messageId, "m-1");
  assert.deepEqual(ackMeta, { messageId: "m-1", topicId: "topic-1" });
});

test("realtime-chat: chat.unpin maps forbidden domain error to nack", async () => {
  let nackCode: string | null = null;

  setTopicMessageOpsLoaderForTests(async () => ({
    createTopicMessage: async () => {
      throw new Error("not_used");
    },
    replyTopicMessage: async () => {
      throw new Error("not_used");
    },
    setTopicMessagePinned: async () => {
      throw new Error("forbidden_topic_manage");
    },
    setTopicMessageReaction: async () => {
      throw new Error("not_used");
    },
    createTopicMessageReport: async () => {
      throw new Error("not_used");
    },
    markTopicRead: async () => {
      throw new Error("not_used");
    }
  }));

  try {
    await handleChatUnpin(createTopicMutationParams({
      eventType: "chat.unpin",
      sendNack: (_socket: unknown, _requestId: string | null, _eventType: string, code: string) => {
        nackCode = code;
      }
    }) as any);
  } finally {
    setTopicMessageOpsLoaderForTests(null);
  }

  assert.equal(nackCode, "Forbidden");
});

test("realtime-chat: chat.reaction.add validates payload", async () => {
  let validationMessage: string | null = null;

  await handleChatReactionAdd(createTopicMutationParams({
    eventType: "chat.reaction.add",
    payload: { messageId: "m-1" },
    sendValidationNack: (_socket: unknown, _requestId: string | null, _eventType: string, message: string) => {
      validationMessage = message;
    }
  }) as any);

  assert.equal(validationMessage, "messageId and emoji are required");
});

test("realtime-chat: chat.reaction.remove broadcasts and acks on success", async () => {
  const broadcasts: Array<{ roomId: string; envelope: any }> = [];
  let ackMeta: Record<string, unknown> | null = null;

  setTopicMessageOpsLoaderForTests(async () => ({
    createTopicMessage: async () => {
      throw new Error("not_used");
    },
    replyTopicMessage: async () => {
      throw new Error("not_used");
    },
    setTopicMessagePinned: async () => {
      throw new Error("not_used");
    },
    setTopicMessageReaction: async () => ({
      room: { id: "room-1", slug: "general" },
      topic: { id: "topic-1", slug: "main" },
      messageId: "m-1",
      emoji: "👍",
      userId: "u1",
      active: false
    }),
    createTopicMessageReport: async () => {
      throw new Error("not_used");
    },
    markTopicRead: async () => {
      throw new Error("not_used");
    }
  }));

  try {
    await handleChatReactionRemove(createTopicMutationParams({
      eventType: "chat.reaction.remove",
      sendAckWithMetrics: (_socket: unknown, _requestId: string | null, _eventType: string, meta?: Record<string, unknown>) => {
        ackMeta = meta || null;
      },
      broadcastRoom: (roomId: string, envelope: any) => {
        broadcasts.push({ roomId, envelope });
      }
    }) as any);
  } finally {
    setTopicMessageOpsLoaderForTests(null);
  }

  assert.equal(broadcasts.length, 1);
  assert.equal(broadcasts[0]?.envelope?.type, "chat.message.reaction.changed");
  assert.equal(broadcasts[0]?.envelope?.payload?.active, false);
  assert.deepEqual(ackMeta, {
    messageId: "m-1",
    topicId: "topic-1",
    emoji: "👍",
    active: false
  });
});

test("realtime-chat: chat.report acks on success", async () => {
  let ackMeta: Record<string, unknown> | null = null;

  setTopicMessageOpsLoaderForTests(async () => ({
    createTopicMessage: async () => {
      throw new Error("not_used");
    },
    replyTopicMessage: async () => {
      throw new Error("not_used");
    },
    setTopicMessagePinned: async () => {
      throw new Error("not_used");
    },
    setTopicMessageReaction: async () => {
      throw new Error("not_used");
    },
    createTopicMessageReport: async () => ({
      reportId: "rep-1",
      messageId: "m-1"
    }),
    markTopicRead: async () => {
      throw new Error("not_used");
    }
  }));

  try {
    await handleChatReport(createTopicMutationParams({
      eventType: "chat.report",
      sendAckWithMetrics: (_socket: unknown, _requestId: string | null, _eventType: string, meta?: Record<string, unknown>) => {
        ackMeta = meta || null;
      }
    }) as any);
  } finally {
    setTopicMessageOpsLoaderForTests(null);
  }

  assert.deepEqual(ackMeta, {
    messageId: "m-1",
    reportId: "rep-1"
  });
});

test("realtime-chat: chat.report maps duplicate report to MessageAlreadyReported nack", async () => {
  let nackCode: string | null = null;

  setTopicMessageOpsLoaderForTests(async () => ({
    createTopicMessage: async () => {
      throw new Error("not_used");
    },
    replyTopicMessage: async () => {
      throw new Error("not_used");
    },
    setTopicMessagePinned: async () => {
      throw new Error("not_used");
    },
    setTopicMessageReaction: async () => {
      throw new Error("not_used");
    },
    createTopicMessageReport: async () => {
      throw new Error("message_report_exists");
    },
    markTopicRead: async () => {
      throw new Error("not_used");
    }
  }));

  try {
    await handleChatReport(createTopicMutationParams({
      eventType: "chat.report",
      sendNack: (_socket: unknown, _requestId: string | null, _eventType: string, code: string) => {
        nackCode = code;
      }
    }) as any);
  } finally {
    setTopicMessageOpsLoaderForTests(null);
  }

  assert.equal(nackCode, "MessageAlreadyReported");
});
