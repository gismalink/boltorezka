import { mapChatDomainErrorToWsNack } from "../services/chat-error-mapper.js";
import {
  canBypassRoomSendPolicy,
  resolveRoomRealtimeAudienceUserIds,
  type ResolvedChatRoom
} from "../services/room-access-service.js";
import { insertRoomMessage } from "../services/room-messages-service.js";
import { broadcastToRoomAudienceAcrossOtherRooms } from "../utils/chat-helpers.js";
import type { WebSocket } from "ws";
import type { ChatCommonParams, TopicMessageOps, NotificationInboxOps } from "../types/chat-handler.types.ts";

type TopicOpsProvider = () => Promise<TopicMessageOps>;
type NotificationOpsProvider = () => Promise<NotificationInboxOps>;

type TopicCommonParams = ChatCommonParams & {
  getTopicMessageOps: TopicOpsProvider;
};

type TopicSendParams = TopicCommonParams & {
  topicId: string;
  text: string;
  replyToMessageId: string | null;
  mentionUserIds: string[];
  idempotencyKey: string | null;
  getNotificationInboxOps: NotificationOpsProvider;
  getUserSocketsByUserId: (userId: string) => WebSocket[];
  getSocketRoomId: (socket: WebSocket) => string | null;
};

type ResolveActiveServerMute = (serverId: string, userId: string) => Promise<{
  isMuted: boolean;
  expiresAt?: string | null;
  retryAfterSec?: number | null;
}>;

type LegacySendParams = ChatCommonParams & {
  targetRoom: ResolvedChatRoom;
  text: string;
  mentionUserIds: string[];
  idempotencyKey: string | null;
  getResolveActiveServerMute: () => Promise<ResolveActiveServerMute>;
  getUserSocketsByUserId: (userId: string) => WebSocket[];
  getSocketRoomId: (socket: WebSocket) => string | null;
};

type IdempotencyReplayParams = Pick<
  ChatCommonParams,
  "connection" | "requestId" | "eventType" | "sendJson" | "buildChatMessageEnvelope" | "sendAckWithMetrics" | "redisGet" | "redisDel"
> & {
  userId: string;
  idempotencyKey: string;
};

export async function handleChatIdempotencyReplay(params: IdempotencyReplayParams): Promise<boolean> {
  const {
    connection,
    requestId,
    eventType,
    sendJson,
    buildChatMessageEnvelope,
    sendAckWithMetrics,
    redisGet,
    redisDel,
    userId,
    idempotencyKey
  } = params;

  const idemRedisKey = `ws:idempotency:${userId}:${idempotencyKey}`;
  const cachedPayloadRaw = await redisGet(idemRedisKey);
  if (!cachedPayloadRaw) {
    return false;
  }

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

  return true;
}

export async function handleLegacyChatSend(params: LegacySendParams): Promise<void> {
  const {
    connection,
    state,
    requestId,
    eventType,
    sendNack,
    sendJson,
    buildChatMessageEnvelope,
    sendAckWithMetrics,
    dbQuery,
    redisGet,
    redisSetEx,
    broadcastRoom,
    targetRoom,
    text,
    mentionUserIds,
    idempotencyKey,
    getResolveActiveServerMute,
    getUserSocketsByUserId,
    getSocketRoomId
  } = params;

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

export async function handleTopicChatSend(params: TopicSendParams): Promise<void> {
  const {
    connection,
    state,
    requestId,
    eventType,
    sendNack,
    sendJson,
    buildChatMessageEnvelope,
    sendAckWithMetrics,
    dbQuery,
    redisSetEx,
    broadcastRoom,
    topicId,
    text,
    replyToMessageId,
    mentionUserIds,
    idempotencyKey,
    getTopicMessageOps,
    getNotificationInboxOps,
    getUserSocketsByUserId,
    getSocketRoomId
  } = params;

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
  } catch (error) {
    if (mapChatDomainErrorToWsNack(error, connection, requestId, eventType, sendNack)) {
      return;
    }
    throw error;
  }
}

export async function handleTopicChatPin(params: TopicCommonParams): Promise<void> {
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
    getTopicMessageOps
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

export async function handleTopicChatUnpin(params: TopicCommonParams): Promise<void> {
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
    getTopicMessageOps
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

async function handleTopicChatReactionToggle(
  params: TopicCommonParams & { active: boolean }
): Promise<void> {
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
    active,
    getTopicMessageOps
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

export async function handleTopicChatReactionAdd(params: TopicCommonParams): Promise<void> {
  await handleTopicChatReactionToggle({
    ...params,
    active: true
  });
}

export async function handleTopicChatReactionRemove(params: TopicCommonParams): Promise<void> {
  await handleTopicChatReactionToggle({
    ...params,
    active: false
  });
}

export async function handleTopicChatReport(params: TopicCommonParams): Promise<void> {
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
    sendAckWithMetrics,
    getTopicMessageOps
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

export async function handleTopicChatRead(params: TopicCommonParams): Promise<void> {
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
    getTopicMessageOps
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
