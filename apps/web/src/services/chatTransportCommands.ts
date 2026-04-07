import { api } from "../api";
import {
  CHAT_OPERATION_POLICIES,
  executeChatOperation,
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

type ChatDeleteResult = ExecuteWsFirstWithHttpFallbackResult<void> | ExecuteHttpOnlyResult<void>;

type RunChatDeleteInput = {
  authToken: string;
  messageId: string;
  roomSlug: string;
  topicId?: string;
  sendWsEvent: SendWsEventFn;
  sendWsEventAwaitAck: SendWsEventAwaitAckFn;
};

export async function runChatEdit({
  authToken,
  messageId,
  text,
  roomSlug,
  topicId,
  maxRetries,
  sendWsEvent,
  sendWsEventAwaitAck
}: RunChatEditInput): Promise<ChatDeleteResult> {
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
}: RunChatDeleteInput): Promise<ChatDeleteResult> {
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
