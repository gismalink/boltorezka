import test from "node:test";
import assert from "node:assert/strict";
import { handleCallMicState, handleScreenShareStart } from "./realtime-call-screen.js";

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
