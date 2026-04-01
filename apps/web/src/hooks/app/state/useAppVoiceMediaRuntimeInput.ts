import { useAppVoiceMediaRuntime } from "./useAppVoiceMediaRuntime";

type AppVoiceMediaRuntimeInput = Parameters<typeof useAppVoiceMediaRuntime>[0];

export function useAppVoiceMediaRuntimeInput(params: Record<string, unknown>): AppVoiceMediaRuntimeInput {
  const p = params as any;
  const roomsPresenceDetailsBySlug = p.roomsPresenceDetailsBySlug || {};
  const roomMediaTopologyBySlug = p.roomMediaTopologyBySlug || {};
  const screenShareOwnerByRoomSlug = p.screenShareOwnerByRoomSlug || {};

  return {
    voiceParticipants: {
      roomsPresenceDetailsBySlug,
      roomSlug: p.roomSlug,
      currentUserId: p.currentUserId,
      memberPreferencesByUserId: p.memberPreferencesByUserId
    },
    roomSnapshot: {
      rooms: p.rooms,
      roomsTree: p.roomsTree,
      roomSlug: p.roomSlug,
      roomMediaTopologyBySlug,
      serverAudioQuality: p.serverAudioQuality
    },
    rnnoiseRuntime: {
      selectedInputProfile: p.selectedInputProfile,
      setSelectedInputProfile: p.setSelectedInputProfile,
      setRnnoiseRuntimeStatus: p.setRnnoiseRuntimeStatus,
      pushToast: p.pushToast,
      t: p.t
    },
    livekitRuntime: {
      t: p.t,
      token: p.serviceToken,
      localUserId: p.currentUserId,
      roomSlug: p.roomSlug,
      videoStreamingEnabled: p.cameraEnabled,
      videoResolution: p.serverVideoResolution,
      videoFps: p.serverVideoFps,
      screenShareResolution: p.serverScreenShareResolution,
      selectedInputId: p.selectedInputId,
      selectedInputProfile: p.selectedInputProfile,
      rnnoiseSuppressionLevel: p.rnnoiseSuppressionLevel,
      preRnnEchoCancellationEnabled: p.preRnnEchoCancellationEnabled,
      preRnnAutoGainControlEnabled: p.preRnnAutoGainControlEnabled,
      selectedOutputId: p.selectedOutputId,
      selectedVideoInputId: p.selectedVideoInputId,
      micVolume: p.micVolume,
      micMuted: p.micMuted,
      audioMuted: p.audioMuted,
      outputVolume: p.outputVolume,
      pushToast: p.pushToast,
      pushCallLog: p.pushCallLog,
      setCallStatus: p.setCallStatus,
      setLastCallPeer: p.setLastCallPeer
    },
    serverVideoWindowBounds: {
      minWidth: p.serverVideoWindowMinWidth,
      maxWidth: p.serverVideoWindowMaxWidth,
      setMinWidth: p.setServerVideoWindowMinWidth,
      setMaxWidth: p.setServerVideoWindowMaxWidth
    },
    voiceRoomLifecycle: {
      roomSlug: p.roomSlug,
      setCameraEnabled: p.setCameraEnabled,
      setVideoWindowsVisible: p.setVideoWindowsVisible,
      setVoiceCameraEnabledByUserIdInCurrentRoom: p.setVoiceCameraEnabledByUserIdInCurrentRoom,
      setVoiceInitialMicStateByUserIdInCurrentRoom: p.setVoiceInitialMicStateByUserIdInCurrentRoom,
      setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom: p.setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom
    },
    persistedClientSettings: {
      selectedInputProfile: p.selectedInputProfile,
      rnnoiseSuppressionLevel: p.rnnoiseSuppressionLevel,
      preRnnEchoCancellationEnabled: p.preRnnEchoCancellationEnabled,
      preRnnAutoGainControlEnabled: p.preRnnAutoGainControlEnabled,
      selfMonitorEnabled: p.selfMonitorEnabled,
      micMuted: p.micMuted,
      audioMuted: p.audioMuted,
      cameraEnabled: p.cameraEnabled,
      serverVideoEffectType: p.serverVideoEffectType,
      serverVideoResolution: p.serverVideoResolution,
      serverVideoFps: p.serverVideoFps,
      serverScreenShareResolution: p.serverScreenShareResolution,
      serverVideoPixelFxStrength: p.serverVideoPixelFxStrength,
      serverVideoPixelFxPixelSize: p.serverVideoPixelFxPixelSize,
      serverVideoPixelFxGridThickness: p.serverVideoPixelFxGridThickness,
      serverVideoAsciiCellSize: p.serverVideoAsciiCellSize,
      serverVideoAsciiContrast: p.serverVideoAsciiContrast,
      serverVideoAsciiColor: p.serverVideoAsciiColor,
      serverVideoWindowMinWidth: p.serverVideoWindowMinWidth,
      serverVideoWindowMaxWidth: p.serverVideoWindowMaxWidth
    },
    voiceSignaling: {
      roomSlug: p.roomSlug,
      micMuted: p.micMuted,
      micTestLevel: p.micTestLevel,
      audioMuted: p.audioMuted,
      canManageAudioQuality: p.canManageAudioQuality,
      serverVideoEffectType: p.serverVideoEffectType,
      serverVideoResolution: p.serverVideoResolution,
      serverVideoFps: p.serverVideoFps,
      serverScreenShareResolution: p.serverScreenShareResolution,
      serverVideoPixelFxStrength: p.serverVideoPixelFxStrength,
      serverVideoPixelFxPixelSize: p.serverVideoPixelFxPixelSize,
      serverVideoPixelFxGridThickness: p.serverVideoPixelFxGridThickness,
      serverVideoAsciiCellSize: p.serverVideoAsciiCellSize,
      serverVideoAsciiContrast: p.serverVideoAsciiContrast,
      serverVideoAsciiColor: p.serverVideoAsciiColor,
      serverVideoWindowMinWidth: p.serverVideoWindowMinWidth,
      serverVideoWindowMaxWidth: p.serverVideoWindowMaxWidth,
      sendWsEvent: p.sendWsEvent
    },
    serverVideoPreview: {
      appMenuOpen: p.appMenuOpen,
      serverMenuTab: p.serverMenuTab,
      canManageAudioQuality: p.canManageAudioQuality,
      selectedVideoInputId: p.selectedVideoInputId,
      serverVideoResolution: p.serverVideoResolution,
      serverVideoFps: p.serverVideoFps,
      serverVideoEffectType: p.serverVideoEffectType,
      serverVideoPixelFxStrength: p.serverVideoPixelFxStrength,
      serverVideoPixelFxPixelSize: p.serverVideoPixelFxPixelSize,
      serverVideoPixelFxGridThickness: p.serverVideoPixelFxGridThickness,
      serverVideoAsciiCellSize: p.serverVideoAsciiCellSize,
      serverVideoAsciiContrast: p.serverVideoAsciiContrast,
      serverVideoAsciiColor: p.serverVideoAsciiColor
    },
    voiceRoomStateMaps: {
      userId: p.currentUserId,
      micMuted: p.micMuted,
      micTestLevel: p.micTestLevel,
      audioMuted: p.audioMuted,
      callStatus: p.callStatus,
      initialMicStateByUserIdInCurrentRoom: p.voiceInitialMicStateByUserIdInCurrentRoom,
      initialAudioOutputMutedByUserIdInCurrentRoom: p.voiceInitialAudioOutputMutedByUserIdInCurrentRoom
    },
    screenShare: {
      hasSessionToken: p.hasServiceToken,
      userId: p.currentUserId,
      userName: p.currentUserName,
      t: p.t,
      pushToast: p.pushToast,
      screenShareOwnerByRoomSlug,
      setScreenShareOwnerByRoomSlug: p.setScreenShareOwnerByRoomSlug,
      sendWsEventAwaitAck: p.sendWsEventAwaitAck
    },
    voiceMediaUiMaps: {
      currentUserId: p.currentUserId,
      cameraEnabled: p.cameraEnabled
    }
  };
}
