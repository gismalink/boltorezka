import type { WebSocket } from "ws";
import type { SocketState, WsIncomingPayload } from "../ws-protocol.types.ts";
import { handleRoomKick, handleRoomMoveMember } from "./realtime-moderation.js";

type RoomModerationEventDeps = {
  normalizeRequestId: (value: unknown) => string | null;
  getPayloadString: (payload: WsIncomingPayload | undefined, key: string, maxLength?: number) => string | null;
  isUserModerator: (userId: string, roomSlug?: string | null) => Promise<boolean>;
  sendValidationNack: (socket: WebSocket, requestId: string | null, eventType: string, message: string) => void;
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
  incrementMetric: (name: string) => Promise<void>;
  sendAckWithMetrics: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta?: Record<string, unknown>,
    additionalMetrics?: string[]
  ) => void;
  dbQuery: <T = unknown>(text: string, params?: unknown[]) => Promise<{ rowCount: number | null; rows: T[] }>;
  getUserRoomSockets: (userId: string, roomId: string) => WebSocket[];
  socketState: WeakMap<WebSocket, SocketState>;
  markRecentRoomDetach: (roomId: string, userId: string) => void;
  detachRoomSocket: (roomId: string, socket: WebSocket) => void;
  clearCanonicalMediaState: (roomId: string, userId: string) => void;
  clearRoomScreenShareOwnerIfMatches: (roomId: string, userId: string, roomSlug: string | null) => void;
  sendJson: (socket: WebSocket, payload: unknown) => void;
  buildRoomLeftEnvelope: (...args: any[]) => unknown;
  buildErrorEnvelope: (code: string, message: string, category: "auth" | "permissions" | "topology" | "transport") => unknown;
  broadcastRoom: (roomId: string, payload: unknown, excludedSocket?: WebSocket) => void;
  buildPresenceLeftEnvelope: (...args: any[]) => unknown;
  buildPresenceJoinedEnvelope: (...args: any[]) => unknown;
  getRoomPresence: (roomId: string) => Array<{ userId: string; userName: string }>;
  broadcastAllRoomsPresence: () => void;
  resolveRoomMediaTopology: (roomSlug: string, userId: string | null) => "livekit";
  getCallInitialStateParticipants: (roomId: string) => Array<{
    userId: string;
    userName: string;
    mic: { muted: boolean; speaking: boolean; audioMuted: boolean };
    video: { localVideoEnabled: boolean };
  }>;
  rtcFeatureInitialStateReplay: boolean;
  incrementMetricBy: (name: string, value: number) => Promise<void>;
  attachRoomSocket: (roomId: string, socket: WebSocket) => void;
  buildRoomJoinedEnvelope: (...args: any[]) => unknown;
  buildRoomPresenceEnvelope: (...args: any[]) => unknown;
  buildScreenShareStateEnvelope: (...args: any[]) => unknown;
  buildCallInitialStateEnvelope: (...args: any[]) => unknown;
};

export function createRealtimeRoomModerationEventHandlers(deps: RoomModerationEventDeps) {
  const {
    normalizeRequestId,
    getPayloadString,
    isUserModerator,
    sendValidationNack,
    sendForbiddenNack,
    sendNack,
    sendTargetNotInRoomNack,
    incrementMetric,
    sendAckWithMetrics,
    dbQuery,
    getUserRoomSockets,
    socketState,
    markRecentRoomDetach,
    detachRoomSocket,
    clearCanonicalMediaState,
    clearRoomScreenShareOwnerIfMatches,
    sendJson,
    buildRoomLeftEnvelope,
    buildErrorEnvelope,
    broadcastRoom,
    buildPresenceLeftEnvelope,
    buildPresenceJoinedEnvelope,
    getRoomPresence,
    broadcastAllRoomsPresence,
    resolveRoomMediaTopology,
    getCallInitialStateParticipants,
    rtcFeatureInitialStateReplay,
    incrementMetricBy,
    attachRoomSocket,
    buildRoomJoinedEnvelope,
    buildRoomPresenceEnvelope,
    buildScreenShareStateEnvelope,
    buildCallInitialStateEnvelope
  } = deps;

  const buildModerationBaseParams = (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string
  ) => ({
    connection,
    state,
    payload,
    requestId,
    eventType,
    normalizeRequestId,
    getPayloadString,
    isUserModerator,
    sendValidationNack,
    sendForbiddenNack,
    sendNack,
    sendTargetNotInRoomNack,
    incrementMetric,
    sendAckWithMetrics,
    dbQuery,
    getUserRoomSockets,
    socketState,
    markRecentRoomDetach,
    detachRoomSocket,
    clearCanonicalMediaState,
    clearRoomScreenShareOwnerIfMatches,
    sendJson,
    buildRoomLeftEnvelope,
    buildErrorEnvelope,
    broadcastRoom: (roomId: string, payloadOut: unknown, excludedSocket?: WebSocket | null) => {
      broadcastRoom(roomId, payloadOut, excludedSocket ?? undefined);
    },
    buildPresenceLeftEnvelope,
    buildPresenceJoinedEnvelope,
    getRoomPresence,
    broadcastAllRoomsPresence,
    resolveRoomMediaTopology,
    getCallInitialStateParticipants,
    rtcFeatureInitialStateReplay,
    incrementMetricBy,
    attachRoomSocket,
    buildRoomJoinedEnvelope,
    buildRoomPresenceEnvelope,
    buildScreenShareStateEnvelope,
    buildCallInitialStateEnvelope
  });

  const handleRoomKickEvent = async (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string
  ) => {
    await handleRoomKick(buildModerationBaseParams(connection, state, payload, requestId, eventType));
  };

  const handleRoomMoveMemberEvent = async (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string
  ) => {
    await handleRoomMoveMember(buildModerationBaseParams(connection, state, payload, requestId, eventType));
  };

  return {
    handleRoomKickEvent,
    handleRoomMoveMemberEvent
  };
}
