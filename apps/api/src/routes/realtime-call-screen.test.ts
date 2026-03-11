import test from "node:test";
import assert from "node:assert/strict";
import {
  handleCallMicState,
  handleCallVideoState,
  handleScreenShareStart,
  handleScreenShareStop
} from "./realtime-call-screen.js";

function createBaseParams(): any {
  return {
    connection: {} as any,
    state: {
      sessionId: "sess-1",
      userId: "u1",
      userName: "Alice",
      roomId: "room-1",
      roomSlug: "general"
    },
    payload: {},
    requestId: "req-1",
    eventType: "call.mic_state",
    sendNoActiveRoomNack: () => {},
    sendValidationNack: () => {},
    sendForbiddenNack: () => {},
    sendNack: () => {},
    sendTargetNotInRoomNack: () => {},
    sendAckWithMetrics: () => {},
    incrementMetric: async () => {},
    logCallDebug: () => {},
    normalizeRequestId: (value: unknown) => (typeof value === "string" ? value : null),
    getPayloadString: (payload: any, key: string) => {
      const value = payload?.[key];
      return typeof value === "string" ? value : null;
    },
    setCanonicalMediaState: () => {},
    buildCallTraceId: () => "trace-1",
    knownMessageType: "call.signal",
    buildCallMicStateRelayEnvelope: () => ({ type: "call.mic_state.relay" }),
    buildCallVideoStateRelayEnvelope: () => ({ type: "call.video_state.relay" }),
    relayToTargetOrRoom: () => ({ ok: true, relayedCount: 1 }),
    getUserRoomSockets: () => [],
    socketsByRoomId: new Map(),
    sendJson: () => {},
    screenShareOwnerByRoomId: new Map<string, string>(),
    buildScreenShareStateEnvelope: () => ({ type: "screen.share.state" }),
    broadcastRoom: () => {}
  };
}

test("realtime-call-screen: screen share start rejects when another owner is active", () => {
  const params = createBaseParams();
  params.eventType = "screen.share.start";
  params.screenShareOwnerByRoomId.set("room-1", "u2");

  let nackCode: string | null = null;
  let nackMessage: string | null = null;
  let nackMetricCalls = 0;

  params.sendNack = (
    _socket: unknown,
    _requestId: unknown,
    _eventType: unknown,
    code: string,
    message: string
  ) => {
    nackCode = code;
    nackMessage = message;
  };
  params.incrementMetric = async (name: string) => {
    if (name === "nack_sent") {
      nackMetricCalls += 1;
    }
  };

  handleScreenShareStart(params as any);

  assert.equal(nackCode, "ScreenShareAlreadyActive");
  assert.equal(nackMessage, "Another user is already sharing the screen");
  assert.equal(nackMetricCalls, 1);
  assert.equal(params.screenShareOwnerByRoomId.get("room-1"), "u2");
});

test("realtime-call-screen: call mic_state target miss sends target-not-in-room nack", () => {
  const params = createBaseParams();
  params.payload = { muted: true, targetUserId: "u-missing" };

  let targetMissNackCalls = 0;
  let targetMissMetricCalls = 0;

  params.relayToTargetOrRoom = () => ({ ok: false, relayedCount: 0 });
  params.sendTargetNotInRoomNack = () => {
    targetMissNackCalls += 1;
  };
  params.incrementMetric = async (name: string) => {
    if (name === "call_mic_state_target_miss") {
      targetMissMetricCalls += 1;
    }
  };

  handleCallMicState(params as any);

  assert.equal(targetMissNackCalls, 1);
  assert.equal(targetMissMetricCalls, 1);
});

test("realtime-call-screen: call mic_state validates muted boolean", () => {
  const params = createBaseParams();
  params.payload = { speaking: true };

  let validationMessage: string | null = null;
  params.sendValidationNack = (
    _socket: unknown,
    _requestId: unknown,
    _eventType: unknown,
    message: string
  ) => {
    validationMessage = message;
  };

  handleCallMicState(params as any);

  assert.equal(validationMessage, "payload.muted boolean is required");
});

test("realtime-call-screen: call mic_state returns no-active-room nack when room is missing", () => {
  const params = createBaseParams();
  params.state.roomId = null;
  params.state.roomSlug = null;
  params.payload = { muted: true };

  let noActiveRoomCalls = 0;
  params.sendNoActiveRoomNack = () => {
    noActiveRoomCalls += 1;
  };

  handleCallMicState(params as any);

  assert.equal(noActiveRoomCalls, 1);
});

