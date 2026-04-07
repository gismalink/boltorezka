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
