import type { Dispatch, SetStateAction } from "react";
import type { InputProfile } from "../../../components";
import type { RnnoiseSuppressionLevel } from "../../rtc/rnnoiseAudioProcessor";
import { useDeviceOptionLabels } from "../../media/useDeviceOptionLabels";
import { useNoiseSuppressionUi } from "../../media/useNoiseSuppressionUi";
import { useWorkspaceVoiceControlActions } from "../../voice/useWorkspaceVoiceControlActions";
import { useWorkspaceUserDockProps, type UseWorkspaceUserDockPropsInput } from "./useWorkspaceUserDockProps";

type UseWorkspaceUserDockControllerArgs = Omit<
  UseWorkspaceUserDockPropsInput,
  | "inputOptions"
  | "outputOptions"
  | "videoInputOptions"
  | "currentInputLabel"
  | "inputProfileLabel"
  | "noiseSuppressionEnabled"
  | "handleToggleMic"
  | "handleToggleAudio"
  | "handleToggleCamera"
  | "handleToggleScreenShareClick"
  | "handleToggleNoiseSuppression"
  | "handleToggleVoiceSettings"
  | "handleToggleAudioOutput"
  | "setAudioOutputMenuOpen"
  | "setVoiceSettingsOpen"
  | "setVoiceSettingsPanel"
> & {
  inputDevices: Array<{ id: string; label: string }>;
  outputDevices: Array<{ id: string; label: string }>;
  videoInputDevices: Array<{ id: string; label: string }>;
  allowVideoStreaming: boolean;
  handleToggleScreenShare: () => Promise<void>;
  setMicMuted: Dispatch<SetStateAction<boolean>>;
  setAudioMuted: Dispatch<SetStateAction<boolean>>;
  setCameraEnabled: Dispatch<SetStateAction<boolean>>;
  setAudioOutputMenuOpen: Dispatch<SetStateAction<boolean>>;
  setVoiceSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setVoiceSettingsPanel: Dispatch<SetStateAction<UseWorkspaceUserDockPropsInput["voiceSettingsPanel"]>>;
  setSelectedInputProfile: Dispatch<SetStateAction<InputProfile>>;
  setRnnoiseRuntimeStatus: Dispatch<SetStateAction<"inactive" | "active" | "unavailable" | "error">>;
  setRnnoiseSuppressionLevel: (value: RnnoiseSuppressionLevel) => void;
};

