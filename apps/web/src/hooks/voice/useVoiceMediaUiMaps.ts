import { useMemo } from "react";
import type { PresenceMember } from "../../domain";
import type { VoiceMediaStatusSummary } from "../rtc/voiceCallTypes";
import { asTrimmedString } from "../../utils/stringUtils";

type UseVoiceMediaUiMapsArgs = {
  currentRoomVoiceTargets: PresenceMember[];
  remoteSpeakingPeerUserIds: string[];
  currentUserId: string;
  voiceMicStateByUserIdInCurrentRoom: Record<string, "muted" | "silent" | "speaking">;
  remoteVideoStreamsByUserId: Record<string, MediaStream>;
  roomVoiceConnected: boolean;
  allowVideoStreaming: boolean;
  cameraEnabled: boolean;
  voiceMediaStatusByPeerUserId: Record<string, VoiceMediaStatusSummary>;
  localVoiceMediaStatusSummary: VoiceMediaStatusSummary;
};

export function useVoiceMediaUiMaps({
  currentRoomVoiceTargets,
  remoteSpeakingPeerUserIds,
  currentUserId,
  voiceMicStateByUserIdInCurrentRoom,
  remoteVideoStreamsByUserId,
  roomVoiceConnected,
  allowVideoStreaming,
  cameraEnabled,
  voiceMediaStatusByPeerUserId,
  localVoiceMediaStatusSummary
}: UseVoiceMediaUiMapsArgs) {
  const speakingVideoWindowIds = useMemo(() => {
    const ids = new Set<string>();

    remoteSpeakingPeerUserIds
      .map((userId) => asTrimmedString(userId))
      .filter((userId) => userId.length > 0)
      .forEach((userId) => ids.add(userId));

    if (currentUserId && voiceMicStateByUserIdInCurrentRoom[currentUserId] === "speaking") {
      ids.add("local");
    }

    return Array.from(ids);
  }, [remoteSpeakingPeerUserIds, currentUserId, voiceMicStateByUserIdInCurrentRoom]);

  const effectiveVoiceCameraEnabledByUserIdInCurrentRoom = useMemo(() => {
    const map: Record<string, boolean> = {};
    const activeTargetIds = new Set(
      currentRoomVoiceTargets
        .map((member) => asTrimmedString(member.userId))
        .filter((userId) => userId.length > 0)
    );

    activeTargetIds.forEach((userId) => {
      const hasRemoteStream = Object.prototype.hasOwnProperty.call(remoteVideoStreamsByUserId, userId);
      map[userId] = hasRemoteStream;
    });

    if (currentUserId) {
      map[currentUserId] = Boolean(roomVoiceConnected && allowVideoStreaming && cameraEnabled);
    }

    return map;
  }, [
    currentRoomVoiceTargets,
    remoteVideoStreamsByUserId,
    currentUserId,
    roomVoiceConnected,
    allowVideoStreaming,
    cameraEnabled
  ]);

  const voiceMediaStatusSummaryByUserIdInCurrentRoom = useMemo(() => {
    const map = {
      ...voiceMediaStatusByPeerUserId
    };

    if (currentUserId) {
      map[currentUserId] = localVoiceMediaStatusSummary;
    }

    return map;
  }, [voiceMediaStatusByPeerUserId, currentUserId, localVoiceMediaStatusSummary]);

  return {
    speakingVideoWindowIds,
    effectiveVoiceCameraEnabledByUserIdInCurrentRoom,
    voiceMediaStatusSummaryByUserIdInCurrentRoom
  };
}