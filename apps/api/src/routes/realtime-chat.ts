import type { WebSocket } from "ws";
import { isServerAgeConfirmed } from "../services/age-verification-service.js";
import { resolveActiveServerMute } from "../services/server-mute-service.js";

type TopicMessageOps = {
  createTopicMessage: (input: {
    topicId: string;
    userId: string;
    text: string;
  }) => Promise<{
    room: { id: string; slug: string };
    topic: { id: string; slug: string };
    message: {
      id: string;
      room_id: string;
      topic_id?: string | null;
      reply_to_message_id?: string | null;
      reply_to_user_id?: string | null;
      reply_to_user_name?: string | null;
      reply_to_text?: string | null;
      user_id: string;
      user_name: string;
      text: string;
      created_at: string;
    };
  }>;
  replyTopicMessage: (input: {
    messageId: string;
    userId: string;
    text: string;
  }) => Promise<{
    room: { id: string; slug: string };
    topic: { id: string; slug: string };
    parentMessageId: string;
    message: {
      id: string;
      room_id: string;
      topic_id?: string | null;
      reply_to_message_id?: string | null;
      reply_to_user_id?: string | null;
      reply_to_user_name?: string | null;
      reply_to_text?: string | null;
      user_id: string;
      user_name: string;
      text: string;
      created_at: string;
    };
  }>;
  setTopicMessagePinned: (input: { messageId: string; userId: string; pinned: boolean }) => Promise<{
    room: { id: string; slug: string };
    topic: { id: string; slug: string };
    messageId: string;
    pinned: boolean;
  }>;
  setTopicMessageReaction: (input: { messageId: string; userId: string; emoji: string; active: boolean }) => Promise<{
    room: { id: string; slug: string };
    topic: { id: string; slug: string };
    messageId: string;
    emoji: string;
    userId: string;
    active: boolean;
  }>;
  createTopicMessageReport: (input: {
    messageId: string;
    userId: string;
    reason: string;
    details?: string;
  }) => Promise<{
    reportId: string;
    messageId: string;
  }>;
};

type NotificationInboxOps = {
  emitMentionInboxEvents: (input: {
    actorUserId: string;
    actorUserName: string;
    roomId: string;
    roomSlug: string;
    topicId: string | null;
    topicSlug: string | null;
    messageId: string;
    text: string;
    mentionUserIds?: string[];
  }) => Promise<void>;
  emitReplyInboxEvent: (input: {
    actorUserId: string;
    actorUserName: string;
    targetUserId: string | null;
    roomId: string;
    roomSlug: string;
    topicId: string | null;
    topicSlug: string | null;
    messageId: string;
    text: string;
  }) => Promise<void>;
};

let topicMessageOpsPromise: Promise<TopicMessageOps> | null = null;
let topicMessageOpsLoaderForTests: (() => Promise<TopicMessageOps>) | null = null;
let notificationInboxOpsPromise: Promise<NotificationInboxOps> | null = null;
let notificationInboxOpsLoaderForTests: (() => Promise<NotificationInboxOps>) | null = null;

export function setTopicMessageOpsLoaderForTests(loader: (() => Promise<TopicMessageOps>) | null): void {
  topicMessageOpsLoaderForTests = loader;
  topicMessageOpsPromise = null;
}

export function setNotificationInboxOpsLoaderForTests(loader: (() => Promise<NotificationInboxOps>) | null): void {
  notificationInboxOpsLoaderForTests = loader;
  notificationInboxOpsPromise = null;
}

async function getTopicMessageOps() {
  if (topicMessageOpsLoaderForTests) {
    if (!topicMessageOpsPromise) {
      topicMessageOpsPromise = topicMessageOpsLoaderForTests();
    }
    return topicMessageOpsPromise;
  }

  if (!topicMessageOpsPromise) {
    topicMessageOpsPromise = import("../services/room-topic-messages-service.js").then((module) => ({
      createTopicMessage: module.createTopicMessage,
      replyTopicMessage: module.replyTopicMessage,
      setTopicMessagePinned: module.setTopicMessagePinned,
      setTopicMessageReaction: module.setTopicMessageReaction,
      createTopicMessageReport: module.createTopicMessageReport
    }));
  }
  return topicMessageOpsPromise;
}

