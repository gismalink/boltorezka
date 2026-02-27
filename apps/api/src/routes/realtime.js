import { db } from "../db.js";
import {
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
  buildRoomPresenceEnvelope,
  buildServerReadyEnvelope,
  getCallSignal,
  getPayloadString,
  isCallSignalEventType,
  parseWsIncomingEnvelope
} from "../ws-protocol.js";

function sendJson(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function normalizeRequestId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, 128);
}

function sendAck(socket, requestId, eventType, meta = {}) {
  if (!requestId) {
    return;
  }

  sendJson(socket, buildAckEnvelope(requestId, eventType, meta));
}

function sendNack(socket, requestId, eventType, code, message) {
  if (!requestId) {
    sendJson(socket, buildErrorEnvelope(code, message));
    return;
  }

  sendJson(socket, buildNackEnvelope(requestId, eventType, code, message));
}

function safeJsonSize(value) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export async function realtimeRoutes(fastify) {
  const socketsByUserId = new Map();
  const socketsByRoomId = new Map();
  const socketState = new WeakMap();

  const incrementMetric = async (name) => {
    try {
      const day = new Date().toISOString().slice(0, 10);
      await fastify.redis.hIncrBy(`ws:metrics:${day}`, name, 1);
    } catch {
      return;
    }
  };

  const attachUserSocket = (userId, socket) => {
    const userSockets = socketsByUserId.get(userId) || new Set();
    userSockets.add(socket);
    socketsByUserId.set(userId, userSockets);
  };

  const detachUserSocket = (userId, socket) => {
    const userSockets = socketsByUserId.get(userId);
    if (!userSockets) {
      return;
    }
    userSockets.delete(socket);
    if (userSockets.size === 0) {
      socketsByUserId.delete(userId);
    }
  };

  const attachRoomSocket = (roomId, socket) => {
    const roomSockets = socketsByRoomId.get(roomId) || new Set();
    roomSockets.add(socket);
    socketsByRoomId.set(roomId, roomSockets);
  };

  const detachRoomSocket = (roomId, socket) => {
    const roomSockets = socketsByRoomId.get(roomId);
    if (!roomSockets) {
      return;
    }
    roomSockets.delete(socket);
    if (roomSockets.size === 0) {
      socketsByRoomId.delete(roomId);
    }
  };

  const broadcastRoom = (roomId, payload, excludedSocket = null) => {
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

  const getRoomPresence = (roomId) => {
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

  const getUserRoomSockets = (userId, roomId) => {
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

  const canJoinRoom = async (roomSlug, userId) => {
    const room = await db.query(
      "SELECT id, slug, title, is_public FROM rooms WHERE slug = $1",
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

  fastify.get(
    "/v1/realtime/ws",
    {
      websocket: true
    },
    async (connection, request) => {
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

        let claims;
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
          roomSlug: null
        });

        attachUserSocket(userId, connection);

        await fastify.redis.hSet(`presence:user:${userId}`, {
          online: "1",
          updatedAt: new Date().toISOString()
        });
        await fastify.redis.expire(`presence:user:${userId}`, 120);

        sendJson(connection, buildServerReadyEnvelope(userId, userName));

        connection.on("message", async (raw) => {
          try {
            const message = parseWsIncomingEnvelope(raw);
            if (!message) {
              sendJson(connection, buildErrorEnvelope("ValidationError", "Invalid ws envelope"));
              void incrementMetric("nack_sent");
              return;
            }

            const state = socketState.get(connection);
            const requestId = normalizeRequestId(message.requestId);
            const eventType = message.type;
            const payload = message.payload;

            if (!state) {
              return;
            }

            if (message.type === "ping") {
              sendJson(connection, buildPongEnvelope());
              sendAck(connection, requestId, eventType);
              void incrementMetric("ack_sent");
              return;
            }

            if (message.type === "room.join") {
              const roomSlug = getPayloadString(payload, "roomSlug", 80);

              if (!roomSlug) {
                sendNack(
                  connection,
                  requestId,
                  eventType,
                  "ValidationError",
                  "roomSlug is required"
                );
                void incrementMetric("nack_sent");
                return;
              }

              const joinResult = await canJoinRoom(roomSlug, state.userId);

              if (!joinResult.ok) {
                sendNack(connection, requestId, eventType, joinResult.reason, "Cannot join room");
                void incrementMetric("nack_sent");
                return;
              }

              if (state.roomId) {
                detachRoomSocket(state.roomId, connection);
                broadcastRoom(
                  state.roomId,
                  buildPresenceLeftEnvelope(state.userId, state.userName, state.roomSlug, 0),
                  connection
                );
              }

              state.roomId = joinResult.room.id;
              state.roomSlug = joinResult.room.slug;
              attachRoomSocket(joinResult.room.id, connection);

              sendJson(
                connection,
                buildRoomJoinedEnvelope(
                  joinResult.room.id,
                  joinResult.room.slug,
                  joinResult.room.title
                )
              );

              sendAck(connection, requestId, eventType, {
                roomId: joinResult.room.id,
                roomSlug: joinResult.room.slug
              });
              void incrementMetric("ack_sent");

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

              return;
            }

            if (message.type === "chat.send") {
              if (!state.roomId) {
                sendNack(
                  connection,
                  requestId,
                  eventType,
                  "NoActiveRoom",
                  "Join a room first"
                );
                void incrementMetric("nack_sent");
                return;
              }

              const text = getPayloadString(payload, "text", 20000);

              if (!text) {
                sendNack(
                  connection,
                  requestId,
                  eventType,
                  "ValidationError",
                  "Message text is required"
                );
                void incrementMetric("nack_sent");
                return;
              }

              const idempotencyKey = normalizeRequestId(message.idempotencyKey) || requestId;

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

                  sendAck(connection, requestId, eventType, {
                    duplicate: true,
                    idempotencyKey
                  });
                  void incrementMetric("ack_sent");
                  void incrementMetric("chat_idempotency_hit");
                  return;
                }
              }

              const inserted = await db.query(
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

              sendAck(connection, requestId, eventType, {
                messageId: chatMessage.id,
                idempotencyKey: idempotencyKey || null
              });
              void incrementMetric("ack_sent");
              void incrementMetric("chat_sent");

              return;
            }

            if (isCallSignalEventType(message.type)) {
              if (!state.roomId) {
                sendNack(
                  connection,
                  requestId,
                  eventType,
                  "NoActiveRoom",
                  "Join a room first"
                );
                void incrementMetric("nack_sent");
                return;
              }

              const signal = getCallSignal(payload);
              if (!signal) {
                sendNack(
                  connection,
                  requestId,
                  eventType,
                  "ValidationError",
                  "payload.signal object is required"
                );
                void incrementMetric("nack_sent");
                return;
              }

              const signalSize = safeJsonSize(signal);
              if (!Number.isFinite(signalSize) || signalSize < 2 || signalSize > 12000) {
                sendNack(
                  connection,
                  requestId,
                  eventType,
                  "ValidationError",
                  "payload.signal size must be between 2 and 12000 bytes"
                );
                void incrementMetric("nack_sent");
                return;
              }

              const targetUserId = normalizeRequestId(getPayloadString(payload, "targetUserId", 128)) || null;
              const relayEnvelope = buildCallSignalRelayEnvelope(
                message.type,
                state.userId,
                state.userName,
                state.roomId,
                state.roomSlug,
                targetUserId,
                signal
              );

              let relayedCount = 0;

              if (targetUserId) {
                const targetSockets = getUserRoomSockets(targetUserId, state.roomId);
                for (const targetSocket of targetSockets) {
                  if (targetSocket === connection) {
                    continue;
                  }

                  sendJson(targetSocket, relayEnvelope);
                  relayedCount += 1;
                }

                if (relayedCount === 0) {
                  sendNack(
                    connection,
                    requestId,
                    eventType,
                    "TargetNotInRoom",
                    "Target user is offline or not in this room"
                  );
                  void incrementMetric("nack_sent");
                  return;
                }
              } else {
                const roomSockets = socketsByRoomId.get(state.roomId) || new Set();
                for (const roomSocket of roomSockets) {
                  if (roomSocket === connection) {
                    continue;
                  }

                  sendJson(roomSocket, relayEnvelope);
                  relayedCount += 1;
                }
              }

              sendAck(connection, requestId, eventType, {
                relayedTo: relayedCount,
                targetUserId
              });
              void incrementMetric("ack_sent");
              void incrementMetric("call_signal_sent");
              return;
            }

            if (message.type === "call.hangup") {
              if (!state.roomId) {
                sendNack(
                  connection,
                  requestId,
                  eventType,
                  "NoActiveRoom",
                  "Join a room first"
                );
                void incrementMetric("nack_sent");
                return;
              }

              const targetUserId = normalizeRequestId(getPayloadString(payload, "targetUserId", 128)) || null;
              const reason = getPayloadString(payload, "reason", 128) || null;
              const relayEnvelope = buildCallTerminalRelayEnvelope(
                "call.hangup",
                state.userId,
                state.userName,
                state.roomId,
                state.roomSlug,
                targetUserId,
                reason
              );

              let relayedCount = 0;

              if (targetUserId) {
                const targetSockets = getUserRoomSockets(targetUserId, state.roomId);
                for (const targetSocket of targetSockets) {
                  if (targetSocket === connection) {
                    continue;
                  }

                  sendJson(targetSocket, relayEnvelope);
                  relayedCount += 1;
                }

                if (relayedCount === 0) {
                  sendNack(
                    connection,
                    requestId,
                    eventType,
                    "TargetNotInRoom",
                    "Target user is offline or not in this room"
                  );
                  void incrementMetric("nack_sent");
                  return;
                }
              } else {
                const roomSockets = socketsByRoomId.get(state.roomId) || new Set();
                for (const roomSocket of roomSockets) {
                  if (roomSocket === connection) {
                    continue;
                  }

                  sendJson(roomSocket, relayEnvelope);
                  relayedCount += 1;
                }
              }

              sendAck(connection, requestId, eventType, {
                relayedTo: relayedCount,
                targetUserId
              });
              void incrementMetric("ack_sent");
              void incrementMetric("call_hangup_sent");
              return;
            }

            if (message.type === "call.reject") {
              if (!state.roomId) {
                sendNack(
                  connection,
                  requestId,
                  eventType,
                  "NoActiveRoom",
                  "Join a room first"
                );
                void incrementMetric("nack_sent");
                return;
              }

              const targetUserId = normalizeRequestId(getPayloadString(payload, "targetUserId", 128)) || null;
              const reason = getPayloadString(payload, "reason", 128) || null;
              const relayEnvelope = buildCallTerminalRelayEnvelope(
                "call.reject",
                state.userId,
                state.userName,
                state.roomId,
                state.roomSlug,
                targetUserId,
                reason
              );

              let relayedCount = 0;

              if (targetUserId) {
                const targetSockets = getUserRoomSockets(targetUserId, state.roomId);
                for (const targetSocket of targetSockets) {
                  if (targetSocket === connection) {
                    continue;
                  }

                  sendJson(targetSocket, relayEnvelope);
                  relayedCount += 1;
                }

                if (relayedCount === 0) {
                  sendNack(
                    connection,
                    requestId,
                    eventType,
                    "TargetNotInRoom",
                    "Target user is offline or not in this room"
                  );
                  void incrementMetric("nack_sent");
                  return;
                }
              } else {
                const roomSockets = socketsByRoomId.get(state.roomId) || new Set();
                for (const roomSocket of roomSockets) {
                  if (roomSocket === connection) {
                    continue;
                  }

                  sendJson(roomSocket, relayEnvelope);
                  relayedCount += 1;
                }
              }

              sendAck(connection, requestId, eventType, {
                relayedTo: relayedCount,
                targetUserId
              });
              void incrementMetric("ack_sent");
              void incrementMetric("call_reject_sent");
              return;
            }

            sendNack(connection, requestId, eventType, "UnknownEvent", "Unsupported event type");
            void incrementMetric("nack_sent");
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
