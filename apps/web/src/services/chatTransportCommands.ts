/**
 * chatTransportCommands.ts — конкретные операции чата поверх `chatOperationExecutor`.
 *
 * Назначение:
 * - `runChatEdit` / `runChatDelete` / `runChatTogglePin` / `runChatToggleReaction`
 *   / `runChatReport` / `runChatSend` — каждая операция знает свой политикой исполнения
 *   (WS-first/HTTP-only) и payload для API/WS.
 * - Возвращает унифицированные результаты (`ChatMutationResult`, `ChatReportResult`).
 *
 * Используется хуками composer’а и admin-панели чата.
 */
import { api } from "../api";
import {
  CHAT_OPERATION_POLICIES,
  executeChatOperation,
  executeChatOperationWithError,
  type ExecuteHttpOnlyResult,
  type ExecuteWsFirstWithHttpFallbackResult
} from "./chatOperationExecutor";
import { normalizeBusinessErrorCode } from "./chatErrorUtils";

export type SendWsEventFn = (
  eventType: string,
  payload: Record<string, unknown>,
  options?: { withIdempotency?: boolean; maxRetries?: number }
) => string | null;

export type SendWsEventAwaitAckFn = (
  eventType: string,
  payload: Record<string, unknown>,
  options?: { withIdempotency?: boolean; maxRetries?: number }
) => Promise<void>;

type RunChatEditInput = {
  authToken: string;
  messageId: string;
  text: string;
  roomSlug: string;
  topicId?: string;
  maxRetries: number;
  sendWsEvent: SendWsEventFn;
  sendWsEventAwaitAck: SendWsEventAwaitAckFn;
};

type ChatMutationResult = ExecuteWsFirstWithHttpFallbackResult<void> | ExecuteHttpOnlyResult<void>;

type RunChatDeleteInput = {
  authToken: string;
  messageId: string;
  roomSlug: string;
  topicId?: string;
  sendWsEvent: SendWsEventFn;
  sendWsEventAwaitAck: SendWsEventAwaitAckFn;
};

type RunChatTogglePinInput = {
  authToken: string;
  messageId: string;
  currentlyPinned: boolean;
  roomSlug: string;
  topicId?: string;
  sendWsEvent: SendWsEventFn;
  sendWsEventAwaitAck: SendWsEventAwaitAckFn;
};

type RunChatToggleReactionInput = {
  authToken: string;
  messageId: string;
  emoji: string;
  currentlyActive: boolean;
  roomSlug: string;
  topicId?: string;
  sendWsEvent: SendWsEventFn;
  sendWsEventAwaitAck: SendWsEventAwaitAckFn;
};

type RunChatReportInput = {
  authToken: string;
  messageId: string;
  sendWsEventAwaitAck: SendWsEventAwaitAckFn;
};

type RunChatSendInput = {
  authToken: string;
  text: string;
  roomSlug: string;
  topicId?: string;
  replyToMessageId?: string;
  mentionUserIds?: string[];
  maxRetries: number;
  sendWsEvent: SendWsEventFn;
  sendWsEventAwaitAck: SendWsEventAwaitAckFn;
};

type ChatReportResult =
  | { kind: "ws" }
  | { kind: "http"; value: void }
  | { kind: "failed"; error: unknown };

export async function runChatEdit({
  authToken,
  messageId,
  text,
  roomSlug,
  topicId,
  maxRetries,
  sendWsEvent,
  sendWsEventAwaitAck
}: RunChatEditInput): Promise<ChatMutationResult> {
  return executeChatOperation({
    policy: {
      transport: "ws-first-http-fallback",
      ws: {
        eventType: "chat.edit",
        withIdempotency: true,
        maxRetries
      }
    },
    sendWsEvent,
    sendWsEventAwaitAck,
    payload: {
      messageId,
      text,
      roomSlug,
      topicId: topicId || undefined
    },
    httpRequest: async () => {
      await api.editMessage(authToken, messageId, { text });
    }
  });
}

