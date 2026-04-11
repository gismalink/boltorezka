/**
 * WebSocket-обработчики чата (thin handlers).
 *
 * Бизнес-логика вынесена в сервисы:
 * - room-access-service — проверка доступа, резолв комнат, определение аудитории broadcast.
 * - room-messages-service — CRUD для legacy (non-topic) сообщений.
 * - room-topic-messages-service — CRUD для topic-сообщений (lazy import).
 * - chat-error-mapper — единый маппинг доменных ошибок → WS NACK.
 *
 * Этот файл оставлен как тонкий слой: валидация payload → вызов сервиса → broadcast → ack.
 */
import type { WebSocket } from "ws";
import type { SocketState } from "../ws-protocol.types.ts";
import { mapChatDomainErrorToWsNack } from "../services/chat-error-mapper.js";
import {
  canBypassRoomSendPolicy,
  resolveRoomRealtimeAudienceUserIds,
  resolveRoomById,
  resolveRoomBySlugWithAccessCheck,
  type ResolvedChatRoom,
  type DbQuery
} from "../services/room-access-service.js";
import { insertRoomMessage, editRoomMessage, deleteRoomMessage } from "../services/room-messages-service.js";

// Lazy import: server-mute-service тянет db.js → config.ts.
// Аналогично getTopicMessageOps/getNotificationInboxOps — импортируем при первом вызове.
async function getResolveActiveServerMute() {
  const { resolveActiveServerMute } = await import("../services/server-mute-service.js");
  return resolveActiveServerMute;
}

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
  markTopicRead: (input: {
    topicId: string;
    userId: string;
    lastReadMessageId?: string | null;
  }) => Promise<{
    roomId: string;
    topicId: string;
    lastReadMessageId: string | null;
    lastReadAt: string;
    unreadDelta: number;
    mentionDelta: number;
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
  }) => Promise<string[]>;
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
      createTopicMessageReport: module.createTopicMessageReport,
      markTopicRead: module.markTopicRead
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
  getUserSocketsByUserId?: (userId: string) => WebSocket[];
  getSocketRoomId?: (socket: WebSocket) => string | null;
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

function normalizeMentionUserIdsFromPayload(payload: Record<string, unknown>): string[] {
  const candidates = payload.mentionUserIds ?? payload.mention_user_ids;
  const rawValues: string[] = [];

  if (Array.isArray(candidates)) {
    candidates.forEach((value) => {
      if (typeof value === "string") {
        rawValues.push(value);
      }
    });
  } else if (typeof candidates === "string") {
    candidates
      .split(",")
      .forEach((part) => rawValues.push(part));
  }

  const dedup = new Set<string>();
  rawValues
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .forEach((value) => {
      if (!dedup.has(value) && dedup.size < 100) {
        dedup.add(value);
      }
    });

  return Array.from(dedup);
}

