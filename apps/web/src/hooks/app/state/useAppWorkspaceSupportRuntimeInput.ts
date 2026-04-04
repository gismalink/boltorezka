import { useAppWorkspaceSupportRuntime } from "../effects/useAppWorkspaceSupportRuntime";

type AppWorkspaceSupportRuntimeInput = Parameters<typeof useAppWorkspaceSupportRuntime>[0];

export function useAppWorkspaceSupportRuntimeInput(params: Record<string, unknown>): AppWorkspaceSupportRuntimeInput {
  const p = params as any;

  return {
    adminUsersSync: {
      token: p.token,
      canManageUsers: p.canManageUsers,
      pushLog: p.pushLog,
      setAdminUsers: p.setAdminUsers
    },
    telemetryRefresh: {
      token: p.token,
      canViewTelemetry: p.canViewTelemetry,
      wsState: p.wsState,
      setTelemetrySummary: p.setTelemetrySummary,
      loadTelemetrySummary: p.loadTelemetrySummary
    },
    realtimeConnectionReset: {
      wsState: p.wsState,
      setRoomsPresenceBySlug: p.setRoomsPresenceBySlug,
      setRoomsPresenceDetailsBySlug: p.setRoomsPresenceDetailsBySlug,
      setRoomMediaTopologyBySlug: p.setRoomMediaTopologyBySlug,
      setScreenShareOwnerByRoomSlug: p.setScreenShareOwnerByRoomSlug,
      setVoiceInitialMicStateByUserIdInCurrentRoom: p.setVoiceInitialMicStateByUserIdInCurrentRoom,
      setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom: p.setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom
    },
    realtimeSoundEffects: {
      wsState: p.wsState,
      roomsPresenceDetailsBySlug: p.roomsPresenceDetailsBySlug,
      screenShareOwnerByRoomSlug: p.screenShareOwnerByRoomSlug,
      roomSlug: p.roomSlug,
      userId: p.user?.id,
      messages: p.messages,
      playServerSound: p.playServerSound
    },
    voiceUiLifecycle: {
      userSettingsOpen: p.userSettingsOpen,
      userSettingsTab: p.userSettingsTab,
      setSelfMonitorEnabled: p.setSelfMonitorEnabled,
      roomSlug: p.roomSlug,
      roomMediaTopologyBySlug: p.roomMediaTopologyBySlug,
      pushCallLog: p.pushCallLog
    },
    mediaDeviceRuntime: {
      t: p.t,
      selectedInputId: p.selectedInputId,
      selectedOutputId: p.selectedOutputId,
      selectedVideoInputId: p.selectedVideoInputId,
      micVolume: p.micVolume,
      outputVolume: p.outputVolume,
      setInputDevices: p.setInputDevices,
      setOutputDevices: p.setOutputDevices,
      setVideoInputDevices: p.setVideoInputDevices,
      setMediaDevicesState: p.setMediaDevicesState,
      setMediaDevicesHint: p.setMediaDevicesHint,
      setSelectedInputId: p.setSelectedInputId,
      setSelectedOutputId: p.setSelectedOutputId,
      setSelectedVideoInputId: p.setSelectedVideoInputId,
      hasUser: p.hasUser,
      roomVoiceConnected: p.roomVoiceConnected,
      voiceSettingsOpen: p.voiceSettingsOpen,
      voiceSettingsPanel: p.voiceSettingsPanel || "",
      userSettingsOpen: p.userSettingsOpen,
      userSettingsTab: p.userSettingsTab,
      pushToast: p.pushToast,
      setMicTestLevel: p.setMicTestLevel,
      selfMonitorEnabled: p.selfMonitorEnabled,
      selectedInputProfile: p.selectedInputProfile,
      rnnoiseSuppressionLevel: p.rnnoiseSuppressionLevel
    },
    popupOutsideClose: {
      profileMenuOpen: p.profileMenuOpen,
      authMenuOpen: p.authMenuOpen,
      categoryPopupOpen: p.categoryPopupOpen,
      channelPopupOpen: p.channelPopupOpen,
      channelSettingsPopupOpenId: p.channelSettingsPopupOpenId,
      categorySettingsPopupOpenId: p.categorySettingsPopupOpenId,
      audioOutputMenuOpen: p.audioOutputMenuOpen,
      voiceSettingsOpen: p.voiceSettingsOpen,
      userSettingsOpen: p.userSettingsOpen,
      setProfileMenuOpen: p.setProfileMenuOpen,
      setAuthMenuOpen: p.setAuthMenuOpen,
      setCategoryPopupOpen: p.setCategoryPopupOpen,
      setChannelPopupOpen: p.setChannelPopupOpen,
      setChannelSettingsPopupOpenId: p.setChannelSettingsPopupOpenId,
      setCategorySettingsPopupOpenId: p.setCategorySettingsPopupOpenId,
      setAudioOutputMenuOpen: p.setAudioOutputMenuOpen,
      setVoiceSettingsOpen: p.setVoiceSettingsOpen,
      setUserSettingsOpen: p.setUserSettingsOpen,
      profileMenuRef: p.profileMenuRef,
      authMenuRef: p.authMenuRef,
      categoryPopupRef: p.categoryPopupRef,
      channelPopupRef: p.channelPopupRef,
      audioOutputAnchorRef: p.audioOutputAnchorRef,
      voiceSettingsAnchorRef: p.voiceSettingsAnchorRef,
      userSettingsRef: p.userSettingsRef
    }
  };
}