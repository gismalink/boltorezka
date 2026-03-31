import type { WebSocket } from "ws";
import type { WsIncomingPayload } from "../ws-protocol.types.ts";
import {
  handleCallMicState,
  handleCallVideoState,
  handleScreenShareStart,
  handleScreenShareStop
} from "./realtime-call-screen.js";

type SocketState = {
  sessionId: string;
  userId: string;
  userName: string;
  roomId: string | null;
  roomSlug: string | null;
};

type CallMediaKnownType = "screen.share.start" | "screen.share.stop" | "call.mic_state" | "call.video_state";

type CallMediaEventDeps = {
  handleCallIdempotency: (
    socket: WebSocket,
    state: SocketState,
    requestId: string | null,
    eventType: string
  ) => Promise<boolean>;
  sendNoActiveRoomNack: (socket: WebSocket, requestId: string | null, eventType: string, meta?: Record<string, unknown>) => void;
  sendValidationNack: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    message: string,
    meta?: Record<string, unknown>
  ) => void;
  sendForbiddenNack: (socket: WebSocket, requestId: string | null, eventType: string, message?: string) => void;
  sendNack: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    code: string,
    message: string,
    meta?: Record<string, unknown>
  ) => void;
  sendTargetNotInRoomNack: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta?: Record<string, unknown>
  ) => void;
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
  getPayloadString: (payload: WsIncomingPayload | undefined, key: string, maxLength?: number) => string | null;
  setCanonicalMediaState: (roomId: string, userId: string, patch: Record<string, unknown>) => void;
  buildCallTraceId: (eventType: string, requestId: string | null, sessionId: string) => string;
  buildCallMicStateRelayEnvelope: (...args: any[]) => unknown;
  buildCallVideoStateRelayEnvelope: (...args: any[]) => unknown;
  relayToTargetOrRoom: (params: {
    senderSocket: WebSocket;
    roomId: string;
    targetUserId: string | null;
    relayEnvelope: unknown;
    getUserRoomSockets: (userId: string, roomId: string) => WebSocket[];
    socketsByRoomId: Map<string, Set<WebSocket>>;
    sendJson: (socket: WebSocket, payload: unknown) => void;
  }) => { ok: boolean; relayedCount: number };
  getUserRoomSockets: (userId: string, roomId: string) => WebSocket[];
  socketsByRoomId: Map<string, Set<WebSocket>>;
  sendJson: (socket: WebSocket, payload: unknown) => void;
  screenShareOwnerByRoomId: Map<string, string>;
  buildScreenShareStateEnvelope: (roomId: string, roomSlug: string | null) => unknown;
  broadcastRoom: (roomId: string, payload: unknown, excludedSocket?: WebSocket | null) => void;
};

export function createRealtimeCallMediaEventHandlers(deps: CallMediaEventDeps) {
  const {
    handleCallIdempotency,
    sendNoActiveRoomNack,
    sendValidationNack,
    sendForbiddenNack,
    sendNack,
    sendTargetNotInRoomNack,
    sendAckWithMetrics,
    incrementMetric,
    logCallDebug,
    normalizeRequestId,
    getPayloadString,
    setCanonicalMediaState,
    buildCallTraceId,
    buildCallMicStateRelayEnvelope,
    buildCallVideoStateRelayEnvelope,
    relayToTargetOrRoom,
    getUserRoomSockets,
    socketsByRoomId,
    sendJson,
    screenShareOwnerByRoomId,
    buildScreenShareStateEnvelope,
    broadcastRoom
  } = deps;

  const buildBaseParams = (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string,
    knownMessageType: CallMediaKnownType
  ) => ({
    connection,
    state,
    payload,
    requestId,
    eventType,
    sendNoActiveRoomNack,
    sendValidationNack,
    sendForbiddenNack,
    sendNack,
    sendTargetNotInRoomNack,
    sendAckWithMetrics,
    incrementMetric,
    logCallDebug,
    normalizeRequestId,
    getPayloadString,
    setCanonicalMediaState,
    buildCallTraceId,
    knownMessageType,
    buildCallMicStateRelayEnvelope,
    buildCallVideoStateRelayEnvelope,
    relayToTargetOrRoom,
    getUserRoomSockets,
    socketsByRoomId,
    sendJson,
    screenShareOwnerByRoomId,
    buildScreenShareStateEnvelope,
    broadcastRoom
  });

  const handleScreenShareStartEvent = (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string,
    knownMessageType: "screen.share.start"
  ) => {
    handleScreenShareStart(buildBaseParams(connection, state, payload, requestId, eventType, knownMessageType));
  };

  const handleScreenShareStopEvent = (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string,
    knownMessageType: "screen.share.stop"
  ) => {
    handleScreenShareStop(buildBaseParams(connection, state, payload, requestId, eventType, knownMessageType));
  };

  const handleCallMicStateEvent = async (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string,
    knownMessageType: "call.mic_state"
  ) => {
    if (await handleCallIdempotency(connection, state, requestId, eventType)) {
      return;
    }

    handleCallMicState(buildBaseParams(connection, state, payload, requestId, eventType, knownMessageType));
  };

  const handleCallVideoStateEvent = async (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string,
    knownMessageType: "call.video_state"
  ) => {
    if (await handleCallIdempotency(connection, state, requestId, eventType)) {
      return;
    }

    handleCallVideoState(buildBaseParams(connection, state, payload, requestId, eventType, knownMessageType));
  };

  return {
    handleScreenShareStartEvent,
    handleScreenShareStopEvent,
    handleCallMicStateEvent,
    handleCallVideoStateEvent
  };
}