async function getNotificationInboxOps() {
  if (notificationInboxOpsLoaderForTests) {
    if (!notificationInboxOpsPromise) {
      notificationInboxOpsPromise = notificationInboxOpsLoaderForTests();
    }
    return notificationInboxOpsPromise;
  }

  if (!notificationInboxOpsPromise) {
    notificationInboxOpsPromise = import("../services/notification-inbox-service.js").then((module) => ({
      emitMentionInboxEvents: module.emitMentionInboxEvents,
      emitReplyInboxEvent: module.emitReplyInboxEvent
    }));
  }

  return notificationInboxOpsPromise;
}

type SocketState = {
  userId: string;
  userName: string;
  roomId: string | null;
  roomSlug: string | null;
};

type ResolvedChatRoom = {
  roomId: string;
  roomSlug: string;
  serverId: string | null;
  isReadonly: boolean;
  slowmodeSeconds: number;
};

async function canBypassRoomSendPolicy(
  dbQuery: ChatCommonParams["dbQuery"],
  userId: string,
  serverId: string | null
): Promise<boolean> {
  const globalRoleResult = await dbQuery<{ role: string }>(
    `SELECT role
     FROM users
     WHERE id = $1
       AND is_banned = FALSE
     LIMIT 1`,
    [userId]
  );

  const globalRole = String(globalRoleResult.rows[0]?.role || "").trim();
  if (globalRole === "admin" || globalRole === "super_admin") {
    return true;
  }

  const normalizedServerId = String(serverId || "").trim();
  if (!normalizedServerId) {
    return false;
  }

  const membership = await dbQuery<{ role: string }>(
    `SELECT role
     FROM server_members
     WHERE server_id = $1
       AND user_id = $2
       AND status = 'active'
     LIMIT 1`,
    [normalizedServerId, userId]
  );

  const serverRole = String(membership.rows[0]?.role || "").trim();
  return serverRole === "owner" || serverRole === "admin";
}

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
  buildChatTypingEnvelope?: (...args: any[]) => unknown;
  redisGet: (key: string) => Promise<string | null>;
  redisDel: (key: string) => Promise<number>;
  redisSetEx: (key: string, ttlSeconds: number, value: string) => Promise<string | null>;
  dbQuery: <T = unknown>(text: string, params?: unknown[]) => Promise<{ rowCount: number | null; rows: T[] }>;
};

