import { useMediaDevicePreferences } from "../../media/useMediaDevicePreferences";
import { useMicrophoneLevelMeter } from "../../media/useMicrophoneLevelMeter";
import { useMicrophoneSelfMonitor } from "../../media/useMicrophoneSelfMonitor";

type UseMediaDevicePreferencesInput = Parameters<typeof useMediaDevicePreferences>[0];
type UseMicrophoneSelfMonitorInput = Parameters<typeof useMicrophoneSelfMonitor>[0];

type UseAppMediaDeviceRuntimeInput = UseMediaDevicePreferencesInput & {
  hasUser: boolean;
  roomVoiceConnected: boolean;
  voiceSettingsOpen: boolean;
  voiceSettingsPanel: string | null;
  userSettingsOpen: boolean;
  userSettingsTab: string;
  pushToast: (message: string) => void;
  setMicTestLevel: (value: number) => void;
  selfMonitorEnabled: boolean;
  selectedInputProfile: UseMicrophoneSelfMonitorInput["selectedInputProfile"];
  rnnoiseSuppressionLevel: UseMicrophoneSelfMonitorInput["rnnoiseSuppressionLevel"];
};

export function useAppMediaDeviceRuntime({
  hasUser,
  roomVoiceConnected,
  voiceSettingsOpen,
  voiceSettingsPanel,
  userSettingsOpen,
  userSettingsTab,
  pushToast,
  setMicTestLevel,
  selfMonitorEnabled,
  selectedInputProfile,
  rnnoiseSuppressionLevel,
  selectedInputId,
  micVolume,
  t,
  ...mediaDevicePreferencesInput
}: UseAppMediaDeviceRuntimeInput) {
  const { refreshDevices, requestMediaAccess, requestVideoAccess } = useMediaDevicePreferences({
    ...mediaDevicePreferencesInput,
    t,
    selectedInputId,
    micVolume
  });

  const shouldRunMicrophoneMeter = hasUser
    && (
      roomVoiceConnected
      || voiceSettingsOpen
      || voiceSettingsPanel === "input_device"
      || (userSettingsOpen && userSettingsTab === "sound")
    );

  useMicrophoneLevelMeter({
    running: shouldRunMicrophoneMeter,
    selectedInputId,
    t,
    pushToast,
    setLevel: setMicTestLevel
  });

  useMicrophoneSelfMonitor({
    enabled: selfMonitorEnabled,
    selectedInputId,
    selectedInputProfile,
    rnnoiseSuppressionLevel,
    micVolume,
    t,
    pushToast
  });

  return {
    refreshDevices,
    requestMediaAccess,
    requestVideoAccess
  };
}