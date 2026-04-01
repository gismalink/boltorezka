import { usePersistedClientSettings } from "../effects/usePersistedClientSettings";
import { useCurrentRoomSnapshot } from "./useCurrentRoomSnapshot";
import { useServerVideoWindowBounds } from "./useServerVideoWindowBounds";
import { useServerVideoPreview } from "../media/useServerVideoPreview";
import { useRnnoiseRuntimeHandlers } from "../../media/useRnnoiseRuntimeHandlers";
import { useScreenShareOrchestrator } from "../../realtime/useScreenShareOrchestrator";
import { useLivekitVoiceRuntime } from "../../rtc/useLivekitVoiceRuntime";
import { useRoomMediaCapabilities } from "../../rooms/useRoomMediaCapabilities";
import { useVoiceMediaUiMaps } from "../../voice/useVoiceMediaUiMaps";
import { useVoiceParticipantsDerived } from "../../voice/useVoiceParticipantsDerived";
import { useVoiceRoomLifecycleEffects } from "../../voice/useVoiceRoomLifecycleEffects";
import { useVoiceRoomStateMaps } from "../../voice/useVoiceRoomStateMaps";
import { useVoiceSignalingOrchestrator } from "../../voice/useVoiceSignalingOrchestrator";

type UseAppVoiceMediaRuntimeInput = {
  voiceParticipants: Parameters<typeof useVoiceParticipantsDerived>[0];
  roomSnapshot: Parameters<typeof useCurrentRoomSnapshot>[0] & {
    roomMediaTopologyBySlug: Record<string, "livekit">;
    serverAudioQuality: Parameters<typeof useLivekitVoiceRuntime>[0]["audioQuality"];
  };
  rnnoiseRuntime: Parameters<typeof useRnnoiseRuntimeHandlers>[0];
  livekitRuntime: Omit<
    Parameters<typeof useLivekitVoiceRuntime>[0],
    "allowVideoStreaming" | "audioQuality" | "roomVoiceTargets" | "memberVolumeByUserId" | "onRnnoiseStatusChange" | "onRnnoiseFallback"
  >;
  serverVideoWindowBounds: Parameters<typeof useServerVideoWindowBounds>[0];
  voiceRoomLifecycle: Omit<Parameters<typeof useVoiceRoomLifecycleEffects>[0], "currentRoomSnapshot" | "allowVideoStreaming">;
  persistedClientSettings: Parameters<typeof usePersistedClientSettings>[0];
  voiceSignaling: Omit<
    Parameters<typeof useVoiceSignalingOrchestrator>[0],
    "roomVoiceConnected" | "currentRoomSupportsRtc" | "videoPolicyAudienceKey"
  >;
  serverVideoPreview: Parameters<typeof useServerVideoPreview>[0];
  voiceRoomStateMaps: Omit<
    Parameters<typeof useVoiceRoomStateMaps>[0],
    | "roomVoiceConnected"
    | "roomVoiceTargetsCount"
    | "connectingPeerUserIds"
    | "connectedPeerUserIds"
    | "remoteMutedPeerUserIds"
    | "remoteSpeakingPeerUserIds"
    | "remoteAudioMutedPeerUserIds"
  >;
  screenShare: Omit<
    Parameters<typeof useScreenShareOrchestrator>[0],
    | "roomSlug"
    | "currentRoomKind"
    | "currentRoomSupportsScreenShare"
    | "roomVoiceConnected"
    | "connectRoom"
    | "remoteVideoLabelsByUserId"
    | "localScreenShareStream"
    | "remoteScreenShareStreamsByUserId"
    | "isLocalScreenSharing"
    | "startLocalScreenShare"
    | "stopLocalScreenShare"
  >;
  voiceMediaUiMaps: Omit<
    Parameters<typeof useVoiceMediaUiMaps>[0],
    | "currentRoomVoiceTargets"
    | "remoteSpeakingPeerUserIds"
    | "voiceMicStateByUserIdInCurrentRoom"
    | "remoteVideoStreamsByUserId"
    | "roomVoiceConnected"
    | "allowVideoStreaming"
    | "voiceMediaStatusByPeerUserId"
    | "localVoiceMediaStatusSummary"
  >;
};

