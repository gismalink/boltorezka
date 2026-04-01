import { usePendingAccessAutoRefresh } from "./usePendingAccessAutoRefresh";
import { useAutoRoomVoiceConnection } from "../../voice/useAutoRoomVoiceConnection";
import { useServerMenuAccessGuard } from "../../ui/useServerMenuAccessGuard";
import { useScreenWakeLock } from "../../ui/useScreenWakeLock";

type UseAppWorkspaceLifecycleGuardsRuntimeInput = {
  pendingAccessAutoRefresh: Parameters<typeof usePendingAccessAutoRefresh>[0];
  autoRoomVoiceConnection: Parameters<typeof useAutoRoomVoiceConnection>[0];
  serverMenuAccessGuard: Parameters<typeof useServerMenuAccessGuard>[0];
  screenWakeLockEnabled: boolean;
};

export function useAppWorkspaceLifecycleGuardsRuntime({
  pendingAccessAutoRefresh,
  autoRoomVoiceConnection,
  serverMenuAccessGuard,
  screenWakeLockEnabled
}: UseAppWorkspaceLifecycleGuardsRuntimeInput) {
  usePendingAccessAutoRefresh(pendingAccessAutoRefresh);
  useAutoRoomVoiceConnection(autoRoomVoiceConnection);
  useServerMenuAccessGuard(serverMenuAccessGuard);
  useScreenWakeLock(screenWakeLockEnabled);
}