async function resolveChatRoom(
  params: Pick<
    ChatCommonParams,
    "state" | "payload" | "getPayloadString" | "dbQuery" | "connection" | "requestId" | "eventType" | "sendNoActiveRoomNack" | "sendNack"
  >
): Promise<ResolvedChatRoom | null> {
  const {
    state,
    payload,
    getPayloadString,
    dbQuery,
    connection,
    requestId,
    eventType,
    sendNoActiveRoomNack,
    sendNack
  } = params;

  const targetRoomSlug = getPayloadString(payload as Record<string, unknown>, "roomSlug", 128)
    || (typeof state.roomSlug === "string" ? state.roomSlug.trim() : "");

  if (!targetRoomSlug) {
    if (!state.roomId || !state.roomSlug) {
      sendNoActiveRoomNack(connection, requestId, eventType);
      return null;
    }

    const roomById = await dbQuery<{
      id: string;
      slug: string;
      server_id: string | null;
      is_readonly: boolean;
      slowmode_seconds: number;
    }>(
      `SELECT id, slug, server_id, is_readonly, slowmode_seconds
       FROM rooms
       WHERE id = $1
         AND is_archived = FALSE
       LIMIT 1`,
      [state.roomId]
    );

    const room = roomById.rows[0];
    if (!room) {
      sendNack(connection, requestId, eventType, "RoomNotFound", "Room does not exist");
      return null;
    }

    return {
      roomId: room.id,
      roomSlug: room.slug,
      serverId: room.server_id,
      isReadonly: Boolean(room.is_readonly),
      slowmodeSeconds: Number(room.slowmode_seconds || 0)
    };
  }

  const roomResult = await dbQuery<{
    id: string;
    slug: string;
    is_public: boolean;
    is_hidden: boolean;
    server_id: string | null;
    nsfw: boolean | null;
    is_readonly: boolean;
    slowmode_seconds: number;
  }>(
    `SELECT r.id, r.slug, r.is_public, r.is_hidden, r.server_id, r.nsfw, r.is_readonly, r.slowmode_seconds
     FROM rooms r
     LEFT JOIN servers s ON s.id = r.server_id
     WHERE r.slug = $1
       AND r.is_archived = FALSE
       AND (r.server_id IS NULL OR (s.is_archived = FALSE AND s.is_blocked = FALSE))
     LIMIT 1`,
    [targetRoomSlug]
  );

  if ((roomResult.rowCount || 0) === 0) {
    sendNack(connection, requestId, eventType, "RoomNotFound", "Room does not exist");
    return null;
  }

  const room = roomResult.rows[0];
  if (room.nsfw === true) {
    const serverId = String(room.server_id || "").trim();
    const confirmed = serverId ? await isServerAgeConfirmed(serverId, state.userId) : false;
    if (!confirmed) {
      sendNack(connection, requestId, eventType, "AgeVerificationRequired", "Age verification is required for NSFW access");
      return null;
    }
  }

  if (room.is_hidden) {
    const hiddenAccess = await dbQuery(
      `SELECT EXISTS(
         SELECT 1
         FROM room_visibility_grants
         WHERE room_id = $1 AND user_id = $2
       )
       OR EXISTS(
         SELECT 1
         FROM room_members
         WHERE room_id = $1 AND user_id = $2
       ) AS has_access`,
      [room.id, state.userId]
    );

    const hasHiddenAccess = Boolean((hiddenAccess.rows[0] as { has_access?: boolean } | undefined)?.has_access);
    const isCurrentActiveRoom = state.roomId === room.id && state.roomSlug === room.slug;
    if (!hasHiddenAccess && !isCurrentActiveRoom) {
      sendNack(connection, requestId, eventType, "Forbidden", "You cannot access this room");
      return null;
    }
  }

  if (!room.is_public) {
    const membership = await dbQuery(
      `SELECT 1
       FROM room_members
       WHERE room_id = $1 AND user_id = $2
       LIMIT 1`,
      [room.id, state.userId]
    );

    if ((membership.rowCount || 0) === 0) {
      sendNack(connection, requestId, eventType, "Forbidden", "You cannot access this room");
      return null;
    }
  }

  return {
    roomId: room.id,
    roomSlug: room.slug,
    serverId: room.server_id,
    isReadonly: Boolean(room.is_readonly),
    slowmodeSeconds: Number(room.slowmode_seconds || 0)
  };
}