export function useAppVoiceMediaRuntime({
  voiceParticipants,
  roomSnapshot,
  rnnoiseRuntime,
  livekitRuntime,
  serverVideoWindowBounds,
  voiceRoomLifecycle,
  persistedClientSettings,
  voiceSignaling,
  serverVideoPreview,
  voiceRoomStateMaps,
  screenShare,
  voiceMediaUiMaps
}: UseAppVoiceMediaRuntimeInput) {
  const {
    currentRoomVoiceTargets,
    memberVolumeByUserId,
    remoteVideoLabelsByUserId,
    videoPolicyAudienceKey
  } = useVoiceParticipantsDerived(voiceParticipants);

  const {
    currentRoom: currentRoomSnapshot,
    currentRoomKind,
    currentRoomAudioQualityOverride
  } = useCurrentRoomSnapshot(roomSnapshot);

  const effectiveAudioQuality = currentRoomAudioQualityOverride ?? roomSnapshot.serverAudioQuality;
  const roomMediaCapabilities = useRoomMediaCapabilities(currentRoomKind);
  const roomTopologyBySlug = roomSnapshot.roomMediaTopologyBySlug || {};
  const currentRoomTopology = roomSnapshot.roomSlug ? roomTopologyBySlug[roomSnapshot.roomSlug] : undefined;
  const topologySupportsRtc = currentRoomTopology === "livekit";
  const currentRoomSupportsRtc = roomMediaCapabilities.supportsVoice || topologySupportsRtc;
  const currentRoomSupportsVideo = roomMediaCapabilities.supportsCamera;
  const allowVideoStreaming = roomMediaCapabilities.supportsCamera || topologySupportsRtc;
  const currentRoomSupportsScreenShare = roomMediaCapabilities.supportsScreenShare || topologySupportsRtc;

  const { handleRnnoiseStatusChange, handleRnnoiseFallback } = useRnnoiseRuntimeHandlers(rnnoiseRuntime);

  const livekitVoiceRuntime = useLivekitVoiceRuntime({
    ...livekitRuntime,
    allowVideoStreaming,
    audioQuality: effectiveAudioQuality,
    roomVoiceTargets: currentRoomVoiceTargets,
    memberVolumeByUserId,
    onRnnoiseStatusChange: handleRnnoiseStatusChange,
    onRnnoiseFallback: handleRnnoiseFallback
  });

  const {
    roomVoiceConnected,
    remoteAudioAutoplayBlocked,
    connectedPeerUserIds,
    connectingPeerUserIds,
    remoteMutedPeerUserIds,
    remoteSpeakingPeerUserIds,
    remoteAudioMutedPeerUserIds,
    voiceMediaStatusByPeerUserId,
    localVoiceMediaStatusSummary,
    localVideoStream,
    remoteVideoStreamsByUserId,
    localScreenShareStream,
    remoteScreenShareStreamsByUserId,
    isLocalScreenSharing,
    startLocalScreenShare,
    stopLocalScreenShare,
    connectRoom,
    disconnectRoom,
    handleIncomingMicState: _handleIncomingRtcMicState,
    handleIncomingVideoState: handleIncomingRtcVideoState,
    handleCallNack
  } = livekitVoiceRuntime;
  void _handleIncomingRtcMicState;

  const {
    normalizedMinWidth: normalizedServerVideoWindowMinWidth,
    normalizedMaxWidth: normalizedServerVideoWindowMaxWidth,
    setBoundedMinWidth: setBoundedServerVideoWindowMinWidth,
    setBoundedMaxWidth: setBoundedServerVideoWindowMaxWidth
  } = useServerVideoWindowBounds(serverVideoWindowBounds);

  useVoiceRoomLifecycleEffects({
    ...voiceRoomLifecycle,
    roomSlug: roomSnapshot.roomSlug,
    currentRoomSnapshot,
    allowVideoStreaming
  });

  usePersistedClientSettings(persistedClientSettings);

  useVoiceSignalingOrchestrator({
    ...voiceSignaling,
    roomVoiceConnected,
    currentRoomSupportsRtc,
    videoPolicyAudienceKey
  });

  const serverVideoPreviewStream = useServerVideoPreview(serverVideoPreview);

  const {
    voiceMicStateByUserIdInCurrentRoom,
    voiceAudioOutputMutedByUserIdInCurrentRoom,
    voiceRtcStateByUserIdInCurrentRoom
  } = useVoiceRoomStateMaps({
    ...voiceRoomStateMaps,
    roomVoiceConnected,
    roomVoiceTargetsCount: currentRoomVoiceTargets.length,
    connectingPeerUserIds,
    connectedPeerUserIds,
    remoteMutedPeerUserIds,
    remoteSpeakingPeerUserIds,
    remoteAudioMutedPeerUserIds
  });

  const {
    currentRoomScreenShareOwner,
    isCurrentUserScreenShareOwner,
    canToggleScreenShare,
    activeScreenShare,
    handleIncomingScreenShareState,
    handleToggleScreenShare
  } = useScreenShareOrchestrator({
    ...screenShare,
    roomSlug: roomSnapshot.roomSlug,
    currentRoomKind,
    currentRoomSupportsScreenShare,
    roomVoiceConnected,
    connectRoom,
    remoteVideoLabelsByUserId,
    localScreenShareStream,
    remoteScreenShareStreamsByUserId,
    isLocalScreenSharing,
    startLocalScreenShare,
    stopLocalScreenShare
  });

  const {
    speakingVideoWindowIds,
    effectiveVoiceCameraEnabledByUserIdInCurrentRoom,
    voiceMediaStatusSummaryByUserIdInCurrentRoom
  } = useVoiceMediaUiMaps({
    ...voiceMediaUiMaps,
    currentRoomVoiceTargets,
    remoteSpeakingPeerUserIds,
    voiceMicStateByUserIdInCurrentRoom,
    remoteVideoStreamsByUserId,
    roomVoiceConnected,
    allowVideoStreaming,
    voiceMediaStatusByPeerUserId,
    localVoiceMediaStatusSummary
  });

  return {
    currentRoomVoiceTargets,
    remoteVideoLabelsByUserId,
    currentRoomSnapshot,
    topologySupportsRtc,
    currentRoomSupportsRtc,
    currentRoomSupportsVideo,
    allowVideoStreaming,
    roomVoiceConnected,
    remoteAudioAutoplayBlocked,
    localVoiceMediaStatusSummary,
    localVideoStream,
    remoteVideoStreamsByUserId,
    connectRoom,
    disconnectRoom,
    handleIncomingRtcVideoState,
    handleCallNack,
    normalizedServerVideoWindowMinWidth,
    normalizedServerVideoWindowMaxWidth,
    setBoundedServerVideoWindowMinWidth,
    setBoundedServerVideoWindowMaxWidth,
    voiceMicStateByUserIdInCurrentRoom,
    voiceAudioOutputMutedByUserIdInCurrentRoom,
    voiceRtcStateByUserIdInCurrentRoom,
    currentRoomScreenShareOwner,
    isCurrentUserScreenShareOwner,
    canToggleScreenShare,
    activeScreenShare,
    handleIncomingScreenShareState,
    handleToggleScreenShare,
    speakingVideoWindowIds,
    effectiveVoiceCameraEnabledByUserIdInCurrentRoom,
    voiceMediaStatusSummaryByUserIdInCurrentRoom,
    serverVideoPreviewStream
  };
}