export function useWorkspaceUserDockController({
  t,
  user,
  currentRoomSupportsRtc,
  currentRoomSupportsVideo,
  currentRoomTitle,
  callStatus,
  localVoiceMediaStatusSummary,
  lastCallPeer,
  roomVoiceConnected,
  remoteAudioAutoplayBlocked,
  screenShareActive,
  screenShareOwnedByCurrentUser,
  canStartScreenShare,
  rnnoiseSuppressionLevel,
  rnnoiseRuntimeStatus,
  preRnnEchoCancellationEnabled,
  preRnnAutoGainControlEnabled,
  cameraEnabled,
  micMuted,
  audioMuted,
  audioOutputMenuOpen,
  voiceSettingsOpen,
  userSettingsOpen,
  userSettingsTab,
  voiceSettingsPanel,
  profileNameDraft,
  profileSaving,
  profileStatusText,
  serverAgeLoading,
  serverAgeConfirmedAt,
  serverAgeConfirming,
  lang,
  selectedUiTheme,
  selectedInputId,
  selectedOutputId,
  selectedVideoInputId,
  selectedInputProfile,
  micVolume,
  outputVolume,
  serverSoundsMasterVolume,
  serverSoundsEnabled,
  micTestLevel,
  mediaDevicesState,
  mediaDevicesHint,
  audioOutputAnchorRef,
  voiceSettingsAnchorRef,
  userSettingsRef,
  setPreRnnEchoCancellationEnabled,
  setPreRnnAutoGainControlEnabled,
  selfMonitorEnabled,
  setSelfMonitorEnabled,
  requestVideoAccess,
  openUserSettings,
  setVoiceSettingsOpen,
  setAudioOutputMenuOpen,
  setVoiceSettingsPanel,
  setUserSettingsOpen,
  setUserSettingsTab,
  setProfileNameDraft,
  setLang,
  setSelectedUiTheme,
  saveMyProfile,
  confirmServerAge,
  setSelectedInputId,
  setSelectedOutputId,
  setSelectedVideoInputId,
  setSelectedInputProfile,
  refreshDevices,
  requestMediaAccess,
  setMicVolume,
  setOutputVolume,
  setServerSoundsMasterVolume,
  setServerSoundEnabled,
  playServerSound,
  leaveRoom,
  isMobileViewport,
  inputDevices,
  outputDevices,
  videoInputDevices,
  allowVideoStreaming,
  handleToggleScreenShare,
  setMicMuted,
  setAudioMuted,
  setCameraEnabled,
  setRnnoiseRuntimeStatus,
  setRnnoiseSuppressionLevel
}: UseWorkspaceUserDockControllerArgs) {
  const {
    inputOptions,
    outputOptions,
    videoInputOptions,
    currentInputLabel,
    inputProfileLabel,
    noiseSuppressionEnabled
  } = useDeviceOptionLabels({
    inputDevices,
    outputDevices,
    videoInputDevices,
    selectedInputId,
    selectedInputProfile,
    t
  });

  const { handleToggleNoiseSuppression } = useNoiseSuppressionUi({
    selectedInputProfile,
    setSelectedInputProfile,
    setRnnoiseRuntimeStatus
  });

  const {
    handleToggleMic,
    handleToggleAudio,
    handleToggleCamera,
    handleToggleScreenShareClick,
    handleToggleVoiceSettings,
    handleToggleAudioOutput
  } = useWorkspaceVoiceControlActions({
    allowVideoStreaming,
    cameraEnabled,
    requestVideoAccess,
    handleToggleScreenShare,
    setMicMuted,
    setAudioMuted,
    setCameraEnabled,
    setAudioOutputMenuOpen,
    setVoiceSettingsOpen,
    setVoiceSettingsPanel
  });

  return useWorkspaceUserDockProps({
    t,
    user,
    currentRoomSupportsRtc,
    currentRoomSupportsVideo,
    currentRoomTitle,
    callStatus,
    localVoiceMediaStatusSummary,
    lastCallPeer,
    roomVoiceConnected,
    remoteAudioAutoplayBlocked,
    screenShareActive,
    screenShareOwnedByCurrentUser,
    canStartScreenShare,
    noiseSuppressionEnabled,
    rnnoiseSuppressionLevel,
    rnnoiseRuntimeStatus,
    preRnnEchoCancellationEnabled,
    preRnnAutoGainControlEnabled,
    cameraEnabled,
    micMuted,
    audioMuted,
    audioOutputMenuOpen,
    voiceSettingsOpen,
    userSettingsOpen,
    userSettingsTab,
    voiceSettingsPanel,
    profileNameDraft,
    profileSaving,
    profileStatusText,
    serverAgeLoading,
    serverAgeConfirmedAt,
    serverAgeConfirming,
    lang,
    selectedUiTheme,
    inputOptions,
    outputOptions,
    videoInputOptions,
    selectedInputId,
    selectedOutputId,
    selectedVideoInputId,
    selectedInputProfile,
    inputProfileLabel,
    currentInputLabel,
    micVolume,
    outputVolume,
    serverSoundsMasterVolume,
    serverSoundsEnabled,
    micTestLevel,
    mediaDevicesState,
    mediaDevicesHint,
    audioOutputAnchorRef,
    voiceSettingsAnchorRef,
    userSettingsRef,
    handleToggleMic,
    handleToggleAudio,
    handleToggleCamera,
    handleToggleScreenShareClick,
    handleToggleNoiseSuppression,
    setRnnoiseSuppressionLevel,
    setPreRnnEchoCancellationEnabled,
    setPreRnnAutoGainControlEnabled,
    selfMonitorEnabled,
    setSelfMonitorEnabled,
    requestVideoAccess,
    handleToggleVoiceSettings,
    handleToggleAudioOutput,
    openUserSettings,
    setVoiceSettingsOpen,
    setAudioOutputMenuOpen,
    setVoiceSettingsPanel,
    setUserSettingsOpen,
    setUserSettingsTab,
    setProfileNameDraft,
    setLang,
    setSelectedUiTheme,
    saveMyProfile,
    confirmServerAge,
    setSelectedInputId,
    setSelectedOutputId,
    setSelectedVideoInputId,
    setSelectedInputProfile,
    refreshDevices,
    requestMediaAccess,
    setMicVolume,
    setOutputVolume,
    setServerSoundsMasterVolume,
    setServerSoundEnabled,
    playServerSound,
    leaveRoom,
    isMobileViewport
  });
}
