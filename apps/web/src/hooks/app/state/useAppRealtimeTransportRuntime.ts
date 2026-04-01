import { useChatTypingController } from "../../realtime/useChatTypingController";
import { useWsEventAcks } from "../../realtime/useWsEventAcks";

type WsAcksInput = Parameters<typeof useWsEventAcks>[0];
type ChatTypingInput = Omit<Parameters<typeof useChatTypingController>[0], "sendWsEvent">;

type UseAppRealtimeTransportRuntimeInput = {
  wsAcks: WsAcksInput;
  chatTyping: ChatTypingInput;
};

export function useAppRealtimeTransportRuntime({
  wsAcks,
  chatTyping
}: UseAppRealtimeTransportRuntimeInput) {
  const ws = useWsEventAcks(wsAcks);
  const typing = useChatTypingController({
    ...chatTyping,
    sendWsEvent: ws.sendWsEvent
  });

  return {
    ...ws,
    ...typing
  };
}
