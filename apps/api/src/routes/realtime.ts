import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RawData, WebSocket } from "ws";
import { db } from "../db.js";
import { config } from "../config.js";
import { registerRealtimeSocket, unregisterRealtimeSocket } from "../realtime-broadcast.js";
import { normalizeRequestId, sendAck, sendJson, sendNack } from "./realtime-io.js";
import {
  handleCallMicState,
  handleCallVideoState,
  handleScreenShareStart,
  handleScreenShareStop
} from "./realtime-call-screen.js";
import { handleChatDelete, handleChatEdit, handleChatSend } from "./realtime-chat.js";
import { closeRealtimeConnection, initializeRealtimeConnection } from "./realtime-lifecycle.js";
import { createRealtimeMediaStateStore } from "./realtime-media-state.js";
import { handleRoomKick, handleRoomMoveMember } from "./realtime-moderation.js";
import { createRealtimeRoomStateStore } from "./realtime-room-state.js";
import { buildErrorCorrelationMeta, relayToTargetOrRoom } from "./realtime-relay.js";
import type { RoomRow } from "../db.types.ts";
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
  buildPongEnvelope,
  buildPresenceJoinedEnvelope,
  buildPresenceLeftEnvelope,
  buildRoomJoinedEnvelope,
  buildRoomLeftEnvelope,
  buildRoomPresenceEnvelope,
  buildServerReadyEnvelope,
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

type WsTicketClaims = {
  userId?: string;
  userName?: string;
  name?: string;
  email?: string;
};

type CanJoinRoomResult =
  | { ok: true; room: RoomRow }
  | { ok: false; reason: "RoomNotFound" | "Forbidden" };

type MediaTopology = "livekit";

