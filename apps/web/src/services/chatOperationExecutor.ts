type SendWsEventFn = (
  eventType: string,
  payload: Record<string, unknown>,
  options?: { withIdempotency?: boolean; maxRetries?: number }
) => string | null;

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
    transport: "http-only"
  },
  "chat.unpin": {
    transport: "http-only"
  },
  "chat.reaction.add": {
    transport: "http-only"
  },
  "chat.reaction.remove": {
    transport: "http-only"
  },
  "chat.report": {
    transport: "http-only"
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
  | { kind: "ws"; requestId: string }
  | { kind: "http"; value: T }
  | { kind: "failed" };

export type ExecuteHttpOnlyResult<T> =
  | { kind: "http"; value: T }
  | { kind: "failed" };

export type ExecuteHttpWithErrorResult<T> =
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
  payload?: Record<string, unknown>;
  httpRequest?: () => Promise<T>;
};

export async function executeChatOperation<T>({
  policy,
  sendWsEvent,
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
    const requestId = sendWsEvent(policy.ws.eventType, payload, {
      withIdempotency: policy.ws.withIdempotency,
      maxRetries: policy.ws.maxRetries
    });
    return requestId ? { kind: "ws", requestId } : { kind: "failed" };
  }

  if (!httpRequest) {
    return { kind: "failed" };
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
  payload,
  httpRequest
}: ExecuteChatOperationInput<T>): Promise<ExecuteWsFirstWithHttpFallbackResult<T> | ExecuteHttpWithErrorResult<T>> {
  if (policy.transport === "http-only") {
    if (!httpRequest) {
      return { kind: "failed", error: new Error("httpRequest is required") };
    }
    return executeHttpWithError(httpRequest);
  }

  const result = await executeChatOperation({
    policy,
    sendWsEvent,
    payload,
    httpRequest
  });

  if (result.kind === "failed") {
    return { kind: "failed", error: new Error("operation failed") };
  }

  return result;
}