export async function runChatDelete({
  authToken,
  messageId,
  roomSlug,
  topicId,
  sendWsEvent,
  sendWsEventAwaitAck
}: RunChatDeleteInput): Promise<ChatMutationResult> {
  return executeChatOperation({
    policy: CHAT_OPERATION_POLICIES["chat.delete"],
    sendWsEvent,
    sendWsEventAwaitAck,
    payload: {
      messageId,
      roomSlug,
      topicId: topicId || undefined
    },
    httpRequest: async () => {
      await api.deleteMessage(authToken, messageId);
    }
  });
}

export async function runChatTogglePin({
  authToken,
  messageId,
  currentlyPinned,
  roomSlug,
  topicId,
  sendWsEvent,
  sendWsEventAwaitAck
}: RunChatTogglePinInput): Promise<ExecuteWsFirstWithHttpFallbackResult<boolean> | ExecuteHttpOnlyResult<boolean>> {
  return executeChatOperation({
    policy: currentlyPinned ? CHAT_OPERATION_POLICIES["chat.unpin"] : CHAT_OPERATION_POLICIES["chat.pin"],
    sendWsEvent,
    sendWsEventAwaitAck,
    payload: {
      messageId,
      roomSlug,
      topicId: topicId || undefined
    },
    httpRequest: async () => {
      if (currentlyPinned) {
        await api.unpinMessage(authToken, messageId);
        return false;
      }

      await api.pinMessage(authToken, messageId);
      return true;
    }
  });
}

export async function runChatToggleReaction({
  authToken,
  messageId,
  emoji,
  currentlyActive,
  roomSlug,
  topicId,
  sendWsEvent,
  sendWsEventAwaitAck
}: RunChatToggleReactionInput): Promise<ChatMutationResult> {
  return executeChatOperation({
    policy: currentlyActive ? CHAT_OPERATION_POLICIES["chat.reaction.remove"] : CHAT_OPERATION_POLICIES["chat.reaction.add"],
    sendWsEvent,
    sendWsEventAwaitAck,
    payload: {
      messageId,
      emoji,
      roomSlug,
      topicId: topicId || undefined
    },
    httpRequest: async () => {
      if (currentlyActive) {
        await api.removeMessageReaction(authToken, messageId, emoji);
        return;
      }

      await api.addMessageReaction(authToken, messageId, emoji);
    }
  });
}

export async function runChatReport({
  authToken,
  messageId,
  sendWsEventAwaitAck
}: RunChatReportInput): Promise<ChatReportResult> {
  const result = await executeChatOperationWithError({
    policy: CHAT_OPERATION_POLICIES["chat.report"],
    sendWsEventAwaitAck,
    payload: { messageId },
    httpRequest: async () => {
      await api.reportMessage(authToken, messageId, {
        reason: "spam_or_abuse"
      });
    }
  });

  if (result.kind === "failed" && !("error" in result)) {
    return { kind: "failed", error: new Error("operation failed") };
  }

  if (result.kind === "failed") {
    return {
      kind: "failed",
      error: normalizeBusinessErrorCode(result.error)
    };
  }

  return result;
}

export async function runChatSend({
  authToken,
  text,
  roomSlug,
  topicId,
  replyToMessageId,
  mentionUserIds,
  maxRetries,
  sendWsEvent,
  sendWsEventAwaitAck
}: RunChatSendInput): Promise<ChatMutationResult> {
  return executeChatOperation({
    policy: {
      transport: "ws-first-http-fallback",
      ws: {
        eventType: "chat.send",
        withIdempotency: true,
        maxRetries
      }
    },
    sendWsEvent,
    sendWsEventAwaitAck,
    payload: {
      text,
      roomSlug,
      topicId: topicId || undefined,
      replyToMessageId: replyToMessageId || undefined,
      mentionUserIds: mentionUserIds?.length ? mentionUserIds : undefined
    },
    httpRequest: async () => {
      if (topicId && replyToMessageId) {
        await api.replyMessage(authToken, replyToMessageId, { text, mentionUserIds });
        return;
      }

      if (topicId) {
        await api.createTopicMessage(authToken, topicId, { text, mentionUserIds });
        return;
      }

      await api.createRoomMessage(authToken, roomSlug, { text, mentionUserIds });
    }
  });
}
