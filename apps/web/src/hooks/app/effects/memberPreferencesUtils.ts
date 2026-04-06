import type { PresenceMember } from "../../../domain";

export function deriveMemberPreferenceTargetUserIds(
  roomsPresenceDetailsBySlug: Record<string, PresenceMember[]>,
  currentUserId: string
): string[] {
  const normalizedCurrentUserId = String(currentUserId || "").trim();

  return Array.from(new Set(
    Object.values(roomsPresenceDetailsBySlug)
      .flat()
      .map((member) => String(member.userId || "").trim())
      .filter((memberUserId) => memberUserId.length > 0 && memberUserId !== normalizedCurrentUserId)
  ));
}