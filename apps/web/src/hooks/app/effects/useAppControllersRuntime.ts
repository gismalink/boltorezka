import { useRealtimeIncomingCallState } from "../../realtime/useRealtimeIncomingCallState";
import { useAppControllers } from "../state/useAppControllers";
import { useAppRealtimeChatRuntime } from "./useAppRealtimeChatRuntime";
import { useSessionStateLifecycle } from "./useSessionStateLifecycle";

type ControllersInput = Parameters<typeof useAppControllers>[0];
type IncomingCallStateInput = Parameters<typeof useRealtimeIncomingCallState>[0];
type SessionStateLifecycleInput = Omit<Parameters<typeof useSessionStateLifecycle>[0], "roomAdminController">;
type RealtimeChatRuntimeInput = {
  lifecycleCallbacks: Parameters<typeof useAppRealtimeChatRuntime>[0]["lifecycleCallbacks"];
  realtimeChatLifecycleProps: Omit<
    Parameters<typeof useAppRealtimeChatRuntime>[0]["realtimeChatLifecycleProps"],
    "chatController" | "handleIncomingMicState" | "handleIncomingVideoState" | "handleIncomingInitialCallState" | "handleAudioQualityUpdated"
  >;
};

type UseAppControllersRuntimeInput = {
  controllers: ControllersInput;
  incomingCallState: IncomingCallStateInput;
  sessionStateLifecycle: SessionStateLifecycleInput;
  realtimeChatRuntime: RealtimeChatRuntimeInput;
};

export function useAppControllersRuntime({
  controllers,
  incomingCallState,
  sessionStateLifecycle,
  realtimeChatRuntime
}: UseAppControllersRuntimeInput) {
  const controllersRuntime = useAppControllers(controllers);

  const incomingCallRuntime = useRealtimeIncomingCallState(incomingCallState);

  useSessionStateLifecycle({
    ...sessionStateLifecycle,
    roomAdminController: controllersRuntime.roomAdminController
  });

  const realtimeRuntime = useAppRealtimeChatRuntime({
    lifecycleCallbacks: realtimeChatRuntime.lifecycleCallbacks,
    realtimeChatLifecycleProps: {
      ...realtimeChatRuntime.realtimeChatLifecycleProps,
      chatController: controllersRuntime.chatController,
      handleIncomingMicState: incomingCallRuntime.handleIncomingMicState,
      handleIncomingVideoState: incomingCallRuntime.handleIncomingVideoState,
      handleIncomingInitialCallState: incomingCallRuntime.handleIncomingInitialCallState,
      handleAudioQualityUpdated: incomingCallRuntime.handleAudioQualityUpdated
    }
  });

  return {
    ...controllersRuntime,
    ...incomingCallRuntime,
    ...realtimeRuntime
  };
}
