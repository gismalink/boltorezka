import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RawData, WebSocket } from "ws";
import { db } from "../db.js";
import { config } from "../config.js";
import { registerRealtimeSocket, unregisterRealtimeSocket } from "../realtime-broadcast.js";
import { normalizeRequestId, sendJson, sendNack } from "./realtime-io.js";
import {
  handleCallMicState,
  handleCallVideoState,
  handleScreenShareStart,
  handleScreenShareStop
} from "./realtime-call-screen.js";
import { createRealtimeCallSignalingHandler } from "./realtime-call-signaling.js";
import { handleChatDelete, handleChatEdit, handleChatSend, handleChatTyping } from "./realtime-chat.js";
import { createRealtimeCallHelpers } from "./realtime-call-helpers.js";
import { closeRealtimeConnection } from "./realtime-lifecycle.js";
import { createRealtimeMediaStateStore } from "./realtime-media-state.js";
import { handleRoomKick, handleRoomMoveMember } from "./realtime-moderation.js";
import { createRealtimeMetrics } from "./realtime-metrics.js";
import { createRealtimeNackSenders } from "./realtime-nacks.js";
import { createRealtimePermissionHelpers } from "./realtime-permissions.js";
import { createRealtimeRoomEventHandlers } from "./realtime-room-events.js";
import { buildRealtimeScreenShareStateStore } from "./realtime-screen-share-state.js";
import { createRealtimeRoomStateStore } from "./realtime-room-state.js";
import { relayToTargetOrRoom } from "./realtime-relay.js";
import { consumeWsTicketAndInitializeConnection } from "./realtime-ws-auth.js";
import {
  buildRoomsPresenceEnvelope,
  asKnownWsIncomingEnvelope,
  buildCallInitialStateEnvelope,
  buildCallMicStateRelayEnvelope,
  buildCallVideoStateRelayEnvelope,
  buildChatDeletedEnvelope,
  buildChatEditedEnvelope,
  buildChatMessageEnvelope,
  buildErrorEnvelope,
  buildChatTypingEnvelope,
  buildPongEnvelope,
  buildPresenceJoinedEnvelope,
  buildPresenceLeftEnvelope,
  buildRoomJoinedEnvelope,
  buildRoomLeftEnvelope,
  buildRoomPresenceEnvelope,
  getPayloadString,
  parseWsIncomingEnvelope
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


  const evictUserFromOtherNonTextChannels = (userId: string, keepSocket: WebSocket) => {
    const userSockets = socketsByUserId.get(userId);
    if (!userSockets) {
      return;
    }

    let didChange = false;

    for (const socket of userSockets) {
      if (socket === keepSocket) {
        continue;
      }

      const state = socketState.get(socket);
      if (!state || !state.roomId || !state.roomSlug || !state.roomKind || state.roomKind === "text") {
        continue;
      }

      const previousRoomId = state.roomId;
      const previousRoomSlug = state.roomSlug;

      detachRoomSocket(previousRoomId, socket);
      clearCanonicalMediaState(previousRoomId, state.userId);
      state.roomId = null;
      state.roomSlug = null;
      state.roomKind = null;

      sendJson(socket, buildRoomLeftEnvelope(previousRoomId, previousRoomSlug));
      sendJson(
        socket,
        buildErrorEnvelope(
          "ChannelSessionMoved",
          "You were disconnected from this channel because your account joined another channel elsewhere",
          "topology"
        )
      );

      broadcastRoom(
        previousRoomId,
        buildPresenceLeftEnvelope(
          state.userId,
          state.userName,
          previousRoomSlug,
          getRoomPresence(previousRoomId).length
        ),
        socket
      );

      didChange = true;
    }

    if (didChange) {
      broadcastAllRoomsPresence();
    }
  };

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

        connection.on("message", async (raw: RawData) => {
          try {
            const message = parseWsIncomingEnvelope(raw);
            if (!message) {
              sendInvalidEnvelopeError(connection);
              return;
            }

            const state = socketState.get(connection);
            const requestId = normalizeRequestId(message.requestId);
            const eventType = message.type;
            const payload = message.payload;
            const knownMessage = asKnownWsIncomingEnvelope(message);

            if (!state) {
              return;
            }

            if (!knownMessage) {
              sendUnknownEventNack(connection, requestId, eventType);
              return;
            }

            switch (knownMessage.type) {
              case "ping": {
                sendJson(connection, buildPongEnvelope());
                sendAckWithMetrics(connection, requestId, eventType);
                return;
              }

              case "room.join": {
                await handleRoomJoinEvent(connection, state, payload, requestId, eventType);
                return;
              }

              case "room.leave": {
                handleRoomLeaveEvent(connection, state, requestId, eventType);
                return;
              }

              case "room.kick": {
                await handleRoomKick({
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
                return;
              }

              case "room.move_member": {
                await handleRoomMoveMember({
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
                return;
              }

              case "chat.send": {
                await handleChatSend({
                  connection,
                  state,
                  payload,
                  requestId,
                  eventType,
                  incomingIdempotencyKey: knownMessage.idempotencyKey,
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

                return;
              }

              case "chat.edit": {
                await handleChatEdit({
                  connection,
                  state,
                  payload,
                  requestId,
                  eventType,
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
                return;
              }

              case "chat.delete": {
                await handleChatDelete({
                  connection,
                  state,
                  payload,
                  requestId,
                  eventType,
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
                return;
              }

              case "chat.typing": {
                await handleChatTyping({
                  connection,
                  state,
                  payload,
                  requestId,
                  eventType,
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
                return;
              }

              case "screen.share.start": {
                handleScreenShareStart({
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
                  knownMessageType: knownMessage.type,
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
                return;
              }

              case "screen.share.stop": {
                handleScreenShareStop({
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
                  knownMessageType: knownMessage.type,
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
                return;
              }

              case "call.mic_state": {
                if (await handleCallIdempotency(connection, state, requestId, eventType)) {
                  return;
                }

                handleCallMicState({
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
                  knownMessageType: knownMessage.type,
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
                return;
              }

              case "call.offer":
              case "call.answer":
              case "call.ice": {
                await handleCallSignalingEvent(
                  connection,
                  state,
                  payload,
                  requestId,
                  eventType,
                  knownMessage.type
                );
                return;
              }

              case "call.video_state": {
                if (await handleCallIdempotency(connection, state, requestId, eventType)) {
                  return;
                }

                handleCallVideoState({
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
                  knownMessageType: knownMessage.type,
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
                return;
              }
            }
          } catch (error) {
            fastify.log.error(error, "ws message handling failed");
            sendJson(connection, buildErrorEnvelope("ServerError", "Failed to process event"));
          }
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
