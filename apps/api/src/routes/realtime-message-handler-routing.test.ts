import test from "node:test";
import assert from "node:assert/strict";
import type { WebSocket } from "ws";
import { createRealtimeMessageHandler } from "./realtime-message-handler.js";

type HandlerCall = {
  eventType: string;
  requestId: string | null;
  payload: Record<string, unknown> | undefined;
};

function createHandlerFor(eventCalls: Record<string, HandlerCall[]>) {
  const socketState = new WeakMap<WebSocket, {
    sessionId: string;
    userId: string;
    userName: string;
    roomId: string | null;
    roomSlug: string | null;
    roomKind: "text" | "text_voice" | "text_voice_video" | null;
  }>();

  const connection = {} as WebSocket;
  socketState.set(connection, {
    sessionId: "sess-1",
    userId: "u1",
    userName: "Alice",
    roomId: "room-1",
    roomSlug: "general",
    roomKind: "text"
  });

  const push = (key: string, eventType: string, requestId: string | null, payload: Record<string, unknown> | undefined) => {
    eventCalls[key] = eventCalls[key] || [];
    eventCalls[key].push({ eventType, requestId, payload });
  };

  const { handleMessage } = createRealtimeMessageHandler({
    socketState,
    normalizeRequestId: (value) => (typeof value === "string" && value.trim() ? value : null),
    sendJson: () => {},
    sendInvalidEnvelopeError: () => {},
    sendUnknownEventNack: () => {},
    sendAckWithMetrics: () => {},
    handleRoomJoinEvent: async (_c, _s, payload, requestId, eventType) => {
      push("room.join", eventType, requestId, payload);
    },
    handleRoomLeaveEvent: (_c, _s, requestId, eventType) => {
      push("room.leave", eventType, requestId, undefined);
    },
    handleRoomKickEvent: async (_c, _s, payload, requestId, eventType) => {
      push("room.kick", eventType, requestId, payload);
    },
    handleRoomMoveMemberEvent: async (_c, _s, payload, requestId, eventType) => {
      push("room.move_member", eventType, requestId, payload);
    },
    handleChatSendEvent: async (_c, _s, payload, requestId, eventType) => {
      push("chat.send", eventType, requestId, payload);
    },
    handleChatEditEvent: async (_c, _s, payload, requestId, eventType) => {
      push("chat.edit", eventType, requestId, payload);
    },
    handleChatDeleteEvent: async (_c, _s, payload, requestId, eventType) => {
      push("chat.delete", eventType, requestId, payload);
    },
    handleChatPinEvent: async (_c, _s, payload, requestId, eventType) => {
      push("chat.pin", eventType, requestId, payload);
    },
    handleChatUnpinEvent: async (_c, _s, payload, requestId, eventType) => {
      push("chat.unpin", eventType, requestId, payload);
    },
    handleChatReactionAddEvent: async (_c, _s, payload, requestId, eventType) => {
      push("chat.reaction.add", eventType, requestId, payload);
    },
    handleChatReactionRemoveEvent: async (_c, _s, payload, requestId, eventType) => {
      push("chat.reaction.remove", eventType, requestId, payload);
    },
    handleChatReportEvent: async (_c, _s, payload, requestId, eventType) => {
      push("chat.report", eventType, requestId, payload);
    },
    handleChatTopicReadEvent: async (_c, _s, payload, requestId, eventType) => {
      push("chat.topic.read", eventType, requestId, payload);
    },
    handleChatTypingEvent: async (_c, _s, payload, requestId, eventType) => {
      push("chat.typing", eventType, requestId, payload);
    },
    handleScreenShareStartEvent: (_c, _s, payload, requestId, eventType) => {
      push("screen.share.start", eventType, requestId, payload);
    },
    handleScreenShareStopEvent: (_c, _s, payload, requestId, eventType) => {
      push("screen.share.stop", eventType, requestId, payload);
    },
    handleCallMicStateEvent: async (_c, _s, payload, requestId, eventType) => {
      push("call.mic_state", eventType, requestId, payload);
    },
    handleCallSignalingEvent: async (_c, _s, payload, requestId, eventType) => {
      push("call.signal", eventType, requestId, payload);
    },
    handleCallVideoStateEvent: async (_c, _s, payload, requestId, eventType) => {
      push("call.video_state", eventType, requestId, payload);
    },
    logWsError: () => {}
  });

  return { connection, handleMessage };
}

test("realtime-message-handler: routes chat.pin and chat.unpin", async () => {
  const eventCalls: Record<string, HandlerCall[]> = {};
  const { connection, handleMessage } = createHandlerFor(eventCalls);

  await handleMessage(connection, Buffer.from(JSON.stringify({
    type: "chat.pin",
    requestId: "req-pin-1",
    payload: { messageId: "m1", roomSlug: "general" }
  })));

  await handleMessage(connection, Buffer.from(JSON.stringify({
    type: "chat.unpin",
    requestId: "req-unpin-1",
    payload: { messageId: "m1", roomSlug: "general" }
  })));

  assert.equal(eventCalls["chat.pin"]?.length, 1);
  assert.equal(eventCalls["chat.unpin"]?.length, 1);
  assert.equal(eventCalls["chat.pin"]?.[0]?.requestId, "req-pin-1");
  assert.equal(eventCalls["chat.unpin"]?.[0]?.requestId, "req-unpin-1");
});

test("realtime-message-handler: routes chat.reaction.add and chat.reaction.remove", async () => {
  const eventCalls: Record<string, HandlerCall[]> = {};
  const { connection, handleMessage } = createHandlerFor(eventCalls);

  await handleMessage(connection, Buffer.from(JSON.stringify({
    type: "chat.reaction.add",
    requestId: "req-react-add-1",
    payload: { messageId: "m1", emoji: "👍", roomSlug: "general" }
  })));

  await handleMessage(connection, Buffer.from(JSON.stringify({
    type: "chat.reaction.remove",
    requestId: "req-react-remove-1",
    payload: { messageId: "m1", emoji: "👍", roomSlug: "general" }
  })));

  assert.equal(eventCalls["chat.reaction.add"]?.length, 1);
  assert.equal(eventCalls["chat.reaction.remove"]?.length, 1);
  assert.equal(eventCalls["chat.reaction.add"]?.[0]?.requestId, "req-react-add-1");
  assert.equal(eventCalls["chat.reaction.remove"]?.[0]?.requestId, "req-react-remove-1");
});

test("realtime-message-handler: routes chat.report", async () => {
  const eventCalls: Record<string, HandlerCall[]> = {};
  const { connection, handleMessage } = createHandlerFor(eventCalls);

  await handleMessage(connection, Buffer.from(JSON.stringify({
    type: "chat.report",
    requestId: "req-report-1",
    payload: { messageId: "m1" }
  })));

  assert.equal(eventCalls["chat.report"]?.length, 1);
  assert.equal(eventCalls["chat.report"]?.[0]?.requestId, "req-report-1");
});

test("realtime-message-handler: routes chat.topic.read", async () => {
  const eventCalls: Record<string, HandlerCall[]> = {};
  const { connection, handleMessage } = createHandlerFor(eventCalls);

  await handleMessage(connection, Buffer.from(JSON.stringify({
    type: "chat.topic.read",
    requestId: "req-topic-read-1",
    payload: { topicId: "topic-1", lastReadMessageId: "message-1" }
  })));

  assert.equal(eventCalls["chat.topic.read"]?.length, 1);
  assert.equal(eventCalls["chat.topic.read"]?.[0]?.requestId, "req-topic-read-1");
});
