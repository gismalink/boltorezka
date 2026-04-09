import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { RealtimeClient } from "../../services";

type WsSendOptions = {
  withIdempotency?: boolean;
  trackAck?: boolean;
  maxRetries?: number;
};

type UseWsEventAcksArgs = {
  realtimeClientRef: MutableRefObject<RealtimeClient | null>;
};

export function useWsEventAcks({ realtimeClientRef }: UseWsEventAcksArgs) {
  const pendingWsRequestResolversRef = useRef<
    Map<string, { resolve: () => void; reject: (error: Error) => void; timeoutId: number }>
  >(new Map());

  const sendWsEvent = useCallback((
    eventType: string,
    payload: Record<string, unknown>,
    options: WsSendOptions = {}
  ) => {
    return realtimeClientRef.current?.sendEvent(eventType, payload, options) ?? null;
  }, [realtimeClientRef]);

  const sendWsEventAwaitAck = useCallback((
    eventType: string,
    payload: Record<string, unknown>,
    options: WsSendOptions = {}
  ) => {
    const requestId = sendWsEvent(eventType, payload, {
      trackAck: true,
      maxRetries: 1,
      ...options
    });

    if (!requestId) {
      return Promise.reject(new Error("ws_not_connected"));
    }

    return new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        pendingWsRequestResolversRef.current.delete(requestId);
        // Prevent late reconnect resend after local ack timeout fallback path.
        realtimeClientRef.current?.clearPendingRequest(requestId);
        reject(new Error(`${eventType}:ack_timeout`));
      }, 10000);

      pendingWsRequestResolversRef.current.set(requestId, {
        resolve: () => {
          window.clearTimeout(timeoutId);
          resolve();
        },
        reject: (error) => {
          window.clearTimeout(timeoutId);
          reject(error);
        },
        timeoutId
      });
    });
  }, [sendWsEvent]);

  const handleWsAck = useCallback(({ requestId }: { requestId: string }) => {
    const pending = pendingWsRequestResolversRef.current.get(requestId);
    if (!pending) {
      return;
    }

    pendingWsRequestResolversRef.current.delete(requestId);
    pending.resolve();
  }, []);

  const handleWsNack = useCallback((payload: {
    requestId: string;
    eventType: string;
    code: string;
    message: string;
  }) => {
    const pending = pendingWsRequestResolversRef.current.get(payload.requestId);
    if (!pending) {
      return;
    }

    pendingWsRequestResolversRef.current.delete(payload.requestId);
    pending.reject(new Error(`${payload.eventType}:${payload.code}:${payload.message}`));
  }, []);

  useEffect(() => () => {
    pendingWsRequestResolversRef.current.forEach((pending) => {
      window.clearTimeout(pending.timeoutId);
      pending.reject(new Error("ws_disposed"));
    });
    pendingWsRequestResolversRef.current.clear();
  }, []);

  return {
    sendWsEvent,
    sendWsEventAwaitAck,
    handleWsAck,
    handleWsNack
  };
}
