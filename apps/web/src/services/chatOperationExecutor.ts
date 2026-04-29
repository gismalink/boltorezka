/**
 * chatOperationExecutor.ts — единая стратегия исполнения операций чата (WS-first / HTTP fallback).
 *
 * Назначение:
 * - Описывает таблицу политик `CHAT_OPERATION_POLICIES` для каждой операции (send/edit/delete/...).
 * - Реализует `executeWsFirstWithHttpFallback`, `executeHttpOnly`, `executeHttpWithError`,
 *   `executeWsFirstWithHttpFallbackAwaitAck` и `executeChatOperation` — общие исполнители.
 * - Распознаёт транзиентные WS-ошибки (`isTransientWsError`) и решает, делать ли HTTP-fallback.
 *
 * Используется в `chatTransportCommands` и `chatMessageSendService`.
 */
type SendWsEventFn = (
  eventType: string,
  payload: Record<string, unknown>,
  options?: { withIdempotency?: boolean; maxRetries?: number }
) => string | null;

type SendWsEventAwaitAckFn = (
  eventType: string,
  payload: Record<string, unknown>,
  options?: { withIdempotency?: boolean; maxRetries?: number }
) => Promise<void>;

type WsOperationConfig = {
  eventType: string;
  withIdempotency?: boolean;
  maxRetries?: number;
};

type ChatOperationPolicy =
  | { transport: "http-only" }
  | { transport: "ws-only"; ws: WsOperationConfig }
  | { transport: "ws-first-http-fallback"; ws: WsOperationConfig };

export type ChatOperationPolicyId =
  | "chat.edit"
  | "chat.delete"
  | "chat.pin"
  | "chat.unpin"
  | "chat.reaction.add"
  | "chat.reaction.remove"
  | "chat.report";

export const CHAT_OPERATION_POLICIES: Record<ChatOperationPolicyId, ChatOperationPolicy> = {
  "chat.edit": {
    transport: "ws-first-http-fallback",
    ws: {
      eventType: "chat.edit",
      withIdempotency: true
    }
  },
  "chat.delete": {
    transport: "ws-first-http-fallback",
    ws: {
      eventType: "chat.delete",
      withIdempotency: true,
      maxRetries: 1
    }
  },
  "chat.pin": {
    transport: "ws-first-http-fallback",
    ws: {
      eventType: "chat.pin",
      withIdempotency: true,
      maxRetries: 1
    }
  },
  "chat.unpin": {
    transport: "ws-first-http-fallback",
    ws: {
      eventType: "chat.unpin",
      withIdempotency: true,
      maxRetries: 1
    }
  },
  "chat.reaction.add": {
    transport: "ws-first-http-fallback",
    ws: {
      eventType: "chat.reaction.add",
      withIdempotency: true,
      maxRetries: 1
    }
  },
  "chat.reaction.remove": {
    transport: "ws-first-http-fallback",
    ws: {
      eventType: "chat.reaction.remove",
      withIdempotency: true,
      maxRetries: 1
    }
  },
  "chat.report": {
    transport: "ws-first-http-fallback",
    ws: {
      eventType: "chat.report",
      withIdempotency: true,
      maxRetries: 1
    }
  }
};

type ExecuteWsFirstWithHttpFallbackInput<T> = {
  sendWsEvent: SendWsEventFn;
  eventType: string;
  payload: Record<string, unknown>;
  withIdempotency?: boolean;
  maxRetries?: number;
  httpFallback: () => Promise<T>;
};

export type ExecuteWsFirstWithHttpFallbackResult<T> =
  | { kind: "ws"; requestId?: string }
  | { kind: "http"; value: T }
  | { kind: "failed" };

export type ExecuteHttpOnlyResult<T> =
  | { kind: "http"; value: T }
  | { kind: "failed" };

export type ExecuteHttpWithErrorResult<T> =
  | { kind: "http"; value: T }
  | { kind: "failed"; error: unknown };

export type ExecuteWsFirstWithHttpFallbackWithErrorResult<T> =
  | { kind: "ws"; requestId?: string }
  | { kind: "http"; value: T }
  | { kind: "failed"; error: unknown };