function mapTopicSendDomainErrorToWsNack(
  error: unknown,
  params: {
    connection: WebSocket;
    requestId: string | null;
    eventType: string;
    sendNack: ChatCommonParams["sendNack"];
  }
): boolean {
  const message = String((error as Error)?.message || "");
  const { connection, requestId, eventType, sendNack } = params;

  if (message === "topic_not_found" || message === "message_not_found") {
    sendNack(connection, requestId, eventType, "MessageNotFound", "Message does not exist");
    return true;
  }

  if (message === "forbidden_room_access" || message === "forbidden_topic_manage") {
    sendNack(connection, requestId, eventType, "Forbidden", "You do not have access to this resource");
    return true;
  }

  if (message === "topic_archived") {
    sendNack(connection, requestId, eventType, "TopicArchived", "Topic is archived");
    return true;
  }

  if (message === "room_readonly") {
    sendNack(connection, requestId, eventType, "RoomReadOnly", "Room is read-only");
    return true;
  }

  if (message === "server_member_muted") {
    sendNack(connection, requestId, eventType, "ServerMemberMuted", "You are muted in this server");
    return true;
  }

  if (message.startsWith("room_slowmode_active:")) {
    const retryAfterSec = Math.max(1, Number.parseInt(message.split(":")[1] || "1", 10) || 1);
    sendNack(connection, requestId, eventType, "SlowmodeActive", "Slowmode is active", {
      retryAfterSec
    });
    return true;
  }

  if (message === "validation_error") {
    sendNack(connection, requestId, eventType, "ValidationError", "Validation failed");
    return true;
  }

  if (message === "user_not_found") {
    sendNack(connection, requestId, eventType, "UserNotFound", "User does not exist");
    return true;
  }

  return false;
}

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
    sendNack,
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

  const targetRoom = await resolveChatRoom({
    state,
    payload,
    getPayloadString,
    dbQuery,
    connection,
    requestId,
    eventType,
    sendNoActiveRoomNack,
    sendNack
  });
  if (!targetRoom) {
    return;
  }

  const text = getPayloadString(payload, "text", 20000);
  if (!text) {
    sendValidationNack(connection, requestId, eventType, "Message text is required");
    return;
  }

  const topicId = normalizeRequestId(getPayloadString(payload, "topicId", 128));
  const replyToMessageId = normalizeRequestId(getPayloadString(payload, "replyToMessageId", 128));
  const mentionUserIdsRaw = Array.isArray((payload as Record<string, unknown>)?.mentionUserIds)
    ? (payload as Record<string, unknown>).mentionUserIds
    : [];
  const mentionUserIds = mentionUserIdsRaw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .slice(0, 100);

  if (replyToMessageId && !topicId) {
    sendValidationNack(connection, requestId, eventType, "topicId is required for replyToMessageId");
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

  if (topicId) {
    try {
      const { createTopicMessage, replyTopicMessage } = await getTopicMessageOps();
      const { emitMentionInboxEvents, emitReplyInboxEvent } = await getNotificationInboxOps();
      const result = replyToMessageId
        ? await replyTopicMessage({
            messageId: replyToMessageId,
            userId: state.userId,
            text
          })
        : await createTopicMessage({
            topicId,
            userId: state.userId,
            text
          });

      if (replyToMessageId) {
        await emitReplyInboxEvent({
          actorUserId: state.userId,
          actorUserName: result.message.user_name,
          targetUserId: result.message.reply_to_user_id || null,
          roomId: result.room.id,
          roomSlug: result.room.slug,
          topicId: result.topic.id,
          topicSlug: result.topic.slug,
          messageId: result.message.id,
          text: result.message.text
        });
      }

      await emitMentionInboxEvents({
        actorUserId: state.userId,
        actorUserName: result.message.user_name,
        roomId: result.room.id,
        roomSlug: result.room.slug,
        topicId: result.topic.id,
        topicSlug: result.topic.slug,
        messageId: result.message.id,
        text: result.message.text,
        mentionUserIds
      });

      const replyPayload = result.message.reply_to_message_id
        ? {
            replyToMessageId: result.message.reply_to_message_id,
            replyToUserId: result.message.reply_to_user_id || null,
            replyToUserName: result.message.reply_to_user_name || null,
            replyToText: result.message.reply_to_text || null
          }
        : {};

      const chatPayload = {
        id: result.message.id,
        roomId: result.message.room_id,
        roomSlug: result.room.slug,
        topicId: result.topic.id,
        topicSlug: result.topic.slug,
        ...replyPayload,
        userId: result.message.user_id,
        userName: result.message.user_name,
        text: result.message.text,
        createdAt: result.message.created_at,
        senderRequestId: requestId || null,
        attachments: []
      };

      if (idempotencyKey) {
        await redisSetEx(
          `ws:idempotency:${state.userId}:${idempotencyKey}`,
          120,
          JSON.stringify(chatPayload)
        );
      }

      broadcastRoom(result.room.id, buildChatMessageEnvelope(chatPayload));

      if (result.room.id !== state.roomId) {
        sendJson(connection, buildChatMessageEnvelope(chatPayload));
      }

      sendAckWithMetrics(
        connection,
        requestId,
        eventType,
        {
          messageId: result.message.id,
          idempotencyKey: idempotencyKey || null,
          topicId: result.topic.id,
          replyToMessageId: result.message.reply_to_message_id || null
        },
        ["chat_sent"]
      );
      return;
    } catch (error) {
      const handled = mapTopicSendDomainErrorToWsNack(error, {
        connection,
        requestId,
        eventType,
        sendNack
      });
      if (handled) {
        return;
      }
      throw error;
    }
  }

  const canBypassPolicies = await canBypassRoomSendPolicy(dbQuery, state.userId, targetRoom.serverId);
  if (!canBypassPolicies && targetRoom.serverId) {
    const muteState = await resolveActiveServerMute(targetRoom.serverId, state.userId);
    if (muteState.isMuted) {
      sendNack(connection, requestId, eventType, "ServerMemberMuted", "You are muted in this server", {
        mutedUntil: muteState.expiresAt,
        retryAfterSec: muteState.retryAfterSec
      });
      return;
    }
  }

  if (targetRoom.isReadonly && !canBypassPolicies) {
    sendNack(connection, requestId, eventType, "RoomReadOnly", "Room is read-only");
    return;
  }

  if (targetRoom.slowmodeSeconds > 0 && !canBypassPolicies) {
    const slowmodeKey = `room:slowmode:${targetRoom.roomId}:${state.userId}`;
    const cooldownRaw = await redisGet(slowmodeKey);
    if (cooldownRaw) {
      const retryAfterSec = Math.max(1, Number.parseInt(cooldownRaw, 10) || targetRoom.slowmodeSeconds);
      sendNack(connection, requestId, eventType, "SlowmodeActive", "Slowmode is active", {
        retryAfterSec
      });
      return;
    }

    await redisSetEx(slowmodeKey, targetRoom.slowmodeSeconds, String(targetRoom.slowmodeSeconds));
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
    [targetRoom.roomId, state.userId, text]
  );

  const chatMessage = inserted.rows[0];

  const chatPayload = {
    id: chatMessage.id,
    roomId: chatMessage.room_id,
    roomSlug: targetRoom.roomSlug,
    userId: chatMessage.user_id,
    userName: state.userName,
    text: chatMessage.body,
    createdAt: chatMessage.created_at,
    senderRequestId: requestId || null,
    attachments: []
  };

  if (idempotencyKey) {
    await redisSetEx(
      `ws:idempotency:${state.userId}:${idempotencyKey}`,
      120,
      JSON.stringify(chatPayload)
    );
  }

  broadcastRoom(targetRoom.roomId, buildChatMessageEnvelope(chatPayload));

  if (targetRoom.roomId !== state.roomId) {
    sendJson(connection, buildChatMessageEnvelope(chatPayload));
  }

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
    sendJson,
    broadcastRoom,
    buildChatEditedEnvelope,
    sendAckWithMetrics
  } = params;

  const targetRoom = await resolveChatRoom({
    state,
    payload,
    getPayloadString,
    dbQuery,
    connection,
    requestId,
    eventType,
    sendNoActiveRoomNack,
    sendNack
  });
  if (!targetRoom) {
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
    [messageId, targetRoom.roomId]
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
    [text, messageId, targetRoom.roomId]
  );

  if ((updated.rowCount || 0) === 0) {
    sendNack(connection, requestId, eventType, "MessageNotFound", "Message not found");
    void incrementMetric("nack_sent");
    return;
  }

  const updatedMessage = updated.rows[0];
  broadcastRoom(
    targetRoom.roomId,
    buildChatEditedEnvelope({
      id: updatedMessage.id,
      roomId: updatedMessage.room_id,
      roomSlug: targetRoom.roomSlug,
      text: updatedMessage.body,
      editedAt: updatedMessage.updated_at,
      editedByUserId: state.userId
    })
  );

  if (targetRoom.roomId !== state.roomId) {
    sendJson(
      connection,
      buildChatEditedEnvelope({
        id: updatedMessage.id,
        roomId: updatedMessage.room_id,
        roomSlug: targetRoom.roomSlug,
        text: updatedMessage.body,
        editedAt: updatedMessage.updated_at,
        editedByUserId: state.userId
      })
    );
  }

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
    sendJson,
    broadcastRoom,
    buildChatDeletedEnvelope,
    sendAckWithMetrics
  } = params;

  const targetRoom = await resolveChatRoom({
    state,
    payload,
    getPayloadString,
    dbQuery,
    connection,
    requestId,
    eventType,
    sendNoActiveRoomNack,
    sendNack
  });
  if (!targetRoom) {
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
    [messageId, targetRoom.roomId]
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
    [messageId, targetRoom.roomId]
  );

  if ((deleted.rowCount || 0) === 0) {
    sendNack(connection, requestId, eventType, "MessageNotFound", "Message not found");
    void incrementMetric("nack_sent");
    return;
  }

  const deletedMessage = deleted.rows[0];
  broadcastRoom(
    targetRoom.roomId,
    buildChatDeletedEnvelope({
      id: deletedMessage.id,
      roomId: deletedMessage.room_id,
      roomSlug: targetRoom.roomSlug,
      deletedByUserId: state.userId,
      ts: new Date().toISOString()
    })
  );

  if (targetRoom.roomId !== state.roomId) {
    sendJson(
      connection,
      buildChatDeletedEnvelope({
        id: deletedMessage.id,
        roomId: deletedMessage.room_id,
        roomSlug: targetRoom.roomSlug,
        deletedByUserId: state.userId,
        ts: new Date().toISOString()
      })
    );
  }

  sendAckWithMetrics(connection, requestId, eventType, {
    messageId: deletedMessage.id
  });
}

