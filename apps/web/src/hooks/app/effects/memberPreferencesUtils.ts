import type { PresenceMember } from "../../../domain";
import { asTrimmedString } from "../../../utils/stringUtils";

export function deriveMemberPreferenceTargetUserIds(
  roomsPresenceDetailsBySlug: Record<string, PresenceMember[]>,
  currentUserId: string
): string[] {
  const normalizedCurrentUserId = asTrimmedString(currentUserId);

  return Array.from(new Set(
    Object.values(roomsPresenceDetailsBySlug)
      .flat()
      .map((member) => asTrimmedString(member.userId))
      .filter((memberUserId) => memberUserId.length > 0 && memberUserId !== normalizedCurrentUserId)
  ));
}