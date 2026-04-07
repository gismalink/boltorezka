import { api } from "../api";
import {
  CHAT_OPERATION_POLICIES,
  executeChatOperation,
  executeChatOperationWithError,
  type ExecuteHttpOnlyResult,
  type ExecuteWsFirstWithHttpFallbackResult
} from "./chatOperationExecutor";

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

type ChatReportResult =
  | { kind: "ws" }
  | { kind: "http"; value: void }
  | { kind: "failed"; error: unknown };

function extractBusinessCodeFromErrorMessage(message: string): string {
  const parts = String(message || "")
    .split(":")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return "";
  }

  const candidate = parts[1] || "";
  return /^[A-Z][A-Za-z0-9_]*$/.test(candidate) ? candidate : "";
}

function normalizeBusinessErrorCode(error: unknown): unknown {
  const explicitCode = String((error as { code?: string } | null)?.code || "").trim();
  if (explicitCode) {
    return error;
  }

  const message = String((error as { message?: string } | null)?.message || "").trim();
  const parsedCode = extractBusinessCodeFromErrorMessage(message);
  if (!parsedCode) {
    return error;
  }

  if (error && typeof error === "object") {
    return Object.assign(error as Record<string, unknown>, { code: parsedCode });
  }

  return {
    code: parsedCode,
    message
  };
}

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
