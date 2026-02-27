import { db } from "../db.js";

function sendJson(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

export async function realtimeRoutes(fastify) {
  const socketsByUserId = new Map();
  const socketsByRoomId = new Map();
  const socketState = new WeakMap();

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
          sendJson(connection, {
            type: "error",
            payload: { code: "MissingTicket", message: "ticket query param is required" }
          });
          connection.close(4001, "Missing ticket");
          return;
        }

        const ticketKey = `ws:ticket:${ticket}`;
        const ticketPayload = await fastify.redis.get(ticketKey);

        if (!ticketPayload) {
          sendJson(connection, {
            type: "error",
            payload: { code: "InvalidTicket", message: "WebSocket ticket is invalid or expired" }
          });
          connection.close(4002, "Invalid ticket");
          return;
        }

        await fastify.redis.del(ticketKey);

        let claims;
        try {
          claims = JSON.parse(ticketPayload);
        } catch {
          sendJson(connection, {
            type: "error",
            payload: { code: "InvalidTicket", message: "Ticket payload is corrupted" }
          });
          connection.close(4003, "Invalid ticket");
          return;
        }

        const userId = claims.userId;

        if (!userId) {
          sendJson(connection, {
            type: "error",
            payload: { code: "InvalidTicket", message: "Ticket subject is missing" }
          });
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

        sendJson(connection, {
          type: "server.ready",
          payload: {
            userId,
            userName,
            connectedAt: new Date().toISOString()
          }
        });

        connection.on("message", async (raw) => {
          try {
            const message = JSON.parse(raw.toString());
            const state = socketState.get(connection);

            if (!state) {
              return;
            }

            if (message.type === "ping") {
              sendJson(connection, {
                type: "pong",
                payload: {
                  ts: Date.now()
                }
              });
              return;
            }

            if (message.type === "room.join") {
              const roomSlug = message.payload?.roomSlug;

              if (!roomSlug) {
                sendJson(connection, {
                  type: "error",
                  payload: { code: "ValidationError", message: "roomSlug is required" }
                });
                return;
              }

              const joinResult = await canJoinRoom(roomSlug, state.userId);

              if (!joinResult.ok) {
                sendJson(connection, {
                  type: "error",
                  payload: { code: joinResult.reason, message: "Cannot join room" }
                });
                return;
              }

              if (state.roomId) {
                detachRoomSocket(state.roomId, connection);
                broadcastRoom(
                  state.roomId,
                  {
                    type: "presence.left",
                    payload: {
                      userId: state.userId,
                      userName: state.userName,
                      roomSlug: state.roomSlug
                    }
                  },
                  connection
                );
              }

              state.roomId = joinResult.room.id;
              state.roomSlug = joinResult.room.slug;
              attachRoomSocket(joinResult.room.id, connection);

              sendJson(connection, {
                type: "room.joined",
                payload: {
                  roomId: joinResult.room.id,
                  roomSlug: joinResult.room.slug,
                  roomTitle: joinResult.room.title
                }
              });

              sendJson(connection, {
                type: "room.presence",
                payload: {
                  roomId: joinResult.room.id,
                  roomSlug: joinResult.room.slug,
                  users: getRoomPresence(joinResult.room.id)
                }
              });

              broadcastRoom(
                joinResult.room.id,
                {
                  type: "presence.joined",
                  payload: {
                    userId: state.userId,
                    userName: state.userName,
                    roomSlug: joinResult.room.slug,
                    presenceCount: getRoomPresence(joinResult.room.id).length
                  }
                },
                connection
              );

              return;
            }

            if (message.type === "chat.send") {
              if (!state.roomId) {
                sendJson(connection, {
                  type: "error",
                  payload: { code: "NoActiveRoom", message: "Join a room first" }
                });
                return;
              }

              const text = message.payload?.text?.trim();

              if (!text) {
                sendJson(connection, {
                  type: "error",
                  payload: { code: "ValidationError", message: "Message text is required" }
                });
                return;
              }

              const inserted = await db.query(
                `INSERT INTO messages (room_id, user_id, body)
                 VALUES ($1, $2, $3)
                 RETURNING id, room_id, user_id, body, created_at`,
                [state.roomId, state.userId, text]
              );

              const chatMessage = inserted.rows[0];

              broadcastRoom(state.roomId, {
                type: "chat.message",
                payload: {
                  id: chatMessage.id,
                  roomId: chatMessage.room_id,
                  roomSlug: state.roomSlug,
                  userId: chatMessage.user_id,
                  userName: state.userName,
                  text: chatMessage.body,
                  createdAt: chatMessage.created_at
                }
              });

              return;
            }

            sendJson(connection, {
              type: "error",
              payload: { code: "UnknownEvent", message: "Unsupported event type" }
            });
          } catch (error) {
            fastify.log.error(error, "ws message handling failed");
            sendJson(connection, {
              type: "error",
              payload: { code: "ServerError", message: "Failed to process event" }
            });
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
            broadcastRoom(state.roomId, {
              type: "presence.left",
              payload: {
                userId: state.userId,
                userName: state.userName,
                roomSlug: state.roomSlug,
                presenceCount: getRoomPresence(state.roomId).length
              }
            });
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