export async function handleChatTyping(params: ChatCommonParams): Promise<void> {
  const {
    connection,
    state,
    payload,
    requestId,
    eventType,
    getPayloadString,
    sendNoActiveRoomNack,
    dbQuery,
    sendNack,
    sendValidationNack,
    broadcastRoom,
    buildChatTypingEnvelope,
    sendAckWithMetrics
  } = params;

  if (!buildChatTypingEnvelope) {
    sendNack(connection, requestId, eventType, "ServerError", "Typing envelope builder is unavailable");
    return;
  }

  const targetRoom = await resolveChatRoom({
    state,
    payload,
    getPayloadString,
    dbQuery,
    connection,
    requestId,
    eventType,
    sendNoActiveRoomNack,
    sendNack
  });
  if (!targetRoom) {
    return;
  }

  const isTypingRaw = (payload as Record<string, unknown> | undefined)?.isTyping;
  if (typeof isTypingRaw !== "boolean") {
    sendValidationNack(connection, requestId, eventType, "isTyping boolean is required");
    return;
  }

  const typingPayload = {
    roomId: targetRoom.roomId,
    roomSlug: targetRoom.roomSlug,
    userId: state.userId,
    userName: state.userName,
    isTyping: isTypingRaw,
    ts: new Date().toISOString()
  };

  broadcastRoom(targetRoom.roomId, buildChatTypingEnvelope(typingPayload), connection);
  sendAckWithMetrics(connection, requestId, eventType);
}