export async function realtimeRoutes(fastify: FastifyInstance) {
  const socketState = new WeakMap<WebSocket, SocketState>();
  const screenShareOwnerByRoomId = new Map<string, string>();
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

  const incrementMetric = async (name: string) => {
    try {
      const day = new Date().toISOString().slice(0, 10);
      await fastify.redis.hIncrBy(`ws:metrics:${day}`, name, 1);
    } catch {
      return;
    }
  };

  const incrementMetricBy = async (name: string, value: number) => {
    const delta = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    if (delta <= 0) {
      return;
    }

    try {
      const day = new Date().toISOString().slice(0, 10);
      await fastify.redis.hIncrBy(`ws:metrics:${day}`, name, delta);
    } catch {
      return;
    }
  };

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

  const buildScreenShareStateEnvelope = (roomId: string, roomSlug: string | null) => {
    const ownerUserId = screenShareOwnerByRoomId.get(roomId) || null;
    const ownerUserName = ownerUserId
      ? (getRoomPresence(roomId).find((item) => item.userId === ownerUserId)?.userName || null)
      : null;

    return {
      type: "screen.share.state",
      payload: {
        roomId,
        roomSlug,
        active: Boolean(ownerUserId),
        ownerUserId,
        ownerUserName,
        ts: new Date().toISOString()
      }
    };
  };

  const clearRoomScreenShareOwnerIfMatches = (roomId: string, userId: string, roomSlug: string | null) => {
    const currentOwnerUserId = screenShareOwnerByRoomId.get(roomId) || null;
    if (!currentOwnerUserId || currentOwnerUserId !== userId) {
      return;
    }

    screenShareOwnerByRoomId.delete(roomId);
    broadcastRoom(roomId, buildScreenShareStateEnvelope(roomId, roomSlug));
  };


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

  const canJoinRoom = async (roomSlug: string, userId: string): Promise<CanJoinRoomResult> => {
    const room = await db.query<RoomRow>(
      "SELECT id, slug, title, kind, is_public FROM rooms WHERE slug = $1 AND is_archived = FALSE",
      [roomSlug]
    );

    if (room.rowCount === 0) {
      return { ok: false, reason: "RoomNotFound" };
    }

    const selectedRoom = room.rows[0];

    if (!selectedRoom.is_public) {
      const membership = await db.query(
        "SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2",
        [selectedRoom.id, userId]
      );

      if (membership.rowCount === 0) {
        return { ok: false, reason: "Forbidden" };
      }
    }

    await db.query(
      `INSERT INTO room_members (room_id, user_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT (room_id, user_id) DO NOTHING`,
      [selectedRoom.id, userId]
    );

    return {
      ok: true,
      room: selectedRoom
    };
  };

  const sendNoActiveRoomNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta: Record<string, unknown> = {}
  ) => {
    sendNack(
      socket,
      requestId,
      eventType,
      "NoActiveRoom",
      "Join a room first",
      buildErrorCorrelationMeta(socket, socketState, meta)
    );
    void incrementMetric("nack_sent");
  };

  const sendTargetNotInRoomNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta: Record<string, unknown> = {}
  ) => {
    sendNack(
      socket,
      requestId,
      eventType,
      "TargetNotInRoom",
      "Target user is offline or not in this room",
      buildErrorCorrelationMeta(socket, socketState, meta)
    );
    void incrementMetric("nack_sent");
  };

  const sendValidationNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    message: string,
    meta: Record<string, unknown> = {}
  ) => {
    sendNack(
      socket,
      requestId,
      eventType,
      "ValidationError",
      message,
      buildErrorCorrelationMeta(socket, socketState, meta)
    );
    void incrementMetric("nack_sent");
  };

  const sendInvalidEnvelopeError = (socket: WebSocket) => {
    sendJson(socket, buildErrorEnvelope("ValidationError", "Invalid ws envelope", "transport"));
    void incrementMetric("nack_sent");
  };

  const sendUnknownEventNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string
  ) => {
    sendNack(socket, requestId, eventType, "UnknownEvent", "Unsupported event type");
    void incrementMetric("nack_sent");
  };

  const sendJoinDeniedNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    reason: "RoomNotFound" | "Forbidden"
  ) => {
    sendNack(socket, requestId, eventType, reason, "Cannot join room");
    void incrementMetric("nack_sent");
  };

  const sendForbiddenNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    message = "Insufficient permissions"
  ) => {
    sendNack(socket, requestId, eventType, "Forbidden", message);
    void incrementMetric("nack_sent");
  };

  const isUserModerator = async (userId: string) => {
    const result = await db.query<{ role: string }>("SELECT role FROM users WHERE id = $1", [userId]);
    const role = String(result.rows[0]?.role || "").trim();
    return role === "admin" || role === "super_admin";
  };

  const sendAckWithMetrics = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta: Record<string, unknown> = {},
    additionalMetrics: string[] = []
  ) => {
    sendAck(socket, requestId, eventType, meta);
    void incrementMetric("ack_sent");
    for (const metricName of additionalMetrics) {
      void incrementMetric(metricName);
    }
  };

  const buildCallTraceId = (
    eventType: string,
    requestId: string | null,
    sessionId: string
  ): string => {
    if (requestId) {
      return `${eventType}:${sessionId}:${requestId}`;
    }

    return `${eventType}:${sessionId}:${Date.now()}`;
  };

  fastify.get(
    "/v1/realtime/ws",
    {
      websocket: true
    },
    async (connection: WebSocket, request: FastifyRequest) => {
      try {
        const url = new URL(request.url, "http://localhost");
        const ticket = url.searchParams.get("ticket");

        if (!ticket) {
          sendJson(connection, buildErrorEnvelope("MissingTicket", "ticket query param is required", "auth"));
          connection.close(4001, "Missing ticket");
          return;
        }

        const ticketKey = `ws:ticket:${ticket}`;
        const ticketPayload = await fastify.redis.get(ticketKey);

        if (!ticketPayload) {
          sendJson(connection, buildErrorEnvelope("InvalidTicket", "WebSocket ticket is invalid or expired", "auth"));
          connection.close(4002, "Invalid ticket");
          return;
        }

        await fastify.redis.del(ticketKey);

        let claims: WsTicketClaims;
        try {
          claims = JSON.parse(ticketPayload);
        } catch {
          sendJson(connection, buildErrorEnvelope("InvalidTicket", "Ticket payload is corrupted", "auth"));
          connection.close(4003, "Invalid ticket");
          return;
        }

        const userId = claims.userId;

        if (!userId) {
          sendJson(connection, buildErrorEnvelope("InvalidTicket", "Ticket subject is missing", "auth"));
          connection.close(4004, "Invalid ticket");
          return;
        }

        const userName = claims.userName || claims.name || claims.email || "unknown";

        await initializeRealtimeConnection({
          connection,
          userId,
          userName,
          socketState,
          attachUserSocket,
          registerRealtimeSocket,
          redisHSet: fastify.redis.hSet.bind(fastify.redis),
          redisExpire: fastify.redis.expire.bind(fastify.redis),
          sendJson,
          buildServerReadyEnvelope,
          buildRoomsPresenceEnvelope,
          getAllRoomsPresence
        });

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
                const roomSlug = getPayloadString(payload, "roomSlug", 80);

                if (!roomSlug) {
                  sendValidationNack(connection, requestId, eventType, "roomSlug is required");
                  return;
                }

                const joinResult = await canJoinRoom(roomSlug, state.userId);
                const traceId = buildCallTraceId(eventType, requestId, state.sessionId);

                if (!joinResult.ok) {
                  sendJoinDeniedNack(connection, requestId, eventType, joinResult.reason);
                  return;
                }

                if (state.roomId) {
                  markRecentRoomDetach(state.roomId, state.userId);
                  detachRoomSocket(state.roomId, connection);
                  clearCanonicalMediaState(state.roomId, state.userId);
                  broadcastRoom(
                    state.roomId,
                    buildPresenceLeftEnvelope(
                      state.userId,
                      state.userName,
                      state.roomSlug,
                      0,
                      {
                        requestId,
                        sessionId: state.sessionId,
                        traceId
                      }
                    ),
                    connection
                  );
                  broadcastAllRoomsPresence();
                }

                if (joinResult.room.kind !== "text") {
                  evictUserFromOtherNonTextChannels(state.userId, connection);
                }

                const roomMediaTopology = resolveRoomMediaTopology(joinResult.room.slug, state.userId);
                const reconnected = consumeRecentReconnectMark(joinResult.room.id, state.userId);
                state.roomId = joinResult.room.id;
                state.roomSlug = joinResult.room.slug;
                state.roomKind = joinResult.room.kind;
                attachRoomSocket(joinResult.room.id, connection);

                if (reconnected) {
                  void incrementMetric("call_reconnect_joined");
                }

                sendJson(
                  connection,
                  buildRoomJoinedEnvelope(
                    joinResult.room.id,
                    joinResult.room.slug,
                    joinResult.room.title,
                    roomMediaTopology,
                    {
                      requestId,
                      sessionId: state.sessionId,
                      traceId
                    },
                    reconnected
                  )
                );

                sendAckWithMetrics(
                  connection,
                  requestId,
                  eventType,
                  {
                    roomId: joinResult.room.id,
                    roomSlug: joinResult.room.slug,
                    mediaTopology: roomMediaTopology,
                    sessionId: state.sessionId,
                    traceId,
                    reconnect: reconnected
                  }
                );

                sendJson(connection, buildScreenShareStateEnvelope(joinResult.room.id, joinResult.room.slug));

                sendJson(
                  connection,
                  buildRoomPresenceEnvelope(
                    joinResult.room.id,
                    joinResult.room.slug,
                    getRoomPresence(joinResult.room.id),
                    roomMediaTopology,
                    {
                      requestId,
                      sessionId: state.sessionId,
                      traceId
                    }
                  )
                );

                if (config.rtcFeatureInitialStateReplay) {
                  const initialStateParticipants = getCallInitialStateParticipants(joinResult.room.id);
                  const initialStateLagStats = getCallInitialStateLagStats(joinResult.room.id);
                  sendJson(
                    connection,
                    buildCallInitialStateEnvelope(
                      joinResult.room.id,
                      joinResult.room.slug,
                      initialStateParticipants
                    )
                  );
                  void incrementMetric("call_initial_state_sent");
                  void incrementMetricBy("call_initial_state_participants_total", initialStateParticipants.length);
                  void incrementMetricBy("call_initial_state_lag_ms_total", initialStateLagStats.totalLagMs);
                  void incrementMetricBy("call_initial_state_lag_samples", initialStateLagStats.count);
                }

                broadcastRoom(
                  joinResult.room.id,
                  buildPresenceJoinedEnvelope(
                    state.userId,
                    state.userName,
                    joinResult.room.slug,
                    getRoomPresence(joinResult.room.id).length,
                    {
                      requestId,
                      sessionId: state.sessionId,
                      traceId
                    }
                  ),
                  connection
                );

                broadcastAllRoomsPresence();

                return;
              }

              case "room.leave": {
                if (!state.roomId || !state.roomSlug) {
                  sendNoActiveRoomNack(connection, requestId, eventType);
                  return;
                }
                const traceId = buildCallTraceId(eventType, requestId, state.sessionId);

                const previousRoomId = state.roomId;
                const previousRoomSlug = state.roomSlug;

                markRecentRoomDetach(previousRoomId, state.userId);
                detachRoomSocket(previousRoomId, connection);
                clearCanonicalMediaState(previousRoomId, state.userId);
                clearRoomScreenShareOwnerIfMatches(previousRoomId, state.userId, previousRoomSlug);
                state.roomId = null;
                state.roomSlug = null;
                state.roomKind = null;

                sendJson(
                  connection,
                  buildRoomLeftEnvelope(previousRoomId, previousRoomSlug, {
                    requestId,
                    sessionId: state.sessionId,
                    traceId
                  })
                );
                sendAckWithMetrics(connection, requestId, eventType, {
                  roomId: previousRoomId,
                  roomSlug: previousRoomSlug,
                  sessionId: state.sessionId,
                  traceId
                });

                broadcastRoom(
                  previousRoomId,
                  buildPresenceLeftEnvelope(
                    state.userId,
                    state.userName,
                    previousRoomSlug,
                    getRoomPresence(previousRoomId).length,
                    {
                      requestId,
                      sessionId: state.sessionId,
                      traceId
                    }
                  ),
                  connection
                );

                broadcastAllRoomsPresence();

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

              case "call.video_state": {
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
