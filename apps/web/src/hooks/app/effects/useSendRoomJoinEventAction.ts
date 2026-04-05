import { useCallback } from "react";

type SendWsEventAwaitAck = (
  eventType: string,
  payload: Record<string, unknown>,
  options?: { maxRetries?: number }
) => Promise<unknown>;

type UseSendRoomJoinEventActionArgs = {
  sendWsEventAwaitAck: SendWsEventAwaitAck;
};

export function useSendRoomJoinEventAction({ sendWsEventAwaitAck }: UseSendRoomJoinEventActionArgs) {
  return useCallback((slug: string) => {
    return sendWsEventAwaitAck("room.join", { roomSlug: slug }, { maxRetries: 1 });
  }, [sendWsEventAwaitAck]);
}