export async function executeWsFirstWithHttpFallback<T>({
  sendWsEvent,
  eventType,
  payload,
  withIdempotency,
  maxRetries,
  httpFallback
}: ExecuteWsFirstWithHttpFallbackInput<T>): Promise<ExecuteWsFirstWithHttpFallbackResult<T>> {
  const requestId = sendWsEvent(eventType, payload, {
    withIdempotency,
    maxRetries
  });

  if (requestId) {
    return { kind: "ws", requestId };
  }

  try {
    // Единый фолбэк-контур: если WS недоступен, операция пробуется через HTTP.
    const value = await httpFallback();
    return { kind: "http", value };
  } catch {
    return { kind: "failed" };
  }
}

type ExecuteWsFirstWithHttpFallbackAwaitAckInput<T> = {
  sendWsEventAwaitAck: SendWsEventAwaitAckFn;
  eventType: string;
  payload: Record<string, unknown>;
  withIdempotency?: boolean;
  maxRetries?: number;
  httpFallback: () => Promise<T>;
};

type ExecuteWsFirstWithHttpFallbackAwaitAckWithErrorResult<T> =
  | { kind: "ws" }
  | { kind: "http"; value: T }
  | { kind: "failed"; error: unknown };

export function isTransientWsError(error: unknown): boolean {
  const retryableCodes = new Set([
    "ws_not_connected",
    "ws_disposed",
    "ack_timeout",
    "toomanyrequests",
    "servicetemporarilyunavailable",
    "serviceunavailable",
    "gatewaytimeout"
  ]);

  const errorRecord = (error as { code?: unknown; message?: unknown } | null) ?? null;
  const explicitCode = String(errorRecord?.code || "").trim().toLowerCase();
  if (explicitCode) {
    return retryableCodes.has(explicitCode);
  }

  const message = String(errorRecord?.message || "").trim();
  if (!message) {
    return false;
  }

  const normalizedMessage = message.toLowerCase();
  if (normalizedMessage === "ws_not_connected" || normalizedMessage === "ws_disposed") {
    return true;
  }

  const parts = message.split(":").map((part) => part.trim()).filter(Boolean);
  const parsedCodeCandidate = String(parts[1] || parts[0] || "").toLowerCase();
  if (parsedCodeCandidate) {
    return retryableCodes.has(parsedCodeCandidate);
  }

  return false;
}

export async function executeWsFirstWithHttpFallbackAwaitAck<T>({
  sendWsEventAwaitAck,
  eventType,
  payload,
  withIdempotency,
  maxRetries,
  httpFallback
}: ExecuteWsFirstWithHttpFallbackAwaitAckInput<T>): Promise<ExecuteWsFirstWithHttpFallbackResult<T>> {
  try {
    await sendWsEventAwaitAck(eventType, payload, {
      withIdempotency,
      maxRetries
    });
    return { kind: "ws" };
  } catch (error) {
    // Фолбэк через HTTP только для сетевых/временных WS-сбоев.
    if (!isTransientWsError(error)) {
      return { kind: "failed" };
    }
  }

  try {
    const value = await httpFallback();
    return { kind: "http", value };
  } catch {
    return { kind: "failed" };
  }
}

export async function executeWsFirstWithHttpFallbackAwaitAckWithError<T>({
  sendWsEventAwaitAck,
  eventType,
  payload,
  withIdempotency,
  maxRetries,
  httpFallback
}: ExecuteWsFirstWithHttpFallbackAwaitAckInput<T>): Promise<ExecuteWsFirstWithHttpFallbackAwaitAckWithErrorResult<T>> {
  try {
    await sendWsEventAwaitAck(eventType, payload, {
      withIdempotency,
      maxRetries
    });
    return { kind: "ws" };
  } catch (error) {
    if (!isTransientWsError(error)) {
      return { kind: "failed", error };
    }
  }

  try {
    const value = await httpFallback();
    return { kind: "http", value };
  } catch (error) {
    return { kind: "failed", error };
  }
}

export async function executeHttpOnly<T>(httpRequest: () => Promise<T>): Promise<ExecuteHttpOnlyResult<T>> {
  try {
    // Единая точка для HTTP-only операций: одинаковый контракт успеха/ошибки.
    const value = await httpRequest();
    return { kind: "http", value };
  } catch {
    return { kind: "failed" };
  }
}

export async function executeHttpWithError<T>(
  httpRequest: () => Promise<T>
): Promise<ExecuteHttpWithErrorResult<T>> {
  try {
    const value = await httpRequest();
    return { kind: "http", value };
  } catch (error) {
    return { kind: "failed", error };
  }
}

