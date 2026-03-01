import { useMemo } from "react";
import type { CallStatus } from "../services";

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
  remoteAudioMutedPeerUserIds
}: UseVoiceRoomStateMapsArgs) {
  const voiceMicStateByUserIdInCurrentRoom = useMemo(() => {
    const statusByUserId: Record<string, "muted" | "silent" | "speaking"> = {};

    connectedPeerUserIds.forEach((peerUserId) => {
      const normalized = String(peerUserId || "").trim();
      if (normalized) {
        statusByUserId[normalized] = "silent";
      }
    });

    remoteSpeakingPeerUserIds.forEach((peerUserId) => {
      const normalized = String(peerUserId || "").trim();
      if (normalized) {
        statusByUserId[normalized] = "speaking";
      }
    });

    remoteMutedPeerUserIds.forEach((peerUserId) => {
      const normalized = String(peerUserId || "").trim();
      if (normalized) {
        statusByUserId[normalized] = "muted";
      }
    });

    if (roomVoiceConnected && userId) {
      const localSpeaking = !micMuted && micTestLevel >= LOCAL_SPEAKING_THRESHOLD;
      statusByUserId[userId] = micMuted ? "muted" : localSpeaking ? "speaking" : "silent";
    }

    return statusByUserId;
  }, [connectedPeerUserIds, remoteSpeakingPeerUserIds, remoteMutedPeerUserIds, roomVoiceConnected, userId, micMuted, micTestLevel]);

  const voiceAudioOutputMutedByUserIdInCurrentRoom = useMemo(() => {
    const statusByUserId: Record<string, boolean> = {};

    connectedPeerUserIds.forEach((peerUserId) => {
      const normalized = String(peerUserId || "").trim();
      if (normalized) {
        statusByUserId[normalized] = false;
      }
    });

    remoteAudioMutedPeerUserIds.forEach((peerUserId) => {
      const normalized = String(peerUserId || "").trim();
      if (normalized) {
        statusByUserId[normalized] = true;
      }
    });

    if (roomVoiceConnected && userId) {
      statusByUserId[userId] = audioMuted;
    }

    return statusByUserId;
  }, [connectedPeerUserIds, remoteAudioMutedPeerUserIds, roomVoiceConnected, userId, audioMuted]);

  const voiceRtcStateByUserIdInCurrentRoom = useMemo(() => {
    const statusByUserId: Record<string, "disconnected" | "connecting" | "connected"> = {};

    connectingPeerUserIds.forEach((peerUserId) => {
      const normalized = String(peerUserId || "").trim();
      if (normalized) {
        statusByUserId[normalized] = "connecting";
      }
    });

    connectedPeerUserIds.forEach((peerUserId) => {
      const normalized = String(peerUserId || "").trim();
      if (normalized) {
        statusByUserId[normalized] = "connected";
      }
    });

    if (roomVoiceConnected && userId && roomVoiceTargetsCount > 0) {
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
