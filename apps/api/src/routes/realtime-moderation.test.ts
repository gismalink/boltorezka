import test from "node:test";
import assert from "node:assert/strict";
import { handleRoomKick, handleRoomMoveMember } from "./realtime-moderation.js";

function createBaseParams(): any {
  return {
    connection: {} as any,
    state: {
      userId: "mod-1",
      userName: "Moderator",
      roomId: "room-1",
      roomSlug: "general",
      roomKind: "text_voice" as const
    },
    payload: {},
    requestId: "req-1",
    eventType: "room.kick",
    normalizeRequestId: (value: unknown) => (typeof value === "string" ? value : null),
    getPayloadString: (payload: any, key: string) => {
      const value = payload?.[key];
      return typeof value === "string" ? value : null;
    },
    isUserModerator: async () => true,
    sendValidationNack: () => {},
    sendForbiddenNack: () => {},
    sendNack: () => {},
    sendTargetNotInRoomNack: () => {},
    incrementMetric: async () => {},
    sendAckWithMetrics: () => {},
    dbQuery: async () => ({ rowCount: 0, rows: [] }),
    getUserRoomSockets: () => [],
    socketState: new WeakMap(),
    markRecentRoomDetach: () => {},
    detachRoomSocket: () => {},
    clearCanonicalMediaState: () => {},
    clearRoomScreenShareOwnerIfMatches: () => {},
    sendJson: () => {},
    buildRoomLeftEnvelope: () => ({}),
    buildErrorEnvelope: () => ({}),
    broadcastRoom: () => {},
    buildPresenceLeftEnvelope: () => ({}),
    buildPresenceJoinedEnvelope: () => ({}),
    getRoomPresence: () => [],
    broadcastAllRoomsPresence: () => {},
    resolveRoomMediaTopology: () => "livekit" as const,
    getCallInitialStateParticipants: () => [],
    rtcFeatureInitialStateReplay: true,
    incrementMetricBy: async () => {},
    attachRoomSocket: () => {},
    buildRoomJoinedEnvelope: () => ({}),
    buildRoomPresenceEnvelope: () => ({}),
    buildScreenShareStateEnvelope: () => ({}),
    buildCallInitialStateEnvelope: () => ({})
  };
}

test("realtime-moderation: room.kick rejects self-kick", async () => {
  const params = createBaseParams();
  params.payload = { roomSlug: "general", targetUserId: "mod-1" };

  let message: string | null = null;
  params.sendValidationNack = (
    _socket: unknown,
    _requestId: unknown,
    _eventType: unknown,
    msg: string
  ) => {
    message = msg;
  };

  await handleRoomKick(params as any);

  assert.equal(message, "Cannot kick yourself");
});

test("realtime-moderation: room.move_member validates source/target room difference", async () => {
  const params = createBaseParams();
  params.eventType = "room.move_member";
  params.payload = {
    fromRoomSlug: "general",
    toRoomSlug: "general",
    targetUserId: "user-2"
  };

  let message: string | null = null;
  params.sendValidationNack = (
    _socket: unknown,
    _requestId: unknown,
    _eventType: unknown,
    msg: string
  ) => {
    message = msg;
  };

  await handleRoomMoveMember(params as any);

  assert.equal(message, "fromRoomSlug and toRoomSlug must be different");
});

test("realtime-moderation: room.kick requires moderator permissions", async () => {
  const params = createBaseParams();
  params.payload = { roomSlug: "general", targetUserId: "user-2" };
  params.isUserModerator = async () => false;

  let forbiddenCalls = 0;
  params.sendForbiddenNack = () => {
    forbiddenCalls += 1;
  };

  await handleRoomKick(params as any);

  assert.equal(forbiddenCalls, 1);
});

test("realtime-moderation: room.kick sends RoomNotFound nack and increments metric", async () => {
  const params = createBaseParams();
  params.payload = { roomSlug: "missing-room", targetUserId: "user-2" };

  let nackCode: string | null = null;
  let nackMetricCalls = 0;

  params.sendNack = (
    _socket: unknown,
    _requestId: unknown,
    _eventType: unknown,
    code: string
  ) => {
    nackCode = code;
  };
  params.incrementMetric = async (name: string) => {
    if (name === "nack_sent") {
      nackMetricCalls += 1;
    }
  };
  params.dbQuery = async () => ({ rowCount: 0, rows: [] });

  await handleRoomKick(params as any);

  assert.equal(nackCode, "RoomNotFound");
  assert.equal(nackMetricCalls, 1);
});

