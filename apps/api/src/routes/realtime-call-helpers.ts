import type { WebSocket } from "ws";
import { sendAck } from "./realtime-io.js";
import { isDuplicateCallSignal } from "./realtime-idempotency.js";

type RedisSetLike = {
  set: (...args: any[]) => Promise<unknown>;
};

type IncrementMetricFn = (name: string) => Promise<unknown>;

type CallStateLike = {
  userId: string;
  sessionId: string;
};

export function createRealtimeCallHelpers(redis: RedisSetLike, incrementMetric: IncrementMetricFn) {
  const sendAckWithMetrics = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta: Record<string, unknown> = {},
    additionalMetrics: string[] = []
  ) => {
    sendAck(socket, requestId, eventType, meta);
    void incrementMetric("ack_sent");
    for (const metricName of additionalMetrics) {
      void incrementMetric(metricName);
    }
  };

  const handleCallIdempotency = async (
    socket: WebSocket,
    state: CallStateLike,
    requestId: string | null,
    eventType: string
  ): Promise<boolean> => {
    if (!requestId) {
      return false;
    }

    try {
      const isDuplicate = await isDuplicateCallSignal(
        redis,
        state.userId,
        eventType,
        requestId
      );

      if (!isDuplicate) {
        return false;
      }

      sendAckWithMetrics(
        socket,
        requestId,
        eventType,
        {
          duplicate: true,
          idempotencyKey: requestId
        },
        ["call_idempotency_hit"]
      );

      return true;
    } catch {
      return false;
    }
  };

  const buildCallTraceId = (
    eventType: string,
    requestId: string | null,
    sessionId: string
  ): string => {
    if (requestId) {
      return `${eventType}:${sessionId}:${requestId}`;
    }

    return `${eventType}:${sessionId}:${Date.now()}`;
  };

  return {
    sendAckWithMetrics,
    handleCallIdempotency,
    buildCallTraceId
  };
}