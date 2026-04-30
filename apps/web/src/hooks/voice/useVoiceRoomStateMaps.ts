import { useMemo } from "react";
import type { CallStatus } from "../../services";
import { asTrimmedString } from "../../utils/stringUtils";

type UseVoiceRoomStateMapsArgs = {
  userId: string;
  roomVoiceConnected: boolean;
  micMuted: boolean;
  micTestLevel: number;
  audioMuted: boolean;
  callStatus: CallStatus;
  roomVoiceTargetsCount: number;
  connectingPeerUserIds: string[];
  connectedPeerUserIds: string[];
  remoteMutedPeerUserIds: string[];
  remoteSpeakingPeerUserIds: string[];
  remoteAudioMutedPeerUserIds: string[];
  initialMicStateByUserIdInCurrentRoom: Record<string, "muted" | "silent" | "speaking">;
  initialAudioOutputMutedByUserIdInCurrentRoom: Record<string, boolean>;
};

const LOCAL_SPEAKING_THRESHOLD = 0.055;

export function useVoiceRoomStateMaps({
  userId,
  roomVoiceConnected,
  micMuted,
  micTestLevel,
  audioMuted,
  callStatus,
  roomVoiceTargetsCount,
  connectingPeerUserIds,
  connectedPeerUserIds,
  remoteMutedPeerUserIds,
  remoteSpeakingPeerUserIds,
  remoteAudioMutedPeerUserIds,
  initialMicStateByUserIdInCurrentRoom,
  initialAudioOutputMutedByUserIdInCurrentRoom
}: UseVoiceRoomStateMapsArgs) {
  const voiceMicStateByUserIdInCurrentRoom = useMemo(() => {
    const statusByUserId: Record<string, "muted" | "silent" | "speaking"> = {};

    connectedPeerUserIds.forEach((peerUserId) => {
      const normalized = asTrimmedString(peerUserId);
      if (normalized) {
        statusByUserId[normalized] = "silent";
      }
    });

    Object.entries(initialMicStateByUserIdInCurrentRoom).forEach(([peerUserId, status]) => {
      const normalized = asTrimmedString(peerUserId);
      if (normalized && (status === "muted" || status === "silent" || status === "speaking")) {
        statusByUserId[normalized] = status;
      }
    });

    remoteSpeakingPeerUserIds.forEach((peerUserId) => {
      const normalized = asTrimmedString(peerUserId);
      if (normalized) {
        statusByUserId[normalized] = "speaking";
      }
    });

    remoteMutedPeerUserIds.forEach((peerUserId) => {
      const normalized = asTrimmedString(peerUserId);
      if (normalized) {
        statusByUserId[normalized] = "muted";
      }
    });

    if (userId) {
      const localSpeaking = !micMuted && micTestLevel >= LOCAL_SPEAKING_THRESHOLD;
      statusByUserId[userId] = micMuted ? "muted" : localSpeaking ? "speaking" : "silent";
    }

    return statusByUserId;
  }, [connectedPeerUserIds, initialMicStateByUserIdInCurrentRoom, remoteSpeakingPeerUserIds, remoteMutedPeerUserIds, roomVoiceConnected, userId, micMuted, micTestLevel]);

  const voiceAudioOutputMutedByUserIdInCurrentRoom = useMemo(() => {
    const statusByUserId: Record<string, boolean> = {};

    connectedPeerUserIds.forEach((peerUserId) => {
      const normalized = asTrimmedString(peerUserId);
      if (normalized) {
        statusByUserId[normalized] = false;
      }
    });

    Object.entries(initialAudioOutputMutedByUserIdInCurrentRoom).forEach(([peerUserId, muted]) => {
      const normalized = asTrimmedString(peerUserId);
      if (normalized) {
        statusByUserId[normalized] = Boolean(muted);
      }
    });

    remoteAudioMutedPeerUserIds.forEach((peerUserId) => {
      const normalized = asTrimmedString(peerUserId);
      if (normalized) {
        statusByUserId[normalized] = true;
      }
    });

    if (userId) {
      statusByUserId[userId] = audioMuted;
    }

    return statusByUserId;
  }, [connectedPeerUserIds, initialAudioOutputMutedByUserIdInCurrentRoom, remoteAudioMutedPeerUserIds, roomVoiceConnected, userId, audioMuted]);

  const voiceRtcStateByUserIdInCurrentRoom = useMemo(() => {
    const statusByUserId: Record<string, "disconnected" | "connecting" | "connected"> = {};

    connectingPeerUserIds.forEach((peerUserId) => {
      const normalized = asTrimmedString(peerUserId);
      if (normalized) {
        statusByUserId[normalized] = "connecting";
      }
    });

    connectedPeerUserIds.forEach((peerUserId) => {
      const normalized = asTrimmedString(peerUserId);
      if (normalized) {
        statusByUserId[normalized] = "connected";
      }
    });

    if (roomVoiceConnected && userId) {
      if (callStatus === "active") {
        statusByUserId[userId] = "connected";
      } else if (callStatus === "connecting" || callStatus === "ringing") {
        statusByUserId[userId] = "connecting";
      }
    }

    return statusByUserId;
  }, [connectingPeerUserIds, connectedPeerUserIds, roomVoiceConnected, userId, roomVoiceTargetsCount, callStatus]);

  return {
    voiceMicStateByUserIdInCurrentRoom,
    voiceAudioOutputMutedByUserIdInCurrentRoom,
    voiceRtcStateByUserIdInCurrentRoom
  };
}
