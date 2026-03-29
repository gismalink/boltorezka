import { useMemo } from "react";
import { LANGUAGE_OPTIONS } from "../../../i18n";
import type { InputProfile, MediaDevicesState, UserDockProps } from "../../../components";
import type { Lang } from "../../../i18n";
import type { UiTheme } from "../../../domain";
import type { VoiceSettingsPanel } from "../../../components";
import type { RnnoiseSuppressionLevel } from "../../rtc/rnnoiseAudioProcessor";

export type UseWorkspaceUserDockPropsInput = {
  t: UserDockProps["t"];
  user: UserDockProps["user"] | null;
  currentRoomSupportsRtc: boolean;
  currentRoomSupportsVideo: boolean;
  currentRoomTitle: string;
  callStatus: UserDockProps["callStatus"];
  localVoiceMediaStatusSummary: UserDockProps["localVoiceMediaStatusSummary"];
  lastCallPeer: string;
  roomVoiceConnected: boolean;
  remoteAudioAutoplayBlocked: boolean;
  screenShareActive: boolean;
  screenShareOwnedByCurrentUser: boolean;
  canStartScreenShare: boolean;
  noiseSuppressionEnabled: boolean;
  rnnoiseSuppressionLevel: RnnoiseSuppressionLevel;
  rnnoiseRuntimeStatus: UserDockProps["rnnoiseRuntimeStatus"];
  preRnnEchoCancellationEnabled: boolean;
  preRnnAutoGainControlEnabled: boolean;
  cameraEnabled: boolean;
  micMuted: boolean;
  audioMuted: boolean;
  audioOutputMenuOpen: boolean;
  voiceSettingsOpen: boolean;
  userSettingsOpen: boolean;
  userSettingsTab: UserDockProps["userSettingsTab"];
  voiceSettingsPanel: VoiceSettingsPanel;
  profileNameDraft: string;
  profileSaving: boolean;
  profileStatusText: string;
  deleteAccountPending: boolean;
  deleteAccountStatusText: string;
  serverAgeLoading: boolean;
  serverAgeConfirmedAt: string | null;
  serverAgeConfirming: boolean;
  lang: Lang;
  selectedUiTheme: UiTheme;
  inputOptions: UserDockProps["inputOptions"];
  outputOptions: UserDockProps["outputOptions"];
  videoInputOptions: UserDockProps["videoInputOptions"];
  selectedInputId: string;
  selectedOutputId: string;
  selectedVideoInputId: string;
  selectedInputProfile: InputProfile;
  inputProfileLabel: string;
  currentInputLabel: string;
  micVolume: number;
  outputVolume: number;
  serverSoundsMasterVolume: number;
  serverSoundsEnabled: UserDockProps["serverSoundsEnabled"];
  micTestLevel: number;
  mediaDevicesState: MediaDevicesState;
  mediaDevicesHint: string;
  audioOutputAnchorRef: UserDockProps["audioOutputAnchorRef"];
  voiceSettingsAnchorRef: UserDockProps["voiceSettingsAnchorRef"];
  userSettingsRef: UserDockProps["userSettingsRef"];
  handleToggleMic: () => void;
  handleToggleAudio: () => void;
  handleToggleCamera: () => void;
  handleToggleScreenShareClick: () => void;
  handleToggleNoiseSuppression: () => void;
  setRnnoiseSuppressionLevel: (value: RnnoiseSuppressionLevel) => void;
  setPreRnnEchoCancellationEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setPreRnnAutoGainControlEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  selfMonitorEnabled: boolean;
  setSelfMonitorEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  requestVideoAccess: () => void;
  handleToggleVoiceSettings: () => void;
  handleToggleAudioOutput: () => void;
  openUserSettings: UserDockProps["onOpenUserSettings"];
  setVoiceSettingsOpen: (value: boolean) => void;
  setAudioOutputMenuOpen: (value: boolean) => void;
  setVoiceSettingsPanel: (panel: VoiceSettingsPanel) => void;
  setUserSettingsOpen: (value: boolean) => void;
  setUserSettingsTab: (value: UserDockProps["userSettingsTab"]) => void;
  setProfileNameDraft: (value: string) => void;
  setLang: (value: Lang) => void;
  setSelectedUiTheme: (value: UiTheme) => void;
  saveMyProfile: UserDockProps["onSaveProfile"];
  deleteAccount: UserDockProps["onDeleteAccount"];
  confirmServerAge: UserDockProps["onConfirmServerAge"];
  setSelectedInputId: (value: string) => void;
  setSelectedOutputId: (value: string) => void;
  setSelectedVideoInputId: (value: string) => void;
  setSelectedInputProfile: (value: InputProfile) => void;
  refreshDevices: (force: boolean) => void;
  requestMediaAccess: () => void;
  setMicVolume: (value: number) => void;
  setOutputVolume: (value: number) => void;
  setServerSoundsMasterVolume: (value: number) => void;
  setServerSoundEnabled: UserDockProps["onSetServerSoundEnabled"];
  playServerSound: UserDockProps["onPreviewServerSound"];
  leaveRoom: () => void;
  isMobileViewport: boolean;
};

