import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { db } from "../db.js";
import { config } from "../config.js";
import { createRealtimeAuditLogger } from "./realtime-audit.js";
import { normalizeRequestId, sendJson, sendNack } from "./realtime-io.js";
import { createRealtimeCallMediaEventHandlers } from "./realtime-call-media-events.js";
import { createRealtimeCallSignalingHandler } from "./realtime-call-signaling.js";
import { createRealtimeChatEventHandlers } from "./realtime-chat-events.js";
import { createRealtimeCallHelpers } from "./realtime-call-helpers.js";
import { createRealtimeMediaStateStore } from "./realtime-media-state.js";
import { createRealtimeMetrics } from "./realtime-metrics.js";
import { createRealtimeMessageHandler } from "./realtime-message-handler.js";
import { createRealtimeNackSenders } from "./realtime-nacks.js";
import { createRealtimePermissionHelpers } from "./realtime-permissions.js";
import { createRealtimeRoomEvictionHandler } from "./realtime-room-eviction.js";
import { createRealtimeRoomModerationEventHandlers } from "./realtime-room-moderation-events.js";
import { createRealtimeRoomEventHandlers } from "./realtime-room-events.js";
import { buildRealtimeScreenShareStateStore } from "./realtime-screen-share-state.js";
import { createRealtimeRoomStateStore } from "./realtime-room-state.js";
import { relayToTargetOrRoom } from "./realtime-relay.js";
import { registerRealtimeWsRoute } from "./realtime-ws-route.js";
import {
  buildRoomsPresenceEnvelope,
  buildCallInitialStateEnvelope,
  buildCallMicStateRelayEnvelope,
  buildCallVideoStateRelayEnvelope,
  buildChatDeletedEnvelope,
  buildChatEditedEnvelope,
  buildChatMessageEnvelope,
  buildErrorEnvelope,
  buildChatTypingEnvelope,
  buildPresenceJoinedEnvelope,
  buildPresenceLeftEnvelope,
  buildRoomJoinedEnvelope,
  buildRoomLeftEnvelope,
  buildRoomPresenceEnvelope,
  getPayloadString
} from "../ws-protocol.js";
type SocketState = {
  sessionId: string;
  userId: string;
  userName: string;
  currentServerId: string | null;
  roomId: string | null;
  roomSlug: string | null;
  roomKind: "text" | "text_voice" | "text_voice_video" | null;
};

type MediaTopology = "livekit";

