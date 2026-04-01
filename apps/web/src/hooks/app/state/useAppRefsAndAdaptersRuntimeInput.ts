import { useAppRefsAndAdaptersRuntime } from "./useAppRefsAndAdaptersRuntime";

type AppRefsAndAdaptersRuntimeInput = Parameters<typeof useAppRefsAndAdaptersRuntime>[0];

export function useAppRefsAndAdaptersRuntimeInput(params: Record<string, unknown>): AppRefsAndAdaptersRuntimeInput {
  const p = params as any;

  return {
    currentServerId: p.currentServerId,
    roomSlug: p.roomSlug,
    chatRoomSlug: p.chatRoomSlug,
    t: p.t,
    chatImagePolicy: p.chatImagePolicy,
    setMessages: p.setMessages
  };
}
