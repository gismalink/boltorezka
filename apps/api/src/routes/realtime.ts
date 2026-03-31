import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "ws";
import { db } from "../db.js";
import { config } from "../config.js";
import { registerRealtimeSocket, unregisterRealtimeSocket } from "../realtime-broadcast.js";
import { normalizeRequestId, sendJson, sendNack } from "./realtime-io.js";
import { createRealtimeCallMediaEventHandlers } from "./realtime-call-media-events.js";
import { createRealtimeCallSignalingHandler } from "./realtime-call-signaling.js";
import { createRealtimeChatEventHandlers } from "./realtime-chat-events.js";
import { createRealtimeCallHelpers } from "./realtime-call-helpers.js";
import { closeRealtimeConnection } from "./realtime-lifecycle.js";
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
import { consumeWsTicketAndInitializeConnection } from "./realtime-ws-auth.js";
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
  roomId: string | null;
  roomSlug: string | null;
  roomKind: "text" | "text_voice" | "text_voice_video" | null;
};

type MediaTopology = "livekit";

export async function realtimeRoutes(fastify: FastifyInstance) {
  const socketState = new WeakMap<WebSocket, SocketState>();
  const wsCallDebugEnabled = process.env.WS_CALL_DEBUG === "1";

  const logCallDebug = (message: string, meta: Record<string, unknown> = {}) => {
    if (!wsCallDebugEnabled) {
      return;
    }

    fastify.log.info(
      {
        scope: "ws-call",
        ...meta
      },
      message
    );
  };

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
    handleChatTypingEvent,
    handleScreenShareStartEvent,
    handleScreenShareStopEvent,
    handleCallMicStateEvent,
    handleCallSignalingEvent,
    handleCallVideoStateEvent,
    logWsError: (error) => {
      fastify.log.error(error, "ws message handling failed");
    }
  });

  fastify.get(
    "/v1/realtime/ws",
    {
      websocket: true
    },
    async (connection: WebSocket, request: FastifyRequest) => {
      try {
        const initialized = await consumeWsTicketAndInitializeConnection({
          connection,
          request,
          socketState,
          attachUserSocket,
          registerRealtimeSocket,
          getAllRoomsPresence,
          redisGet: fastify.redis.get.bind(fastify.redis),
          redisDel: fastify.redis.del.bind(fastify.redis),
          redisHSet: fastify.redis.hSet.bind(fastify.redis),
          redisExpire: fastify.redis.expire.bind(fastify.redis)
        });

        if (!initialized) {
          return;
        }

        connection.on("message", async (raw) => {
          await handleMessage(connection, raw);
        });

        connection.on("close", async () => {
          await closeRealtimeConnection({
            connection,
            socketState,
            unregisterRealtimeSocket,
            detachUserSocket,
            markRecentRoomDetach,
            detachRoomSocket,
            clearCanonicalMediaState,
            clearRoomScreenShareOwnerIfMatches,
            broadcastRoom,
            buildPresenceLeftEnvelope,
            getRoomPresence,
            broadcastAllRoomsPresence,
            socketsByUserId,
            redisHSet: fastify.redis.hSet.bind(fastify.redis),
            redisExpire: fastify.redis.expire.bind(fastify.redis)
          });
        });
      } catch (error) {
        fastify.log.error(error, "ws connection failed");
        try {
          connection.close(1011, "Internal error");
        } catch {
          return;
        }
      }
    }
  );
}
