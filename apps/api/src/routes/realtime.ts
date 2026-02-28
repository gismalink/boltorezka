import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RawData, WebSocket } from "ws";
import { db } from "../db.js";
import type { InsertedMessageRow, RoomRow } from "../db.types.ts";
import {
  buildRoomsPresenceEnvelope,
  asKnownWsIncomingEnvelope,
  buildAckEnvelope,
  buildCallSignalRelayEnvelope,
  buildCallTerminalRelayEnvelope,
  buildChatMessageEnvelope,
  buildErrorEnvelope,
  buildNackEnvelope,
  buildPongEnvelope,
  buildPresenceJoinedEnvelope,
  buildPresenceLeftEnvelope,
  buildRoomJoinedEnvelope,
  buildRoomLeftEnvelope,
  buildRoomPresenceEnvelope,
  buildServerReadyEnvelope,
  getCallSignal,
  getPayloadString,
  parseWsIncomingEnvelope
} from "../ws-protocol.js";
type SocketState = {
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

type RelayOutcome = {
  ok: boolean;
  relayedCount: number;
};

function sendJson(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function normalizeRequestId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, 128);
}

function sendAck(socket: WebSocket, requestId: string | null, eventType: string, meta: Record<string, unknown> = {}) {
  if (!requestId) {
    return;
  }

  sendJson(socket, buildAckEnvelope(requestId, eventType, meta));
}

function sendNack(socket: WebSocket, requestId: string | null, eventType: string, code: string, message: string) {
  if (!requestId) {
    sendJson(socket, buildErrorEnvelope(code, message));
    return;
  }

  sendJson(socket, buildNackEnvelope(requestId, eventType, code, message));
}

function safeJsonSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export async function realtimeRoutes(fastify: FastifyInstance) {
  const socketsByUserId = new Map<string, Set<WebSocket>>();
  const socketsByRoomId = new Map<string, Set<WebSocket>>();
  const socketState = new WeakMap<WebSocket, SocketState>();

  const incrementMetric = async (name: string) => {
    try {
      const day = new Date().toISOString().slice(0, 10);
      await fastify.redis.hIncrBy(`ws:metrics:${day}`, name, 1);
    } catch {
      return;
    }
  };

  const attachUserSocket = (userId: string, socket: WebSocket) => {
    const userSockets = socketsByUserId.get(userId) || new Set();
    userSockets.add(socket);
    socketsByUserId.set(userId, userSockets);
  };

  const detachUserSocket = (userId: string, socket: WebSocket) => {
    const userSockets = socketsByUserId.get(userId);
    if (!userSockets) {
      return;
    }
    userSockets.delete(socket);
    if (userSockets.size === 0) {
      socketsByUserId.delete(userId);
    }
  };

  const attachRoomSocket = (roomId: string, socket: WebSocket) => {
    const roomSockets = socketsByRoomId.get(roomId) || new Set();
    roomSockets.add(socket);
    socketsByRoomId.set(roomId, roomSockets);
  };

  const detachRoomSocket = (roomId: string, socket: WebSocket) => {
    const roomSockets = socketsByRoomId.get(roomId);
    if (!roomSockets) {
      return;
    }
    roomSockets.delete(socket);
    if (roomSockets.size === 0) {
      socketsByRoomId.delete(roomId);
    }
  };

  const broadcastRoom = (roomId: string, payload: unknown, excludedSocket: WebSocket | null = null) => {
    const roomSockets = socketsByRoomId.get(roomId);
    if (!roomSockets) {
      return;
    }

    for (const socket of roomSockets) {
      if (socket !== excludedSocket) {
        sendJson(socket, payload);
      }
    }
  };

  const getRoomPresence = (roomId: string) => {
    const roomSockets = socketsByRoomId.get(roomId);
    if (!roomSockets) {
      return [];
    }

    const seen = new Set();
    const users = [];

    for (const socket of roomSockets) {
      const state = socketState.get(socket);
      if (!state || seen.has(state.userId)) {
        continue;
      }

      seen.add(state.userId);
      users.push({ userId: state.userId, userName: state.userName });
    }

    return users;
  };

  const getAllRoomsPresence = () => {
    const result: Array<{ roomId: string; roomSlug: string; users: Array<{ userId: string; userName: string }> }> = [];

    for (const [roomId, roomSockets] of socketsByRoomId.entries()) {
      let roomSlug: string | null = null;
      for (const socket of roomSockets) {
        const state = socketState.get(socket);
        if (state?.roomSlug) {
          roomSlug = state.roomSlug;
          break;
        }
      }

      if (!roomSlug) {
        continue;
      }

      result.push({
        roomId,
        roomSlug,
        users: getRoomPresence(roomId)
      });
    }

    return result;
  };

  const broadcastAllRoomsPresence = () => {
    const envelope = buildRoomsPresenceEnvelope(getAllRoomsPresence());
    const seen = new Set<WebSocket>();

    for (const userSockets of socketsByUserId.values()) {
      for (const socket of userSockets) {
        if (seen.has(socket)) {
          continue;
        }
        seen.add(socket);
        sendJson(socket, envelope);
      }
    }
  };

  const getUserRoomSockets = (userId: string, roomId: string) => {
    const userSockets = socketsByUserId.get(userId);
    if (!userSockets) {
      return [];
    }

    const result = [];
    for (const socket of userSockets) {
      const state = socketState.get(socket);
      if (!state) {
        continue;
      }
      if (state.roomId === roomId) {
        result.push(socket);
      }
    }

    return result;
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
      state.roomId = null;
      state.roomSlug = null;
      state.roomKind = null;

      sendJson(socket, buildRoomLeftEnvelope(previousRoomId, previousRoomSlug));
      sendJson(
        socket,
        buildErrorEnvelope(
          "ChannelSessionMoved",
          "You were disconnected from this channel because your account joined another channel elsewhere"
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

  const relayToTargetOrRoom = (
    senderSocket: WebSocket,
    roomId: string,
    targetUserId: string | null,
    relayEnvelope: unknown
  ): RelayOutcome => {
    let relayedCount = 0;

    if (targetUserId) {
      const targetSockets = getUserRoomSockets(targetUserId, roomId);
      for (const targetSocket of targetSockets) {
        if (targetSocket === senderSocket) {
          continue;
        }

        sendJson(targetSocket, relayEnvelope);
        relayedCount += 1;
      }

      if (relayedCount === 0) {
        return { ok: false, relayedCount };
      }

      return { ok: true, relayedCount };
    }

    const roomSockets = socketsByRoomId.get(roomId) || new Set();
    for (const roomSocket of roomSockets) {
      if (roomSocket === senderSocket) {
        continue;
      }

      sendJson(roomSocket, relayEnvelope);
      relayedCount += 1;
    }

    return { ok: true, relayedCount };
  };

  const sendNoActiveRoomNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string
  ) => {
    sendNack(socket, requestId, eventType, "NoActiveRoom", "Join a room first");
    void incrementMetric("nack_sent");
  };

  const sendTargetNotInRoomNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string
  ) => {
    sendNack(
      socket,
      requestId,
      eventType,
      "TargetNotInRoom",
      "Target user is offline or not in this room"
    );
    void incrementMetric("nack_sent");
  };

  const sendValidationNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    message: string
  ) => {
    sendNack(socket, requestId, eventType, "ValidationError", message);
    void incrementMetric("nack_sent");
  };

  const sendInvalidEnvelopeError = (socket: WebSocket) => {
    sendJson(socket, buildErrorEnvelope("ValidationError", "Invalid ws envelope"));
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
          sendJson(connection, buildErrorEnvelope("MissingTicket", "ticket query param is required"));
          connection.close(4001, "Missing ticket");
          return;
        }

        const ticketKey = `ws:ticket:${ticket}`;
        const ticketPayload = await fastify.redis.get(ticketKey);

        if (!ticketPayload) {
          sendJson(connection, buildErrorEnvelope("InvalidTicket", "WebSocket ticket is invalid or expired"));
          connection.close(4002, "Invalid ticket");
          return;
        }

        await fastify.redis.del(ticketKey);

        let claims: WsTicketClaims;
        try {
          claims = JSON.parse(ticketPayload);
        } catch {
          sendJson(connection, buildErrorEnvelope("InvalidTicket", "Ticket payload is corrupted"));
          connection.close(4003, "Invalid ticket");
          return;
        }

        const userId = claims.userId;

        if (!userId) {
          sendJson(connection, buildErrorEnvelope("InvalidTicket", "Ticket subject is missing"));
          connection.close(4004, "Invalid ticket");
          return;
        }

        const userName = claims.userName || claims.name || claims.email || "unknown";

        socketState.set(connection, {
          userId,
          userName,
          roomId: null,
          roomSlug: null,
          roomKind: null
        });

        attachUserSocket(userId, connection);

        await fastify.redis.hSet(`presence:user:${userId}`, {
          online: "1",
          updatedAt: new Date().toISOString()
        });
        await fastify.redis.expire(`presence:user:${userId}`, 120);

        sendJson(connection, buildServerReadyEnvelope(userId, userName));
        sendJson(connection, buildRoomsPresenceEnvelope(getAllRoomsPresence()));

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

                if (!joinResult.ok) {
                  sendJoinDeniedNack(connection, requestId, eventType, joinResult.reason);
                  return;
                }

                if (state.roomId) {
                  detachRoomSocket(state.roomId, connection);
                  broadcastRoom(
                    state.roomId,
                    buildPresenceLeftEnvelope(state.userId, state.userName, state.roomSlug, 0),
                    connection
                  );
                  broadcastAllRoomsPresence();
                }

                if (joinResult.room.kind !== "text") {
                  evictUserFromOtherNonTextChannels(state.userId, connection);
                }

                state.roomId = joinResult.room.id;
                state.roomSlug = joinResult.room.slug;
                state.roomKind = joinResult.room.kind;
                attachRoomSocket(joinResult.room.id, connection);

                sendJson(
                  connection,
                  buildRoomJoinedEnvelope(
                    joinResult.room.id,
                    joinResult.room.slug,
                    joinResult.room.title
                  )
                );

                sendAckWithMetrics(
                  connection,
                  requestId,
                  eventType,
                  {
                    roomId: joinResult.room.id,
                    roomSlug: joinResult.room.slug
                  }
                );

                sendJson(
                  connection,
                  buildRoomPresenceEnvelope(
                    joinResult.room.id,
                    joinResult.room.slug,
                    getRoomPresence(joinResult.room.id)
                  )
                );

                broadcastRoom(
                  joinResult.room.id,
                  buildPresenceJoinedEnvelope(
                    state.userId,
                    state.userName,
                    joinResult.room.slug,
                    getRoomPresence(joinResult.room.id).length
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

                const previousRoomId = state.roomId;
                const previousRoomSlug = state.roomSlug;

                detachRoomSocket(previousRoomId, connection);
                state.roomId = null;
                state.roomSlug = null;
                state.roomKind = null;

                sendJson(connection, buildRoomLeftEnvelope(previousRoomId, previousRoomSlug));
                sendAckWithMetrics(connection, requestId, eventType, {
                  roomId: previousRoomId,
                  roomSlug: previousRoomSlug
                });

                broadcastRoom(
                  previousRoomId,
                  buildPresenceLeftEnvelope(
                    state.userId,
                    state.userName,
                    previousRoomSlug,
                    getRoomPresence(previousRoomId).length
                  ),
                  connection
                );

                broadcastAllRoomsPresence();

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

              case "call.offer":
              case "call.answer":
              case "call.ice": {
              if (!state.roomId) {
                sendNoActiveRoomNack(connection, requestId, eventType);
                return;
              }

              const signal = getCallSignal(payload);
              if (!signal) {
                sendValidationNack(connection, requestId, eventType, "payload.signal object is required");
                return;
              }

              const signalSize = safeJsonSize(signal);
              if (!Number.isFinite(signalSize) || signalSize < 2 || signalSize > 12000) {
                sendValidationNack(connection, requestId, eventType, "payload.signal size must be between 2 and 12000 bytes");
                return;
              }

              const targetUserId = normalizeRequestId(getPayloadString(payload, "targetUserId", 128)) || null;
              const relayEnvelope = buildCallSignalRelayEnvelope(
                knownMessage.type,
                state.userId,
                state.userName,
                state.roomId,
                state.roomSlug,
                targetUserId,
                signal
              );

              const relayOutcome = relayToTargetOrRoom(connection, state.roomId, targetUserId, relayEnvelope);
              if (!relayOutcome.ok) {
                sendTargetNotInRoomNack(connection, requestId, eventType);
                return;
              }

              sendAckWithMetrics(
                connection,
                requestId,
                eventType,
                {
                  relayedTo: relayOutcome.relayedCount,
                  targetUserId
                },
                ["call_signal_sent"]
              );
              return;
              }

              case "call.hangup":
              case "call.reject": {
              if (!state.roomId) {
                sendNoActiveRoomNack(connection, requestId, eventType);
                return;
              }

              const targetUserId = normalizeRequestId(getPayloadString(payload, "targetUserId", 128)) || null;
              const reason = getPayloadString(payload, "reason", 128) || null;
              const relayEnvelope = buildCallTerminalRelayEnvelope(
                knownMessage.type,
                state.userId,
                state.userName,
                state.roomId,
                state.roomSlug,
                targetUserId,
                reason
              );

              const relayOutcome = relayToTargetOrRoom(connection, state.roomId, targetUserId, relayEnvelope);
              if (!relayOutcome.ok) {
                sendTargetNotInRoomNack(connection, requestId, eventType);
                return;
              }

              sendAckWithMetrics(
                connection,
                requestId,
                eventType,
                {
                  relayedTo: relayOutcome.relayedCount,
                  targetUserId
                },
                [knownMessage.type === "call.hangup" ? "call_hangup_sent" : "call_reject_sent"]
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
          if (!state) {
            return;
          }

          detachUserSocket(state.userId, connection);

          if (state.roomId) {
            detachRoomSocket(state.roomId, connection);
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