test("realtime-call-screen: call mic_state relays and acks with media metadata", () => {
  const params = createBaseParams();
  params.payload = {
    muted: false,
    speaking: true,
    audioMuted: false,
    targetUserId: "u2"
  };

  const canonicalPatches: Array<Record<string, unknown>> = [];
  let ackMeta: Record<string, unknown> | null = null;

  params.setCanonicalMediaState = (_roomId: string, _userId: string, patch: Record<string, unknown>) => {
    canonicalPatches.push(patch);
  };
  params.relayToTargetOrRoom = () => ({ ok: true, relayedCount: 3 });
  params.sendAckWithMetrics = (
    _socket: unknown,
    _requestId: string | null,
    _eventType: string,
    meta?: Record<string, unknown>
  ) => {
    ackMeta = meta || null;
  };

  handleCallMicState(params as any);

  assert.deepEqual(canonicalPatches, [{ muted: false, speaking: true, audioMuted: false }]);
  assert.deepEqual(ackMeta, {
    relayedTo: 3,
    targetUserId: "u2",
    muted: false,
    speaking: true,
    audioMuted: false
  });
});

test("realtime-call-screen: call video_state validates settings payload", () => {
  const params = createBaseParams();
  params.eventType = "call.video_state";
  params.payload = { settings: null };

  let validationMessage: string | null = null;
  params.sendValidationNack = (
    _socket: unknown,
    _requestId: unknown,
    _eventType: unknown,
    message: string
  ) => {
    validationMessage = message;
  };

  handleCallVideoState(params as any);

  assert.equal(validationMessage, "payload.settings object is required");
});

test("realtime-call-screen: call video_state returns no-active-room nack when room is missing", () => {
  const params = createBaseParams();
  params.eventType = "call.video_state";
  params.state.roomId = null;
  params.state.roomSlug = null;
  params.payload = { settings: { localVideoEnabled: true } };

  let noActiveRoomCalls = 0;
  params.sendNoActiveRoomNack = () => {
    noActiveRoomCalls += 1;
  };

  handleCallVideoState(params as any);

  assert.equal(noActiveRoomCalls, 1);
});

test("realtime-call-screen: call video_state relays and acks with target metadata", () => {
  const params = createBaseParams();
  params.eventType = "call.video_state";
  params.payload = {
    targetUserId: "u2",
    settings: {
      localVideoEnabled: true,
      cameraFacingMode: "user"
    }
  };

  const canonicalPatches: Array<Record<string, unknown>> = [];
  let ackMeta: Record<string, unknown> | null = null;
  let capturedTargetUserId: string | null = null;

  params.setCanonicalMediaState = (_roomId: string, _userId: string, patch: Record<string, unknown>) => {
    canonicalPatches.push(patch);
  };
  params.relayToTargetOrRoom = ({ targetUserId }: { targetUserId: string | null }) => {
    capturedTargetUserId = targetUserId;
    return { ok: true, relayedCount: 2 };
  };
  params.sendAckWithMetrics = (
    _socket: unknown,
    _requestId: string | null,
    _eventType: string,
    meta?: Record<string, unknown>
  ) => {
    ackMeta = meta || null;
  };

  handleCallVideoState(params as any);

  assert.equal(capturedTargetUserId, "u2");
  assert.deepEqual(canonicalPatches, [{ localVideoEnabled: true }]);
  assert.deepEqual(ackMeta, {
    relayedTo: 2,
    targetUserId: "u2"
  });
});

test("realtime-call-screen: call video_state target miss sends target-not-in-room nack", () => {
  const params = createBaseParams();
  params.eventType = "call.video_state";
  params.payload = {
    targetUserId: "u-missing",
    settings: {
      localVideoEnabled: false
    }
  };

  let targetMissNackCalls = 0;
  let targetMissMetricCalls = 0;

  params.relayToTargetOrRoom = () => ({ ok: false, relayedCount: 0 });
  params.sendTargetNotInRoomNack = () => {
    targetMissNackCalls += 1;
  };
  params.incrementMetric = async (name: string) => {
    if (name === "call_video_state_target_miss") {
      targetMissMetricCalls += 1;
    }
  };

  handleCallVideoState(params as any);

  assert.equal(targetMissNackCalls, 1);
  assert.equal(targetMissMetricCalls, 1);
});

test("realtime-call-screen: screen share stop rejects non-owner", () => {
  const params = createBaseParams();
  params.eventType = "screen.share.stop";
  params.screenShareOwnerByRoomId.set("room-1", "u2");

  let forbiddenCalls = 0;
  let broadcastCalls = 0;
  params.sendForbiddenNack = () => {
    forbiddenCalls += 1;
  };
  params.broadcastRoom = () => {
    broadcastCalls += 1;
  };

  handleScreenShareStop(params as any);

  assert.equal(forbiddenCalls, 1);
  assert.equal(broadcastCalls, 0);
  assert.equal(params.screenShareOwnerByRoomId.get("room-1"), "u2");
});
