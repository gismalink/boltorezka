/**
 * WebSocket-обработчики чата (thin handlers).
 *
 * Бизнес-логика вынесена в сервисы:
 * - room-access-service — проверка доступа, резолв комнат, определение аудитории broadcast.
 * - room-messages-service — CRUD для legacy (non-topic) сообщений.
 * - room-topic-messages-service — CRUD для topic-сообщений (lazy import).
 * - chat-error-mapper — единый маппинг доменных ошибок → WS NACK.
 *
 * Типы вынесены в types/chat-handler.types.ts.
 * Утилиты — в utils/chat-helpers.ts.
 */
import type { WebSocket } from "ws";
import type { SocketState } from "../ws-protocol.types.ts";
import type { ChatCommonParams } from "../types/chat-handler.types.ts";
import { mapChatDomainErrorToWsNack } from "../services/chat-error-mapper.js";
import type { DbQuery } from "../services/room-access-service.js";
import { normalizeMentionUserIdsFromPayload } from "../utils/chat-helpers.js";
import { resolveChatRoomForEvent } from "./realtime-chat-room-resolver.js";
import {
  handleRoomChatDelete,
  handleRoomChatEdit,
  handleRoomChatTyping
} from "./realtime-chat-message-handlers.js";
import {
  getNotificationInboxOps,
  getTopicMessageOps,
  setNotificationInboxOpsLoaderForTests,
  setTopicMessageOpsLoaderForTests
} from "./realtime-topic-ops-loader.js";
import {
  handleChatIdempotencyReplay,
  handleLegacyChatSend,
  handleTopicChatPin,
  handleTopicChatReactionAdd,
  handleTopicChatReactionRemove,
  handleTopicChatSend,
  handleTopicChatReport,
  handleTopicChatRead,
  handleTopicChatUnpin
} from "./realtime-topic-message-handlers.js";

export type { ChatCommonParams } from "../types/chat-handler.types.ts";
export { setNotificationInboxOpsLoaderForTests, setTopicMessageOpsLoaderForTests };

// Lazy import: server-mute-service тянет db.js → config.ts.
async function getResolveActiveServerMute() {
  const { resolveActiveServerMute } = await import("../services/server-mute-service.js");
  return resolveActiveServerMute;
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

  const targetRoom = await resolveChatRoomForEvent({
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
    const wasReplayed = await handleChatIdempotencyReplay({
      connection,
      requestId,
      eventType,
      sendJson,
      buildChatMessageEnvelope,
      sendAckWithMetrics,
      redisGet,
      redisDel,
      userId: state.userId,
      idempotencyKey
    });
    if (wasReplayed) {
      return;
    }
  }

  if (topicId) {
    await handleTopicChatSend({
      ...params,
      topicId,
      text,
      replyToMessageId,
      mentionUserIds,
      idempotencyKey,
      getTopicMessageOps,
      getNotificationInboxOps,
      getUserSocketsByUserId,
      getSocketRoomId
    });
    return;
  }

  await handleLegacyChatSend({
    ...params,
    targetRoom,
    text,
    mentionUserIds,
    idempotencyKey,
    getResolveActiveServerMute,
    getUserSocketsByUserId,
    getSocketRoomId
  });
}

export async function handleChatEdit(params: ChatCommonParams): Promise<void> {
  await handleRoomChatEdit(params);
}

export async function handleChatDelete(params: ChatCommonParams): Promise<void> {
  await handleRoomChatDelete(params);
}

export async function handleChatTyping(params: ChatCommonParams): Promise<void> {
  await handleRoomChatTyping(params);
}

export async function handleChatPin(params: ChatCommonParams): Promise<void> {
  await handleTopicChatPin({
    ...params,
    getTopicMessageOps
  });
}

export async function handleChatUnpin(params: ChatCommonParams): Promise<void> {
  await handleTopicChatUnpin({
    ...params,
    getTopicMessageOps
  });
}

export async function handleChatReactionAdd(params: ChatCommonParams): Promise<void> {
  await handleTopicChatReactionAdd({
    ...params,
    getTopicMessageOps
  });
}

export async function handleChatReactionRemove(params: ChatCommonParams): Promise<void> {
  await handleTopicChatReactionRemove({
    ...params,
    getTopicMessageOps
  });
}

export async function handleChatReport(params: ChatCommonParams): Promise<void> {
  await handleTopicChatReport({
    ...params,
    getTopicMessageOps
  });
}

export async function handleChatTopicRead(params: ChatCommonParams): Promise<void> {
  await handleTopicChatRead({
    ...params,
    getTopicMessageOps
  });
}
