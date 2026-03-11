import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RawData, WebSocket } from "ws";
import { db } from "../db.js";
import { config } from "../config.js";
import { registerRealtimeSocket, unregisterRealtimeSocket } from "../realtime-broadcast.js";
import { normalizeRequestId, sendAck, sendJson, sendNack } from "./realtime-io.js";
import { createRealtimeMediaStateStore } from "./realtime-media-state.js";
import { handleRoomKick, handleRoomMoveMember } from "./realtime-moderation.js";
import { createRealtimeRoomStateStore } from "./realtime-room-state.js";
import { buildErrorCorrelationMeta, relayToTargetOrRoom } from "./realtime-relay.js";
import type { InsertedMessageRow, RoomRow } from "../db.types.ts";
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

        socketState.set(connection, {
          sessionId: crypto.randomUUID(),
          userId,
          userName,
          roomId: null,
          roomSlug: null,
          roomKind: null
        });

        attachUserSocket(userId, connection);
        registerRealtimeSocket(connection);

        await fastify.redis.hSet(`presence:user:${userId}`, {
          online: "1",
          updatedAt: new Date().toISOString()
        });
        await fastify.redis.expire(`presence:user:${userId}`, 120);

        sendJson(connection, buildServerReadyEnvelope(userId, userName));
        sendJson(connection, buildRoomsPresenceEnvelope(getAllRoomsPresence(userId)));

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
                if (!state.roomId) {
                  sendNoActiveRoomNack(connection, requestId, eventType);
                  return;
                }

                const text = getPayloadString(payload, "text", 20000);

                if (!text) {
                  sendValidationNack(connection, requestId, eventType, "Message text is required");
                  return;
                }

                const idempotencyKey = normalizeRequestId(knownMessage.idempotencyKey) || requestId;

                if (idempotencyKey) {
                  const idemRedisKey = `ws:idempotency:${state.userId}:${idempotencyKey}`;
                  const cachedPayloadRaw = await fastify.redis.get(idemRedisKey);

                  if (cachedPayloadRaw) {
                    try {
                      const cachedPayload = JSON.parse(cachedPayloadRaw);
                      sendJson(connection, buildChatMessageEnvelope(cachedPayload));
                    } catch {
                      await fastify.redis.del(idemRedisKey);
                    }

                    sendAckWithMetrics(
                      connection,
                      requestId,
                      eventType,
                      {
                        duplicate: true,
                        idempotencyKey
                      },
                      ["chat_idempotency_hit"]
                    );
                    return;
                  }
                }

                const inserted = await db.query<InsertedMessageRow>(
                  `INSERT INTO messages (room_id, user_id, body)
                   VALUES ($1, $2, $3)
                   RETURNING id, room_id, user_id, body, created_at`,
                  [state.roomId, state.userId, text]
                );

                const chatMessage = inserted.rows[0];

                const chatPayload = {
                  id: chatMessage.id,
                  roomId: chatMessage.room_id,
                  roomSlug: state.roomSlug,
                  userId: chatMessage.user_id,
                  userName: state.userName,
                  text: chatMessage.body,
                  createdAt: chatMessage.created_at,
                  senderRequestId: requestId || null
                };

                if (idempotencyKey) {
                  await fastify.redis.setEx(
                    `ws:idempotency:${state.userId}:${idempotencyKey}`,
                    120,
                    JSON.stringify(chatPayload)
                  );
                }

                broadcastRoom(state.roomId, buildChatMessageEnvelope(chatPayload));

                sendAckWithMetrics(
                  connection,
                  requestId,
                  eventType,
                  {
                    messageId: chatMessage.id,
                    idempotencyKey: idempotencyKey || null
                  },
                  ["chat_sent"]
                );

                return;
              }

              case "chat.edit": {
                if (!state.roomId) {
                  sendNoActiveRoomNack(connection, requestId, eventType);
                  return;
                }

                const messageId = normalizeRequestId(getPayloadString(payload, "messageId", 128));
                const text = getPayloadString(payload, "text", 20000);
                if (!messageId || !text) {
                  sendValidationNack(connection, requestId, eventType, "messageId and text are required");
                  return;
                }

                const existingMessage = await db.query<{
                  id: string;
                  room_id: string;
                  user_id: string;
                  created_at: string;
                }>(
                  `SELECT id, room_id, user_id, created_at
                   FROM messages
                   WHERE id = $1 AND room_id = $2
                   LIMIT 1`,
                  [messageId, state.roomId]
                );

                if ((existingMessage.rowCount || 0) === 0) {
                  sendNack(connection, requestId, eventType, "MessageNotFound", "Message not found");
                  void incrementMetric("nack_sent");
                  return;
                }

                const messageRow = existingMessage.rows[0];
                if (messageRow.user_id !== state.userId) {
                  sendForbiddenNack(connection, requestId, eventType, "You can edit only your own messages");
                  return;
                }

                const createdAtTs = Number(new Date(messageRow.created_at));
                const withinWindow = Number.isFinite(createdAtTs) && Date.now() - createdAtTs <= 10 * 60 * 1000;
                if (!withinWindow) {
                  sendNack(connection, requestId, eventType, "EditWindowExpired", "Message edit window has expired");
                  void incrementMetric("nack_sent");
                  return;
                }

                const updated = await db.query<{
                  id: string;
                  room_id: string;
                  body: string;
                  updated_at: string;
                }>(
                  `UPDATE messages
                   SET body = $1, updated_at = NOW()
                   WHERE id = $2 AND room_id = $3
                   RETURNING id, room_id, body, updated_at`,
                  [text, messageId, state.roomId]
                );

                if ((updated.rowCount || 0) === 0) {
                  sendNack(connection, requestId, eventType, "MessageNotFound", "Message not found");
                  void incrementMetric("nack_sent");
                  return;
                }

                const updatedMessage = updated.rows[0];
                broadcastRoom(
                  state.roomId,
                  buildChatEditedEnvelope({
                    id: updatedMessage.id,
                    roomId: updatedMessage.room_id,
                    roomSlug: state.roomSlug,
                    text: updatedMessage.body,
                    editedAt: updatedMessage.updated_at,
                    editedByUserId: state.userId
                  })
                );

                sendAckWithMetrics(connection, requestId, eventType, {
                  messageId: updatedMessage.id
                });
                return;
              }

              case "chat.delete": {
                if (!state.roomId) {
                  sendNoActiveRoomNack(connection, requestId, eventType);
                  return;
                }

                const messageId = normalizeRequestId(getPayloadString(payload, "messageId", 128));
                if (!messageId) {
                  sendValidationNack(connection, requestId, eventType, "messageId is required");
                  return;
                }

                const existingMessage = await db.query<{
                  id: string;
                  room_id: string;
                  user_id: string;
                  created_at: string;
                }>(
                  `SELECT id, room_id, user_id, created_at
                   FROM messages
                   WHERE id = $1 AND room_id = $2
                   LIMIT 1`,
                  [messageId, state.roomId]
                );

                if ((existingMessage.rowCount || 0) === 0) {
                  sendNack(connection, requestId, eventType, "MessageNotFound", "Message not found");
                  void incrementMetric("nack_sent");
                  return;
                }

                const messageRow = existingMessage.rows[0];
                if (messageRow.user_id !== state.userId) {
                  sendForbiddenNack(connection, requestId, eventType, "You can delete only your own messages");
                  return;
                }

                const createdAtTs = Number(new Date(messageRow.created_at));
                const withinWindow = Number.isFinite(createdAtTs) && Date.now() - createdAtTs <= 10 * 60 * 1000;
                if (!withinWindow) {
                  sendNack(connection, requestId, eventType, "DeleteWindowExpired", "Message delete window has expired");
                  void incrementMetric("nack_sent");
                  return;
                }

                const deleted = await db.query<{ id: string; room_id: string }>(
                  `DELETE FROM messages
                   WHERE id = $1 AND room_id = $2
                   RETURNING id, room_id`,
                  [messageId, state.roomId]
                );

                if ((deleted.rowCount || 0) === 0) {
                  sendNack(connection, requestId, eventType, "MessageNotFound", "Message not found");
                  void incrementMetric("nack_sent");
                  return;
                }

                const deletedMessage = deleted.rows[0];
                broadcastRoom(
                  state.roomId,
                  buildChatDeletedEnvelope({
                    id: deletedMessage.id,
                    roomId: deletedMessage.room_id,
                    roomSlug: state.roomSlug,
                    deletedByUserId: state.userId,
                    ts: new Date().toISOString()
                  })
                );

                sendAckWithMetrics(connection, requestId, eventType, {
                  messageId: deletedMessage.id
                });
                return;
              }

              case "screen.share.start": {
                if (!state.roomId || !state.roomSlug) {
                  sendNoActiveRoomNack(connection, requestId, eventType);
                  return;
                }

                const currentOwnerUserId = screenShareOwnerByRoomId.get(state.roomId) || null;
                if (currentOwnerUserId && currentOwnerUserId !== state.userId) {
                  sendNack(
                    connection,
                    requestId,
                    eventType,
                    "ScreenShareAlreadyActive",
                    "Another user is already sharing the screen",
                    {
                      roomId: state.roomId,
                      roomSlug: state.roomSlug,
                      ownerUserId: currentOwnerUserId
                    }
                  );
                  void incrementMetric("nack_sent");
                  return;
                }

                screenShareOwnerByRoomId.set(state.roomId, state.userId);
                const envelope = buildScreenShareStateEnvelope(state.roomId, state.roomSlug);
                broadcastRoom(state.roomId, envelope);
                sendAckWithMetrics(connection, requestId, eventType, {
                  roomId: state.roomId,
                  roomSlug: state.roomSlug,
                  ownerUserId: state.userId
                });
                return;
              }

              case "screen.share.stop": {
                if (!state.roomId || !state.roomSlug) {
                  sendNoActiveRoomNack(connection, requestId, eventType);
                  return;
                }

                const currentOwnerUserId = screenShareOwnerByRoomId.get(state.roomId) || null;
                if (currentOwnerUserId && currentOwnerUserId !== state.userId) {
                  sendForbiddenNack(connection, requestId, eventType, "Only current screen-share owner can stop it");
                  return;
                }

                if (currentOwnerUserId === state.userId) {
                  screenShareOwnerByRoomId.delete(state.roomId);
                  broadcastRoom(state.roomId, buildScreenShareStateEnvelope(state.roomId, state.roomSlug));
                }

                sendAckWithMetrics(connection, requestId, eventType, {
                  roomId: state.roomId,
                  roomSlug: state.roomSlug,
                  stopped: currentOwnerUserId === state.userId
                });
                return;
              }

              case "call.mic_state": {
              if (!state.roomId) {
                logCallDebug("call mic_state rejected: no active room", {
                  eventType,
                  userId: state.userId,
                  requestId
                });
                sendNoActiveRoomNack(connection, requestId, eventType);
                return;
              }

              const mutedRaw = payload?.muted;
              if (typeof mutedRaw !== "boolean") {
                logCallDebug("call mic_state rejected: missing muted boolean", {
                  eventType,
                  userId: state.userId,
                  roomId: state.roomId,
                  roomSlug: state.roomSlug,
                  requestId
                });
                sendValidationNack(connection, requestId, eventType, "payload.muted boolean is required");
                return;
              }
              const speakingRaw = payload?.speaking;
              const audioMutedRaw = payload?.audioMuted;
              const speaking = typeof speakingRaw === "boolean" ? speakingRaw : undefined;
              const audioMuted = typeof audioMutedRaw === "boolean" ? audioMutedRaw : undefined;
              const traceId = buildCallTraceId(eventType, requestId, state.sessionId);

              setCanonicalMediaState(state.roomId, state.userId, {
                muted: mutedRaw,
                speaking: speaking ?? false,
                audioMuted: audioMuted ?? false
              });

              const targetUserId = normalizeRequestId(getPayloadString(payload, "targetUserId", 128)) || null;
              logCallDebug("call mic_state received", {
                eventType,
                userId: state.userId,
                sessionId: state.sessionId,
                traceId,
                roomId: state.roomId,
                roomSlug: state.roomSlug,
                requestId,
                targetUserId,
                muted: mutedRaw,
                speaking: speaking ?? null,
                audioMuted: audioMuted ?? null
              });
              const relayEnvelope = buildCallMicStateRelayEnvelope(
                knownMessage.type,
                requestId,
                state.sessionId,
                traceId,
                state.userId,
                state.userName,
                state.roomId,
                state.roomSlug,
                targetUserId,
                { muted: mutedRaw, speaking, audioMuted }
              );

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
                logCallDebug("call mic_state relay failed: target not in room", {
                  eventType,
                  userId: state.userId,
                  sessionId: state.sessionId,
                  traceId,
                  roomId: state.roomId,
                  roomSlug: state.roomSlug,
                  requestId,
                  targetUserId,
                  relayedTo: relayOutcome.relayedCount
                });
                sendTargetNotInRoomNack(connection, requestId, eventType);
                void incrementMetric("call_mic_state_target_miss");
                return;
              }

              logCallDebug("call mic_state relayed", {
                eventType,
                userId: state.userId,
                sessionId: state.sessionId,
                traceId,
                roomId: state.roomId,
                roomSlug: state.roomSlug,
                requestId,
                targetUserId,
                relayedTo: relayOutcome.relayedCount,
                muted: mutedRaw,
                speaking: speaking ?? null,
                audioMuted: audioMuted ?? null
              });

              sendAckWithMetrics(
                connection,
                requestId,
                eventType,
                {
                  relayedTo: relayOutcome.relayedCount,
                  targetUserId,
                  muted: mutedRaw,
                  speaking: speaking ?? null,
                  audioMuted: audioMuted ?? null
                }
              );
              return;
              }

              case "call.video_state": {
              if (!state.roomId) {
                logCallDebug("call video_state rejected: no active room", {
                  eventType,
                  userId: state.userId,
                  requestId
                });
                sendNoActiveRoomNack(connection, requestId, eventType);
                return;
              }

              const settingsRaw = payload?.settings;
              if (!settingsRaw || typeof settingsRaw !== "object" || Array.isArray(settingsRaw)) {
                logCallDebug("call video_state rejected: invalid settings payload", {
                  eventType,
                  userId: state.userId,
                  roomId: state.roomId,
                  roomSlug: state.roomSlug,
                  requestId
                });
                sendValidationNack(connection, requestId, eventType, "payload.settings object is required");
                return;
              }

              const targetUserId = normalizeRequestId(getPayloadString(payload, "targetUserId", 128)) || null;

              const localVideoEnabledRaw = (settingsRaw as Record<string, unknown>).localVideoEnabled;
              if (typeof localVideoEnabledRaw === "boolean") {
                setCanonicalMediaState(state.roomId, state.userId, {
                  localVideoEnabled: localVideoEnabledRaw
                });
              }
              const traceId = buildCallTraceId(eventType, requestId, state.sessionId);

              const relayEnvelope = buildCallVideoStateRelayEnvelope(
                knownMessage.type,
                requestId,
                state.sessionId,
                traceId,
                state.userId,
                state.userName,
                state.roomId,
                state.roomSlug,
                targetUserId,
                settingsRaw as Record<string, unknown>
              );

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
                logCallDebug("call video_state relay failed: target not in room", {
                  eventType,
                  userId: state.userId,
                  sessionId: state.sessionId,
                  traceId,
                  roomId: state.roomId,
                  roomSlug: state.roomSlug,
                  requestId,
                  targetUserId,
                  relayedTo: relayOutcome.relayedCount
                });
                sendTargetNotInRoomNack(connection, requestId, eventType);
                void incrementMetric("call_video_state_target_miss");
                return;
              }

              logCallDebug("call video_state relayed", {
                eventType,
                userId: state.userId,
                sessionId: state.sessionId,
                traceId,
                roomId: state.roomId,
                roomSlug: state.roomSlug,
                requestId,
                targetUserId,
                relayedTo: relayOutcome.relayedCount
              });

              sendAckWithMetrics(
                connection,
                requestId,
                eventType,
                {
                  relayedTo: relayOutcome.relayedCount,
                  targetUserId
                }
              );
              return;
              }
            }
          } catch (error) {
            fastify.log.error(error, "ws message handling failed");
            sendJson(connection, buildErrorEnvelope("ServerError", "Failed to process event"));
          }
        });

        connection.on("close", async () => {
          const state = socketState.get(connection);
          unregisterRealtimeSocket(connection);
          if (!state) {
            return;
          }

          detachUserSocket(state.userId, connection);

          if (state.roomId) {
            markRecentRoomDetach(state.roomId, state.userId);
            detachRoomSocket(state.roomId, connection);
            clearCanonicalMediaState(state.roomId, state.userId);
            clearRoomScreenShareOwnerIfMatches(state.roomId, state.userId, state.roomSlug);
            broadcastRoom(
              state.roomId,
              buildPresenceLeftEnvelope(
                state.userId,
                state.userName,
                state.roomSlug,
                getRoomPresence(state.roomId).length
              )
            );
            broadcastAllRoomsPresence();
          }

          const userSockets = socketsByUserId.get(state.userId);
          if (!userSockets || userSockets.size === 0) {
            await fastify.redis.hSet(`presence:user:${state.userId}`, {
              online: "0",
              updatedAt: new Date().toISOString()
            });
            await fastify.redis.expire(`presence:user:${state.userId}`, 120);
          }
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