type ExecuteChatOperationInput<T> = {
  policy: ChatOperationPolicy;
  sendWsEvent?: SendWsEventFn;
  sendWsEventAwaitAck?: SendWsEventAwaitAckFn;
  payload?: Record<string, unknown>;
  httpRequest?: () => Promise<T>;
};

export async function executeChatOperation<T>({
  policy,
  sendWsEvent,
  sendWsEventAwaitAck,
  payload,
  httpRequest
}: ExecuteChatOperationInput<T>): Promise<ExecuteWsFirstWithHttpFallbackResult<T> | ExecuteHttpOnlyResult<T>> {
  if (policy.transport === "http-only") {
    if (!httpRequest) {
      return { kind: "failed" };
    }
    return executeHttpOnly(httpRequest);
  }

  if (!sendWsEvent || !payload) {
    return { kind: "failed" };
  }

  if (policy.transport === "ws-only") {
    if (sendWsEventAwaitAck) {
      try {
        await sendWsEventAwaitAck(policy.ws.eventType, payload, {
          withIdempotency: policy.ws.withIdempotency,
          maxRetries: policy.ws.maxRetries
        });
        return { kind: "ws" };
      } catch {
        return { kind: "failed" };
      }
    }

    const requestId = sendWsEvent(policy.ws.eventType, payload, {
      withIdempotency: policy.ws.withIdempotency,
      maxRetries: policy.ws.maxRetries
    });
    return requestId ? { kind: "ws", requestId } : { kind: "failed" };
  }

  if (!httpRequest) {
    return { kind: "failed" };
  }

  if (sendWsEventAwaitAck) {
    return executeWsFirstWithHttpFallbackAwaitAck({
      sendWsEventAwaitAck,
      eventType: policy.ws.eventType,
      payload,
      withIdempotency: policy.ws.withIdempotency,
      maxRetries: policy.ws.maxRetries,
      httpFallback: httpRequest
    });
  }

  return executeWsFirstWithHttpFallback({
    sendWsEvent,
    eventType: policy.ws.eventType,
    payload,
    withIdempotency: policy.ws.withIdempotency,
    maxRetries: policy.ws.maxRetries,
    httpFallback: httpRequest
  });
}

export async function executeChatOperationWithError<T>({
  policy,
  sendWsEvent,
  sendWsEventAwaitAck,
  payload,
  httpRequest
}: ExecuteChatOperationInput<T>): Promise<ExecuteWsFirstWithHttpFallbackWithErrorResult<T> | ExecuteHttpWithErrorResult<T>> {
  if (policy.transport === "http-only") {
    if (!httpRequest) {
      return { kind: "failed", error: new Error("httpRequest is required") };
    }
    return executeHttpWithError(httpRequest);
  }

  if (!payload) {
    return { kind: "failed", error: new Error("payload is required") };
  }

  if (policy.transport === "ws-only") {
    if (!sendWsEvent) {
      return { kind: "failed", error: new Error("sendWsEvent is required") };
    }

    if (sendWsEventAwaitAck) {
      try {
        await sendWsEventAwaitAck(policy.ws.eventType, payload, {
          withIdempotency: policy.ws.withIdempotency,
          maxRetries: policy.ws.maxRetries
        });
        return { kind: "ws" };
      } catch (error) {
        return { kind: "failed", error };
      }
    }

    const requestId = sendWsEvent(policy.ws.eventType, payload, {
      withIdempotency: policy.ws.withIdempotency,
      maxRetries: policy.ws.maxRetries
    });
    return requestId
      ? { kind: "ws", requestId }
      : { kind: "failed", error: new Error("ws request not sent") };
  }

  if (!httpRequest) {
    return { kind: "failed", error: new Error("httpRequest is required") };
  }

  if (sendWsEventAwaitAck) {
    return executeWsFirstWithHttpFallbackAwaitAckWithError({
      sendWsEventAwaitAck,
      eventType: policy.ws.eventType,
      payload,
      withIdempotency: policy.ws.withIdempotency,
      maxRetries: policy.ws.maxRetries,
      httpFallback: httpRequest
    });
  }

  if (!sendWsEvent) {
    return { kind: "failed", error: new Error("sendWsEvent is required") };
  }

  const requestId = sendWsEvent(policy.ws.eventType, payload, {
    withIdempotency: policy.ws.withIdempotency,
    maxRetries: policy.ws.maxRetries
  });

  if (requestId) {
    return { kind: "ws", requestId };
  }

  return executeHttpWithError(httpRequest);
}
