import { useAdminUsersSync } from "./useAdminUsersSync";
import { useAppMediaDeviceRuntime } from "./useAppMediaDeviceRuntime";
import { useAppPopupOutsideClose } from "./useAppPopupOutsideClose";
import { useTelemetryRefresh } from "./useTelemetryRefresh";
import { useRealtimeConnectionReset } from "../../realtime/useRealtimeConnectionReset";
import { useRealtimeSoundEffects } from "../../realtime/useRealtimeSoundEffects";
import { useVoiceUiLifecycleEffects } from "../../voice/useVoiceUiLifecycleEffects";

type UseAppWorkspaceSupportRuntimeInput = {
  adminUsersSync: Parameters<typeof useAdminUsersSync>[0];
  telemetryRefresh: Parameters<typeof useTelemetryRefresh>[0];
  realtimeConnectionReset: Parameters<typeof useRealtimeConnectionReset>[0];
  realtimeSoundEffects: Parameters<typeof useRealtimeSoundEffects>[0];
  voiceUiLifecycle: Parameters<typeof useVoiceUiLifecycleEffects>[0];
  mediaDeviceRuntime: Parameters<typeof useAppMediaDeviceRuntime>[0];
  popupOutsideClose: Parameters<typeof useAppPopupOutsideClose>[0];
};

export function useAppWorkspaceSupportRuntime({
  adminUsersSync,
  telemetryRefresh,
  realtimeConnectionReset,
  realtimeSoundEffects,
  voiceUiLifecycle,
  mediaDeviceRuntime,
  popupOutsideClose
}: UseAppWorkspaceSupportRuntimeInput) {
  useAdminUsersSync(adminUsersSync);
  useTelemetryRefresh(telemetryRefresh);
  useRealtimeConnectionReset(realtimeConnectionReset);
  useRealtimeSoundEffects(realtimeSoundEffects);
  useVoiceUiLifecycleEffects(voiceUiLifecycle);

  const { refreshDevices, requestMediaAccess, requestVideoAccess } = useAppMediaDeviceRuntime(mediaDeviceRuntime);
  useAppPopupOutsideClose(popupOutsideClose);

  return {
    refreshDevices,
    requestMediaAccess,
    requestVideoAccess
  };
}