function broadcastToRoomAudienceAcrossOtherRooms(params: {
  roomId: string;
  payload: unknown;
  audienceUserIds: string[];
  excludedSocket: WebSocket;
  getUserSocketsByUserId: (userId: string) => WebSocket[];
  getSocketRoomId: (socket: WebSocket) => string | null;
  sendJson: (socket: WebSocket, payload: unknown) => void;
}) {
  const {
    roomId,
    payload,
    audienceUserIds,
    excludedSocket,
    getUserSocketsByUserId,
    getSocketRoomId,
    sendJson
  } = params;

  const seenSockets = new Set<WebSocket>();
  for (const userId of audienceUserIds) {
    for (const socket of getUserSocketsByUserId(userId)) {
      if (socket === excludedSocket || seenSockets.has(socket)) {
        continue;
      }

      const socketRoomId = String(getSocketRoomId(socket) || "").trim();
      if (socketRoomId === roomId) {
        continue;
      }

      seenSockets.add(socket);
      sendJson(socket, payload);
    }
  }
}

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

    const room = await resolveRoomById(dbQuery, state.roomId);
    if (!room) {
      sendNack(connection, requestId, eventType, "RoomNotFound", "Room does not exist");
      return null;
    }
    return room;
  }

  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, targetRoomSlug, state.userId, {
    activeRoomId: state.roomId,
    activeRoomSlug: state.roomSlug
  });
  if ("error" in result) {
    sendNack(connection, requestId, eventType, result.error.code, result.error.message);
    return null;
  }
  return result.room;
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
    getUserSocketsByUserId = () => [],
    getSocketRoomId = () => null,
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
  const mentionUserIds = normalizeMentionUserIdsFromPayload(payload as Record<string, unknown>);

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

      const resolvedMentionUserIds = await emitMentionInboxEvents({
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
        attachments: [],
        mentionUserIds: resolvedMentionUserIds.length > 0 ? resolvedMentionUserIds : mentionUserIds
      };

      if (idempotencyKey) {
        await redisSetEx(
          `ws:idempotency:${state.userId}:${idempotencyKey}`,
          120,
          JSON.stringify(chatPayload)
        );
      }

      const chatEnvelope = buildChatMessageEnvelope(chatPayload);
      broadcastRoom(result.room.id, chatEnvelope);

      const topicAudienceUserIds = await resolveRoomRealtimeAudienceUserIds(dbQuery, result.room.id);
      broadcastToRoomAudienceAcrossOtherRooms({
        roomId: result.room.id,
        payload: chatEnvelope,
        audienceUserIds: topicAudienceUserIds,
        excludedSocket: connection,
        getUserSocketsByUserId,
        getSocketRoomId,
        sendJson
      });

      if (result.room.id !== state.roomId) {
        sendJson(connection, chatEnvelope);
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
      if (mapChatDomainErrorToWsNack(error, connection, requestId, eventType, sendNack)) {
        return;
      }
      throw error;
    }
  }

  const canBypassPolicies = await canBypassRoomSendPolicy(dbQuery, state.userId, targetRoom.serverId);
  if (!canBypassPolicies && targetRoom.serverId) {
    const resolveActiveServerMute = await getResolveActiveServerMute();
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

  const chatMessage = await insertRoomMessage(dbQuery, {
    roomId: targetRoom.roomId,
    userId: state.userId,
    text
  });

  const chatPayload = {
    id: chatMessage.id,
    roomId: chatMessage.room_id,
    roomSlug: targetRoom.roomSlug,
    userId: chatMessage.user_id,
    userName: state.userName,
    text: chatMessage.body,
    createdAt: chatMessage.created_at,
    senderRequestId: requestId || null,
    attachments: [],
    mentionUserIds
  };

  if (idempotencyKey) {
    await redisSetEx(
      `ws:idempotency:${state.userId}:${idempotencyKey}`,
      120,
      JSON.stringify(chatPayload)
    );
  }

  const chatEnvelope = buildChatMessageEnvelope(chatPayload);
  broadcastRoom(targetRoom.roomId, chatEnvelope);

  const audienceUserIds = await resolveRoomRealtimeAudienceUserIds(dbQuery, targetRoom.roomId);
  broadcastToRoomAudienceAcrossOtherRooms({
    roomId: targetRoom.roomId,
    payload: chatEnvelope,
    audienceUserIds,
    excludedSocket: connection,
    getUserSocketsByUserId,
    getSocketRoomId,
    sendJson
  });

  if (targetRoom.roomId !== state.roomId) {
    sendJson(connection, chatEnvelope);
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

  try {
    const updatedMessage = await editRoomMessage(dbQuery, {
      messageId,
      roomId: targetRoom.roomId,
      userId: state.userId,
      text
    });

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
  } catch (error) {
    if (mapChatDomainErrorToWsNack(error, connection, requestId, eventType, sendNack)) {
      return;
    }
    throw error;
  }
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

  try {
    const deletedMessage = await deleteRoomMessage(dbQuery, {
      messageId,
      roomId: targetRoom.roomId,
      userId: state.userId
    });

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
  } catch (error) {
    if (mapChatDomainErrorToWsNack(error, connection, requestId, eventType, sendNack)) {
      return;
    }
    throw error;
  }
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
    if (mapChatDomainErrorToWsNack(error, connection, requestId, eventType, sendNack)) {
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
    if (mapChatDomainErrorToWsNack(error, connection, requestId, eventType, sendNack)) {
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
    if (mapChatDomainErrorToWsNack(error, connection, requestId, eventType, sendNack)) {
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
    if (mapChatDomainErrorToWsNack(error, connection, requestId, eventType, sendNack)) {
      return;
    }
    sendNack(connection, requestId, eventType, "ServerError", "Failed to report message");
  }
}

export async function handleChatTopicRead(params: ChatCommonParams): Promise<void> {
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

  const topicId = normalizeRequestId(getPayloadString(payload, "topicId", 128));
  if (!topicId) {
    sendValidationNack(connection, requestId, eventType, "topicId is required");
    return;
  }

  const rawLastReadMessageId = getPayloadString(payload, "lastReadMessageId", 128);
  const lastReadMessageId = rawLastReadMessageId ? normalizeRequestId(rawLastReadMessageId) : null;
  if (rawLastReadMessageId && !lastReadMessageId) {
    sendValidationNack(connection, requestId, eventType, "lastReadMessageId must be a valid id");
    return;
  }

  try {
    const { markTopicRead } = await getTopicMessageOps();
    const read = await markTopicRead({
      topicId,
      userId: state.userId,
      lastReadMessageId
    });

    broadcastRoom(read.roomId, {
      type: "chat.topic.read",
      payload: {
        roomId: read.roomId,
        topicId: read.topicId,
        userId: state.userId,
        lastReadMessageId: read.lastReadMessageId,
        lastReadAt: read.lastReadAt,
        unreadDelta: read.unreadDelta,
        mentionDelta: read.mentionDelta
      }
    });

    sendAckWithMetrics(connection, requestId, eventType, {
      topicId: read.topicId,
      lastReadMessageId: read.lastReadMessageId
    });
  } catch (error) {
    if (mapChatDomainErrorToWsNack(error, connection, requestId, eventType, sendNack)) {
      return;
    }
    sendNack(connection, requestId, eventType, "ServerError", "Failed to mark topic as read");
  }
}
