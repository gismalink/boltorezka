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
