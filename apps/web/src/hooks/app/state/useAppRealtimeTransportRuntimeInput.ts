import { useAppRealtimeTransportRuntime } from "./useAppRealtimeTransportRuntime";

type AppRealtimeTransportRuntimeInput = Parameters<typeof useAppRealtimeTransportRuntime>[0];

export function useAppRealtimeTransportRuntimeInput(params: Record<string, unknown>): AppRealtimeTransportRuntimeInput {
  const p = params as any;

  return {
    wsAcks: {
      realtimeClientRef: p.realtimeClientRef
    },
    chatTyping: {
      chatRoomSlug: p.chatRoomSlug,
      userId: p.user?.id,
      setChatText: p.setChatText,
      typingTtlMs: p.typingTtlMs,
      typingPingIntervalMs: p.typingPingIntervalMs
    }
  };
}
