type SendWsEventFn = (
  eventType: string,
  payload: Record<string, unknown>,
  options?: { withIdempotency?: boolean; maxRetries?: number }
) => string | null;

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