test("realtime-moderation: room.move_member sends target-not-in-room nack", async () => {
  const params = createBaseParams();
  params.eventType = "room.move_member";
  params.payload = {
    fromRoomSlug: "general",
    toRoomSlug: "voice",
    targetUserId: "user-2"
  };

  let targetMissCalls = 0;

  params.dbQuery = async () => ({
    rowCount: 2,
    rows: [
      { id: "room-1", slug: "general", title: "General", kind: "text_voice", is_public: true },
      { id: "room-2", slug: "voice", title: "Voice", kind: "text_voice", is_public: true }
    ]
  });
  params.getUserRoomSockets = () => [];
  params.sendTargetNotInRoomNack = () => {
    targetMissCalls += 1;
  };

  await handleRoomMoveMember(params as any);

  assert.equal(targetMissCalls, 1);
});

test("realtime-moderation: room.move_member moves member and sends ack metadata", async () => {
  const params = createBaseParams();
  params.eventType = "room.move_member";
  params.payload = {
    fromRoomSlug: "general",
    toRoomSlug: "voice",
    targetUserId: "user-2"
  };

  const targetSocket = {} as any;
  const targetState = {
    userId: "user-2",
    userName: "Bob",
    roomId: "room-1",
    roomSlug: "general",
    roomKind: "text_voice"
  };
  params.socketState.set(targetSocket, targetState);

  let dbInsertCalls = 0;
  const sendJsonEvents: string[] = [];
  const detachCalls: string[] = [];
  const attachCalls: string[] = [];
  let broadcastAllCalls = 0;
  let ackMeta: Record<string, unknown> | null = null;

  params.dbQuery = async (text: string) => {
    if (text.includes("SELECT id, slug, title, kind, is_public")) {
      return {
        rowCount: 2,
        rows: [
          { id: "room-1", slug: "general", title: "General", kind: "text_voice", is_public: true },
          { id: "room-2", slug: "voice", title: "Voice", kind: "text_voice", is_public: true }
        ]
      };
    }

    dbInsertCalls += 1;
    return { rowCount: 1, rows: [] };
  };
  params.getUserRoomSockets = () => [targetSocket];
  params.markRecentRoomDetach = (roomId: string, userId: string) => {
    detachCalls.push(`mark:${roomId}:${userId}`);
  };
  params.detachRoomSocket = (roomId: string) => {
    detachCalls.push(`detach:${roomId}`);
  };
  params.attachRoomSocket = (roomId: string) => {
    attachCalls.push(roomId);
  };
  params.clearCanonicalMediaState = () => {};
  params.clearRoomScreenShareOwnerIfMatches = () => {};
  params.sendJson = (_socket: unknown, payload: { type?: string }) => {
    sendJsonEvents.push(payload?.type || "unknown");
  };
  params.buildRoomLeftEnvelope = () => ({ type: "room.left" });
  params.buildRoomJoinedEnvelope = () => ({ type: "room.joined" });
  params.buildRoomPresenceEnvelope = () => ({ type: "room.presence" });
  params.buildScreenShareStateEnvelope = () => ({ type: "screen.share.state" });
  params.buildCallInitialStateEnvelope = () => ({ type: "call.initial_state" });
  params.broadcastRoom = () => {};
  params.broadcastAllRoomsPresence = () => {
    broadcastAllCalls += 1;
  };
  params.sendAckWithMetrics = (
    _socket: unknown,
    _requestId: string | null,
    _eventType: string,
    meta?: Record<string, unknown>
  ) => {
    ackMeta = meta || null;
  };

  await handleRoomMoveMember(params as any);

  assert.equal(dbInsertCalls, 1);
  assert.deepEqual(detachCalls, ["mark:room-1:user-2", "detach:room-1"]);
  assert.deepEqual(attachCalls, ["room-2"]);
  assert.deepEqual(sendJsonEvents, [
    "room.left",
    "room.joined",
    "room.presence",
    "screen.share.state",
    "call.initial_state"
  ]);
  assert.equal(broadcastAllCalls, 1);
  assert.equal(targetState.roomId, "room-2");
  assert.equal(targetState.roomSlug, "voice");
  assert.deepEqual(ackMeta, {
    targetUserId: "user-2",
    fromRoomSlug: "general",
    toRoomSlug: "voice"
  });
});
