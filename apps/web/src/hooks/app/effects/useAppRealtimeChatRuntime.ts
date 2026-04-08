import { useRealtimeChatLifecycle } from "../../realtime/useRealtimeChatLifecycle";
import { useRealtimeChatLifecycleProps } from "../state/useRealtimeChatLifecycleProps";
import { useRealtimeLifecycleCallbacks } from "../../realtime/useRealtimeLifecycleCallbacks";

type LifecycleCallbacksInput = Parameters<typeof useRealtimeLifecycleCallbacks>[0];
type RealtimeChatLifecyclePropsInput = Parameters<typeof useRealtimeChatLifecycleProps>[0];

type UseAppRealtimeChatRuntimeInput = {
  lifecycleCallbacks: LifecycleCallbacksInput;
  realtimeChatLifecycleProps: Omit<
    RealtimeChatLifecyclePropsInput,
    "handleSessionMoved" | "handleChatCleared" | "handleChatTyping" |
    "handleChatMessagePinned" | "handleChatMessageUnpinned" | "handleChatMessageReactionChanged" | "handleChatMessageReceived" | "handleChatTopicRead" |
    "handleChatTopicCreated" | "handleChatTopicUpdated" | "handleChatTopicArchived" | "handleChatTopicUnarchived" | "handleChatTopicDeleted" | "handleNotificationSettingsUpdated"
  >;
};

export function useAppRealtimeChatRuntime({
  lifecycleCallbacks,
  realtimeChatLifecycleProps
}: UseAppRealtimeChatRuntimeInput) {
  const {
    handleSessionMoved,
    handleChatCleared,
    handleChatTyping,
    handleChatMessagePinned,
    handleChatMessageUnpinned,
    handleChatMessageReactionChanged,
    handleChatMessageReceived,
    handleChatTopicRead,
    handleChatTopicCreated,
    handleChatTopicUpdated,
    handleChatTopicArchived,
    handleChatTopicUnarchived,
    handleChatTopicDeleted,
    handleNotificationSettingsUpdated
  } = useRealtimeLifecycleCallbacks(lifecycleCallbacks);

  const chatLifecycleProps = useRealtimeChatLifecycleProps({
    ...realtimeChatLifecycleProps,
    handleSessionMoved,
    handleChatCleared,
    handleChatTyping,
    handleChatMessagePinned,
    handleChatMessageUnpinned,
    handleChatMessageReactionChanged,
    handleChatMessageReceived,
    handleChatTopicRead,
    handleChatTopicCreated,
    handleChatTopicUpdated,
    handleChatTopicArchived,
    handleChatTopicUnarchived,
    handleChatTopicDeleted,
    handleNotificationSettingsUpdated
  });

  return useRealtimeChatLifecycle(chatLifecycleProps);
}