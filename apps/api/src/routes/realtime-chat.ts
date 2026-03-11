import type { WebSocket } from "ws";

type SocketState = {
  userId: string;
  userName: string;
  roomId: string | null;
  roomSlug: string | null;
};

type ChatCommonParams = {
  connection: WebSocket;
  state: SocketState;
  payload: unknown;
  requestId: string | null;
  eventType: string;
  normalizeRequestId: (value: unknown) => string | null;
  getPayloadString: (payload: any, key: string, maxLength?: number) => string | null;
  sendNoActiveRoomNack: (socket: WebSocket, requestId: string | null, eventType: string) => void;
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
  incrementMetric: (name: string) => Promise<void>;
  sendJson: (socket: WebSocket, payload: unknown) => void;
  sendAckWithMetrics: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta?: Record<string, unknown>,
    additionalMetrics?: string[]
  ) => void;
  broadcastRoom: (roomId: string, payload: unknown, excludedSocket?: WebSocket | null) => void;
  buildChatMessageEnvelope: (...args: any[]) => unknown;
  buildChatEditedEnvelope: (...args: any[]) => unknown;
  buildChatDeletedEnvelope: (...args: any[]) => unknown;
  redisGet: (key: string) => Promise<string | null>;
  redisDel: (key: string) => Promise<number>;
  redisSetEx: (key: string, ttlSeconds: number, value: string) => Promise<string | null>;
  dbQuery: <T = unknown>(text: string, params?: unknown[]) => Promise<{ rowCount: number | null; rows: T[] }>;
};

export async function handleChatSend(
  params: ChatCommonParams & { incomingIdempotencyKey?: string | null }
): Promise<void> {
  const {
    connection,
    state,
    payload,
    requestId,
    eventType,
    getPayloadString,
    normalizeRequestId,
    sendNoActiveRoomNack,
    sendValidationNack,
    redisGet,
    redisDel,
    sendJson,
    buildChatMessageEnvelope,
    sendAckWithMetrics,
    dbQuery,
    redisSetEx,
    broadcastRoom,
    incomingIdempotencyKey
  } = params;

  if (!state.roomId) {
    sendNoActiveRoomNack(connection, requestId, eventType);
    return;
  }

  const text = getPayloadString(payload, "text", 20000);
  if (!text) {
    sendValidationNack(connection, requestId, eventType, "Message text is required");
    return;
  }

  const idempotencyKey = normalizeRequestId(incomingIdempotencyKey) || requestId;

  if (idempotencyKey) {
    const idemRedisKey = `ws:idempotency:${state.userId}:${idempotencyKey}`;
    const cachedPayloadRaw = await redisGet(idemRedisKey);

    if (cachedPayloadRaw) {
      try {
        const cachedPayload = JSON.parse(cachedPayloadRaw);
        sendJson(connection, buildChatMessageEnvelope(cachedPayload));
      } catch {
        await redisDel(idemRedisKey);
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

  const inserted = await dbQuery<{
    id: string;
    room_id: string;
    user_id: string;
    body: string;
    created_at: string;
  }>(
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
    await redisSetEx(
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
}

export async function handleChatEdit(params: ChatCommonParams): Promise<void> {
  const {
    connection,
    state,
    payload,
    requestId,
    eventType,
    normalizeRequestId,
    getPayloadString,
    sendNoActiveRoomNack,
    sendValidationNack,
    dbQuery,
    sendNack,
    incrementMetric,
    sendForbiddenNack,
    broadcastRoom,
    buildChatEditedEnvelope,
    sendAckWithMetrics
  } = params;

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

  const existingMessage = await dbQuery<{
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

  const updated = await dbQuery<{
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
}

export async function handleChatDelete(params: ChatCommonParams): Promise<void> {
  const {
    connection,
    state,
    payload,
    requestId,
    eventType,
    normalizeRequestId,
    getPayloadString,
    sendNoActiveRoomNack,
    sendValidationNack,
    dbQuery,
    sendNack,
    incrementMetric,
    sendForbiddenNack,
    broadcastRoom,
    buildChatDeletedEnvelope,
    sendAckWithMetrics
  } = params;

  if (!state.roomId) {
    sendNoActiveRoomNack(connection, requestId, eventType);
    return;
  }

  const messageId = normalizeRequestId(getPayloadString(payload, "messageId", 128));
  if (!messageId) {
    sendValidationNack(connection, requestId, eventType, "messageId is required");
    return;
  }

  const existingMessage = await dbQuery<{
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

  const deleted = await dbQuery<{ id: string; room_id: string }>(
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
}
