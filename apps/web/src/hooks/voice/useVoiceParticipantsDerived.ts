import { useMemo } from "react";
import type { PresenceMember, RoomMemberPreference } from "../../domain";

type UseVoiceParticipantsDerivedArgs = {
  roomsPresenceDetailsBySlug: Record<string, PresenceMember[]>;
  roomSlug: string;
  currentUserId: string;
  memberPreferencesByUserId: Record<string, RoomMemberPreference>;
};

export function useVoiceParticipantsDerived({
  roomsPresenceDetailsBySlug,
  roomSlug,
  currentUserId,
  memberPreferencesByUserId
}: UseVoiceParticipantsDerivedArgs) {
  const currentRoomVoiceTargets = useMemo(() => {
    const presenceBySlug = roomsPresenceDetailsBySlug || {};
    const members = presenceBySlug[roomSlug] || [];
    return members.filter((member) => member.userId !== currentUserId);
  }, [roomsPresenceDetailsBySlug, roomSlug, currentUserId]);

  const memberVolumeByUserId = useMemo(() => {
    const volumes: Record<string, number> = {};
    Object.entries(memberPreferencesByUserId).forEach(([userId, preference]) => {
      volumes[userId] = Number(preference?.volume ?? 100);
    });
    return volumes;
  }, [memberPreferencesByUserId]);

  const remoteVideoLabelsByUserId = useMemo(() => {
    const labels: Record<string, string> = {};
    currentRoomVoiceTargets.forEach((member) => {
      labels[member.userId] = member.userName || member.userId;
    });
    return labels;
  }, [currentRoomVoiceTargets]);

  const videoPolicyAudienceKey = useMemo(() => {
    return currentRoomVoiceTargets
      .map((member) => String(member.userId || "").trim())
      .filter((userId) => userId.length > 0)
      .sort()
      .join("|");
  }, [currentRoomVoiceTargets]);

  return {
    currentRoomVoiceTargets,
    memberVolumeByUserId,
    remoteVideoLabelsByUserId,
    videoPolicyAudienceKey
  };
}