export function useWorkspaceUserDockProps({
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
  deleteAccountPending,
  deleteAccountStatusText,
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
  deleteAccount,
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
}: UseWorkspaceUserDockPropsInput): UserDockProps | null {
  return useMemo(() => {
    if (!user) {
      return null;
    }

    return {
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
      profileUsername: String(user.username || user.email.split("@")[0] || ""),
      profileNameDraft,
      profileEmail: user.email,
      profileSaving,
      profileStatusText,
      deleteAccountPending,
      deleteAccountStatusText,
      serverAgeLoading,
      serverAgeConfirmedAt,
      serverAgeConfirming,
      selectedLang: lang,
      selectedUiTheme,
      languageOptions: LANGUAGE_OPTIONS,
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
      onToggleMic: handleToggleMic,
      onToggleAudio: handleToggleAudio,
      onToggleCamera: handleToggleCamera,
      onToggleScreenShare: handleToggleScreenShareClick,
      onToggleNoiseSuppression: handleToggleNoiseSuppression,
      onSetRnnoiseSuppressionLevel: setRnnoiseSuppressionLevel,
      onTogglePreRnnEchoCancellation: () => setPreRnnEchoCancellationEnabled((value) => !value),
      onTogglePreRnnAutoGainControl: () => setPreRnnAutoGainControlEnabled((value) => !value),
      selfMonitorEnabled,
      onToggleSelfMonitor: () => setSelfMonitorEnabled((value) => !value),
      onRequestVideoAccess: requestVideoAccess,
      onToggleVoiceSettings: handleToggleVoiceSettings,
      onToggleAudioOutput: handleToggleAudioOutput,
      onOpenUserSettings: openUserSettings,
      onSetVoiceSettingsOpen: setVoiceSettingsOpen,
      onSetAudioOutputMenuOpen: setAudioOutputMenuOpen,
      onSetVoiceSettingsPanel: setVoiceSettingsPanel,
      onSetUserSettingsOpen: setUserSettingsOpen,
      onSetUserSettingsTab: setUserSettingsTab,
      onSetProfileNameDraft: setProfileNameDraft,
      onSetSelectedLang: setLang,
      onSetSelectedUiTheme: setSelectedUiTheme,
      onSaveProfile: saveMyProfile,
      onDeleteAccount: deleteAccount,
      onConfirmServerAge: confirmServerAge,
      onSetSelectedInputId: setSelectedInputId,
      onSetSelectedOutputId: setSelectedOutputId,
      onSetSelectedVideoInputId: setSelectedVideoInputId,
      onSetSelectedInputProfile: setSelectedInputProfile,
      onRefreshDevices: () => refreshDevices(true),
      onRequestMediaAccess: requestMediaAccess,
      onSetMicVolume: setMicVolume,
      onSetOutputVolume: setOutputVolume,
      onSetServerSoundsMasterVolume: setServerSoundsMasterVolume,
      onSetServerSoundEnabled: setServerSoundEnabled,
      onPreviewServerSound: playServerSound,
      onDisconnectCall: leaveRoom,
      isMobileViewport
    };
  }, [
    audioMuted,
    audioOutputAnchorRef,
    audioOutputMenuOpen,
    callStatus,
    cameraEnabled,
    canStartScreenShare,
    currentInputLabel,
    currentRoomSupportsRtc,
    currentRoomSupportsVideo,
    currentRoomTitle,
    handleToggleAudio,
    handleToggleAudioOutput,
    handleToggleCamera,
    handleToggleMic,
    handleToggleNoiseSuppression,
    handleToggleScreenShareClick,
    handleToggleVoiceSettings,
    inputOptions,
    inputProfileLabel,
    isMobileViewport,
    lang,
    lastCallPeer,
    leaveRoom,
    localVoiceMediaStatusSummary,
    mediaDevicesHint,
    mediaDevicesState,
    micMuted,
    micTestLevel,
    micVolume,
    noiseSuppressionEnabled,
    openUserSettings,
    outputOptions,
    outputVolume,
    playServerSound,
    preRnnAutoGainControlEnabled,
    preRnnEchoCancellationEnabled,
    profileNameDraft,
    profileSaving,
    profileStatusText,
    deleteAccountPending,
    deleteAccountStatusText,
    serverAgeLoading,
    serverAgeConfirmedAt,
    serverAgeConfirming,
    refreshDevices,
    remoteAudioAutoplayBlocked,
    requestMediaAccess,
    requestVideoAccess,
    rnnoiseRuntimeStatus,
    rnnoiseSuppressionLevel,
    roomVoiceConnected,
    screenShareActive,
    screenShareOwnedByCurrentUser,
    selectedInputId,
    selectedInputProfile,
    selectedOutputId,
    selectedUiTheme,
    selectedVideoInputId,
    selfMonitorEnabled,
    serverSoundsEnabled,
    serverSoundsMasterVolume,
    setAudioOutputMenuOpen,
    setLang,
    setMicVolume,
    setOutputVolume,
    setPreRnnAutoGainControlEnabled,
    setPreRnnEchoCancellationEnabled,
    setProfileNameDraft,
    setRnnoiseSuppressionLevel,
    setSelectedInputId,
    setSelectedInputProfile,
    setSelectedOutputId,
    setSelectedUiTheme,
    setSelectedVideoInputId,
    setSelfMonitorEnabled,
    setServerSoundEnabled,
    setServerSoundsMasterVolume,
    setUserSettingsOpen,
    setUserSettingsTab,
    setVoiceSettingsOpen,
    setVoiceSettingsPanel,
    t,
    user,
    userSettingsOpen,
    userSettingsRef,
    userSettingsTab,
    videoInputOptions,
    voiceSettingsAnchorRef,
    voiceSettingsOpen,
    voiceSettingsPanel,
    saveMyProfile,
    deleteAccount,
    confirmServerAge
  ]);
}