function mapTopicDomainErrorToNack(
  error: unknown,
  connection: WebSocket,
  requestId: string | null,
  eventType: string,
  sendNack: ChatCommonParams["sendNack"]
): boolean {
  const message = String((error as Error)?.message || "").trim();

  if (message === "message_not_found" || message === "topic_not_found" || message === "room_not_found") {
    sendNack(connection, requestId, eventType, "MessageNotFound", "Message not found");
    return true;
  }

  if (message === "forbidden_room_access" || message === "forbidden_topic_manage") {
    sendNack(connection, requestId, eventType, "Forbidden", "You do not have access to this resource");
    return true;
  }

  if (message === "validation_error") {
    sendNack(connection, requestId, eventType, "ValidationError", "Validation failed");
    return true;
  }

  if (message === "cannot_report_own_message") {
    sendNack(connection, requestId, eventType, "Forbidden", "You cannot report your own message");
    return true;
  }

  if (message === "message_report_exists") {
    sendNack(connection, requestId, eventType, "MessageAlreadyReported", "Message is already reported by this user");
    return true;
  }

  return false;
}

export async function handleChatPin(params: ChatCommonParams): Promise<void> {
  const {
    connection,
    state,
    payload,
    requestId,
    eventType,
    normalizeRequestId,
    getPayloadString,
    sendValidationNack,
    sendNack,
    broadcastRoom,
    sendAckWithMetrics
  } = params;

  const messageId = normalizeRequestId(getPayloadString(payload, "messageId", 128));
  if (!messageId) {
    sendValidationNack(connection, requestId, eventType, "messageId is required");
    return;
  }

  try {
    const { setTopicMessagePinned } = await getTopicMessageOps();
    const result = await setTopicMessagePinned({
      messageId,
      userId: state.userId,
      pinned: true
    });

    const ts = new Date().toISOString();
    broadcastRoom(result.room.id, {
      type: "chat.message.pinned",
      payload: {
        roomId: result.room.id,
        roomSlug: result.room.slug,
        topicId: result.topic.id,
        topicSlug: result.topic.slug,
        messageId: result.messageId,
        pinned: true,
        pinnedByUserId: state.userId,
        ts
      }
    });

    sendAckWithMetrics(connection, requestId, eventType, {
      messageId: result.messageId,
      topicId: result.topic.id
    });
  } catch (error) {
    if (mapTopicDomainErrorToNack(error, connection, requestId, eventType, sendNack)) {
      return;
    }
    sendNack(connection, requestId, eventType, "ServerError", "Failed to pin message");
  }
}

