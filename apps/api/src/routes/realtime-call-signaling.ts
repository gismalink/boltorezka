import type { WebSocket } from "ws";
import type { WsIncomingPayload } from "../ws-protocol.types.ts";
import { buildCallSignalRelayEnvelope, getPayloadString } from "../ws-protocol.js";
import { relayToTargetOrRoom } from "./realtime-relay.js";

type SocketState = {
  sessionId: string;
  userId: string;
  userName: string;
  roomId: string | null;
  roomSlug: string | null;
};

type CallSignalEventType = "call.offer" | "call.answer" | "call.ice";

type CallSignalingHandlerDeps = {
  handleCallIdempotency: (
    socket: WebSocket,
    state: SocketState,
    requestId: string | null,
    eventType: string
  ) => Promise<boolean>;
  sendNoActiveRoomNack: (socket: WebSocket, requestId: string | null, eventType: string) => void;
  sendValidationNack: (socket: WebSocket, requestId: string | null, eventType: string, details: string) => void;
  sendTargetNotInRoomNack: (socket: WebSocket, requestId: string | null, eventType: string) => void;
  sendAckWithMetrics: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta?: Record<string, unknown>,
    additionalMetrics?: string[]
  ) => void;
  incrementMetric: (name: string) => Promise<void>;
  logCallDebug: (message: string, meta?: Record<string, unknown>) => void;
  normalizeRequestId: (value: unknown) => string | null;
  buildCallTraceId: (eventType: string, requestId: string | null, sessionId: string) => string;
  getUserRoomSockets: (userId: string, roomId: string) => WebSocket[];
  socketsByRoomId: Map<string, Set<WebSocket>>;
  sendJson: (socket: WebSocket, envelope: unknown) => void;
};

export function createRealtimeCallSignalingHandler(deps: CallSignalingHandlerDeps) {
  const {
    handleCallIdempotency,
    sendNoActiveRoomNack,
    sendValidationNack,
    sendTargetNotInRoomNack,
    sendAckWithMetrics,
    incrementMetric,
    logCallDebug,
    normalizeRequestId,
    buildCallTraceId,
    getUserRoomSockets,
    socketsByRoomId,
    sendJson
  } = deps;

  const handleCallSignalingEvent = async (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string,
    knownMessageType: CallSignalEventType
  ) => {
    if (await handleCallIdempotency(connection, state, requestId, eventType)) {
      return;
    }

    if (!state.roomId) {
      sendNoActiveRoomNack(connection, requestId, eventType);
      return;
    }

    const signalRaw = payload?.signal;
    if (!signalRaw || typeof signalRaw !== "object" || Array.isArray(signalRaw)) {
      sendValidationNack(connection, requestId, eventType, "payload.signal object is required");
      return;
    }

    const targetUserId = normalizeRequestId(getPayloadString(payload, "targetUserId", 128)) || null;
    const traceId = buildCallTraceId(eventType, requestId, state.sessionId);
    const relayEnvelope = buildCallSignalRelayEnvelope(
      knownMessageType,
      requestId,
      state.sessionId,
      traceId,
      state.userId,
      state.userName,
      state.roomId,
      state.roomSlug,
      targetUserId,
      signalRaw as Record<string, unknown>
    );

    logCallDebug("call signaling received", {
      eventType,
      userId: state.userId,
      sessionId: state.sessionId,
      traceId,
      roomId: state.roomId,
      roomSlug: state.roomSlug,
      requestId,
      targetUserId
    });

    const relayOutcome = relayToTargetOrRoom({
      senderSocket: connection,
      roomId: state.roomId,
      targetUserId,
      relayEnvelope,
      getUserRoomSockets,
      socketsByRoomId,
      sendJson
    });

    if (!relayOutcome.ok) {
      sendTargetNotInRoomNack(connection, requestId, eventType);
      void incrementMetric("call_signal_target_miss");
      return;
    }

    const callSignalMetricByType: Record<string, string> = {
      "call.offer": "call_offer_received",
      "call.answer": "call_answer_received",
      "call.ice": "call_ice_received"
    };

    sendAckWithMetrics(
      connection,
      requestId,
      eventType,
      {
        relayedTo: relayOutcome.relayedCount,
        targetUserId
      },
      ["call_signal_sent", callSignalMetricByType[eventType] || "call_signal_sent"]
    );
  };

  return {
    handleCallSignalingEvent
  };
}