export async function realtimeRoutes(fastify: FastifyInstance) {
  const socketState = new WeakMap<WebSocket, SocketState>();
  const { logCallDebug, logWsConnectionFailed, logWsMessageHandlingFailed } = createRealtimeAuditLogger(fastify);

  const { incrementMetric, incrementMetricBy } = createRealtimeMetrics(fastify);
  const {
    sendNoActiveRoomNack,
    sendTargetNotInRoomNack,
    sendValidationNack,
    sendInvalidEnvelopeError,
    sendUnknownEventNack
  } = createRealtimeNackSenders({
    socketState,
    incrementMetric
  });
  const {
    sendAckWithMetrics,
    handleCallIdempotency,
    buildCallTraceId
  } = createRealtimeCallHelpers(fastify.redis, incrementMetric);
  const {
    sendJoinDeniedNack,
    sendForbiddenNack,
    isUserModerator
  } = createRealtimePermissionHelpers(incrementMetric);

  function resolveRoomMediaTopology(_roomSlug: string, _userId: string | null = null): MediaTopology {
    return "livekit";
  }

  const {
    socketsByUserId,
    socketsByRoomId,
    attachUserSocket,
    detachUserSocket,
    attachRoomSocket,
    detachRoomSocket,
    broadcastRoom,
    getRoomPresence,
    getAllRoomsPresence,
    broadcastAllRoomsPresence,
    getUserRoomSockets
  } = createRealtimeRoomStateStore({
    socketState,
    sendJson,
    buildRoomsPresenceEnvelope,
    resolveRoomMediaTopology
  });

  const {
    setCanonicalMediaState,
    clearCanonicalMediaState,
    markRecentRoomDetach,
    consumeRecentReconnectMark,
    getCallInitialStateParticipants,
    getCallInitialStateLagStats
  } = createRealtimeMediaStateStore(getRoomPresence);
  const {
    screenShareOwnerByRoomId,
    buildScreenShareStateEnvelope,
    clearRoomScreenShareOwnerIfMatches
  } = buildRealtimeScreenShareStateStore({
    getRoomPresence,
    broadcastRoom
  });
  const { evictUserFromOtherNonTextChannels } = createRealtimeRoomEvictionHandler({
    socketsByUserId,
    socketState,
    detachRoomSocket,
    clearCanonicalMediaState,
    sendJson,
    buildRoomLeftEnvelope,
    buildErrorEnvelope,
    broadcastRoom,
    buildPresenceLeftEnvelope,
    getRoomPresence,
    broadcastAllRoomsPresence
  });

  const { handleRoomJoinEvent, handleRoomLeaveEvent } = createRealtimeRoomEventHandlers({
    sendJson,
    sendValidationNack,
    sendJoinDeniedNack,
    sendNoActiveRoomNack,
    sendAckWithMetrics,
    buildCallTraceId,
    resolveRoomMediaTopology,
    consumeRecentReconnectMark,
    markRecentRoomDetach,
    attachRoomSocket,
    detachRoomSocket,
    clearCanonicalMediaState,
    clearRoomScreenShareOwnerIfMatches,
    broadcastRoom,
    broadcastAllRoomsPresence,
    getRoomPresence,
    getCallInitialStateParticipants,
    getCallInitialStateLagStats,
    incrementMetric,
    incrementMetricBy,
    buildScreenShareStateEnvelope,
    evictUserFromOtherNonTextChannels
  });
  const { handleCallSignalingEvent } = createRealtimeCallSignalingHandler({
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
  });
  const {
    handleScreenShareStartEvent,
    handleScreenShareStopEvent,
    handleCallMicStateEvent,
    handleCallVideoStateEvent
  } = createRealtimeCallMediaEventHandlers({
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
  });
  const {
    handleChatSendEvent,
    handleChatEditEvent,
    handleChatDeleteEvent,
    handleChatPinEvent,
    handleChatUnpinEvent,
    handleChatReactionAddEvent,
    handleChatReactionRemoveEvent,
    handleChatReportEvent,
    handleChatTopicReadEvent,
    handleChatTypingEvent
  } = createRealtimeChatEventHandlers({
    normalizeRequestId,
    getPayloadString,
    sendNoActiveRoomNack,
    sendValidationNack,
    sendForbiddenNack,
    sendNack,
    incrementMetric,
    sendJson,
    getUserSocketsByUserId: (userId: string) => {
      const normalizedUserId = String(userId || "").trim();
      if (!normalizedUserId) {
        return [];
      }
      return Array.from(socketsByUserId.get(normalizedUserId) || []);
    },
    getSocketRoomId: (socket: WebSocket) => {
      const state = socketState.get(socket);
      return state?.roomId || null;
    },
    sendAckWithMetrics,
    broadcastRoom,
    buildChatMessageEnvelope,
    buildChatEditedEnvelope,
    buildChatDeletedEnvelope,
    buildChatTypingEnvelope,
    redisGet: fastify.redis.get.bind(fastify.redis),
    redisDel: fastify.redis.del.bind(fastify.redis),
    redisSetEx: fastify.redis.setEx.bind(fastify.redis),
    dbQuery: db.query.bind(db)
  });
  const { handleRoomKickEvent, handleRoomMoveMemberEvent } = createRealtimeRoomModerationEventHandlers({
    normalizeRequestId,
    getPayloadString,
    isUserModerator,
    sendValidationNack,
    sendForbiddenNack,
    sendNack,
    sendTargetNotInRoomNack,
    incrementMetric,
    sendAckWithMetrics,
    dbQuery: db.query.bind(db),
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
    rtcFeatureInitialStateReplay: config.rtcFeatureInitialStateReplay,
    incrementMetricBy,
    attachRoomSocket,
    buildRoomJoinedEnvelope,
    buildRoomPresenceEnvelope,
    buildScreenShareStateEnvelope,
    buildCallInitialStateEnvelope
  });
  const { handleMessage } = createRealtimeMessageHandler({
    socketState,
    normalizeRequestId,
    sendJson,
    sendInvalidEnvelopeError,
    sendUnknownEventNack,
    sendAckWithMetrics,
    handleRoomJoinEvent,
    handleRoomLeaveEvent,
    handleRoomKickEvent,
    handleRoomMoveMemberEvent,
    handleChatSendEvent,
    handleChatEditEvent,
    handleChatDeleteEvent,
    handleChatPinEvent,
    handleChatUnpinEvent,
    handleChatReactionAddEvent,
    handleChatReactionRemoveEvent,
    handleChatReportEvent,
    handleChatTopicReadEvent,
    handleChatTypingEvent,
    handleScreenShareStartEvent,
    handleScreenShareStopEvent,
    handleCallMicStateEvent,
    handleCallSignalingEvent,
    handleCallVideoStateEvent,
    logWsError: logWsMessageHandlingFailed
  });

  registerRealtimeWsRoute(fastify, {
    appBuildSha: config.appBuildSha,
    socketState,
    attachUserSocket,
    getAllRoomsPresence,
    handleMessage,
    detachUserSocket,
    markRecentRoomDetach,
    detachRoomSocket,
    clearCanonicalMediaState,
    clearRoomScreenShareOwnerIfMatches,
    broadcastRoom,
    getRoomPresence,
    broadcastAllRoomsPresence,
    socketsByUserId,
    logWsConnectionFailed
  });
}