export async function handleChatUnpin(params: ChatCommonParams): Promise<void> {
  const {
    connection,
    state,
    payload,
    requestId,
    eventType,
    normalizeRequestId,
    getPayloadString,
    sendValidationNack,
    sendNack,
    broadcastRoom,
    sendAckWithMetrics
  } = params;

  const messageId = normalizeRequestId(getPayloadString(payload, "messageId", 128));
  if (!messageId) {
    sendValidationNack(connection, requestId, eventType, "messageId is required");
    return;
  }

  try {
    const { setTopicMessagePinned } = await getTopicMessageOps();
    const result = await setTopicMessagePinned({
      messageId,
      userId: state.userId,
      pinned: false
    });

    const ts = new Date().toISOString();
    broadcastRoom(result.room.id, {
      type: "chat.message.unpinned",
      payload: {
        roomId: result.room.id,
        roomSlug: result.room.slug,
        topicId: result.topic.id,
        topicSlug: result.topic.slug,
        messageId: result.messageId,
        pinned: false,
        unpinnedByUserId: state.userId,
        ts
      }
    });

    sendAckWithMetrics(connection, requestId, eventType, {
      messageId: result.messageId,
      topicId: result.topic.id
    });
  } catch (error) {
    if (mapTopicDomainErrorToNack(error, connection, requestId, eventType, sendNack)) {
      return;
    }
    sendNack(connection, requestId, eventType, "ServerError", "Failed to unpin message");
  }
}

async function handleChatReactionToggle(params: ChatCommonParams & { active: boolean }): Promise<void> {
  const {
    connection,
    state,
    payload,
    requestId,
    eventType,
    normalizeRequestId,
    getPayloadString,
    sendValidationNack,
    sendNack,
    broadcastRoom,
    sendAckWithMetrics,
    active
  } = params;

  const messageId = normalizeRequestId(getPayloadString(payload, "messageId", 128));
  const emoji = getPayloadString(payload, "emoji", 32);
  if (!messageId || !emoji) {
    sendValidationNack(connection, requestId, eventType, "messageId and emoji are required");
    return;
  }

  try {
    const { setTopicMessageReaction } = await getTopicMessageOps();
    const result = await setTopicMessageReaction({
      messageId,
      userId: state.userId,
      emoji,
      active
    });

    const ts = new Date().toISOString();
    broadcastRoom(result.room.id, {
      type: "chat.message.reaction.changed",
      payload: {
        roomId: result.room.id,
        roomSlug: result.room.slug,
        topicId: result.topic.id,
        topicSlug: result.topic.slug,
        messageId: result.messageId,
        emoji: result.emoji,
        userId: result.userId,
        active: result.active,
        ts
      }
    });

    sendAckWithMetrics(connection, requestId, eventType, {
      messageId: result.messageId,
      topicId: result.topic.id,
      emoji: result.emoji,
      active: result.active
    });
  } catch (error) {
    if (mapTopicDomainErrorToNack(error, connection, requestId, eventType, sendNack)) {
      return;
    }
    sendNack(connection, requestId, eventType, "ServerError", "Failed to update reaction");
  }
}

export async function handleChatReactionAdd(params: ChatCommonParams): Promise<void> {
  await handleChatReactionToggle({
    ...params,
    active: true
  });
}

export async function handleChatReactionRemove(params: ChatCommonParams): Promise<void> {
  await handleChatReactionToggle({
    ...params,
    active: false
  });
}

export async function handleChatReport(params: ChatCommonParams): Promise<void> {
  const {
    connection,
    state,
    payload,
    requestId,
    eventType,
    normalizeRequestId,
    getPayloadString,
    sendValidationNack,
    sendNack,
    sendAckWithMetrics
  } = params;

  const messageId = normalizeRequestId(getPayloadString(payload, "messageId", 128));
  if (!messageId) {
    sendValidationNack(connection, requestId, eventType, "messageId is required");
    return;
  }

  try {
    const { createTopicMessageReport } = await getTopicMessageOps();
    const result = await createTopicMessageReport({
      messageId,
      userId: state.userId,
      reason: "spam_or_abuse"
    });

    sendAckWithMetrics(connection, requestId, eventType, {
      messageId: result.messageId,
      reportId: result.reportId
    });
  } catch (error) {
    if (mapTopicDomainErrorToNack(error, connection, requestId, eventType, sendNack)) {
      return;
    }
    sendNack(connection, requestId, eventType, "ServerError", "Failed to report message");
  }
}
