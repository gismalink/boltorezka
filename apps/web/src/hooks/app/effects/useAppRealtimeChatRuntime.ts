import { useRealtimeChatLifecycle } from "../../realtime/useRealtimeChatLifecycle";
import { useRealtimeChatLifecycleProps } from "../state/useRealtimeChatLifecycleProps";
import { useRealtimeLifecycleCallbacks } from "../../realtime/useRealtimeLifecycleCallbacks";

type LifecycleCallbacksInput = Parameters<typeof useRealtimeLifecycleCallbacks>[0];
type RealtimeChatLifecyclePropsInput = Parameters<typeof useRealtimeChatLifecycleProps>[0];

type UseAppRealtimeChatRuntimeInput = {
  lifecycleCallbacks: LifecycleCallbacksInput;
  realtimeChatLifecycleProps: Omit<
    RealtimeChatLifecyclePropsInput,
    "handleSessionMoved" | "handleChatCleared" | "handleChatTyping"
  >;
};

export function useAppRealtimeChatRuntime({
  lifecycleCallbacks,
  realtimeChatLifecycleProps
}: UseAppRealtimeChatRuntimeInput) {
  const {
    handleSessionMoved,
    handleChatCleared,
    handleChatTyping
  } = useRealtimeLifecycleCallbacks(lifecycleCallbacks);

  const chatLifecycleProps = useRealtimeChatLifecycleProps({
    ...realtimeChatLifecycleProps,
    handleSessionMoved,
    handleChatCleared,
    handleChatTyping
  });

  return useRealtimeChatLifecycle(chatLifecycleProps);
}