/**
 * roomMembers.ts — хелперы для списка участников комнаты.
 * Преобразует PresenceMember в сплющенный RoomMember (`userId`, `userName`) для рендера.
 */
import type { PresenceMember } from "../../domain";
import { asTrimmedString } from "../../utils/stringUtils";

export type RoomMember = { userId: string; userName: string };

export function mapRoomMembersForSlug(
  liveRoomMemberDetailsBySlug: Record<string, PresenceMember[]>,
  liveRoomMembersBySlug: Record<string, string[]>,
  slug: string
): RoomMember[] {
  const details = liveRoomMemberDetailsBySlug[slug] || [];
  if (details.length > 0) {
    const members: RoomMember[] = [];
    const seenUserIds = new Set<string>();
    const seenNoIdNames = new Set<string>();
    details.forEach((member) => {
      const userId = asTrimmedString(member.userId);
      const userName = asTrimmedString(member.userName || member.userId);
      if (!userName) {
        return;
      }

      if (userId) {
        if (seenUserIds.has(userId)) {
          return;
        }
        seenUserIds.add(userId);
      } else {
        const normalizedName = userName.toLocaleLowerCase();
        if (seenNoIdNames.has(normalizedName)) {
          return;
        }
        seenNoIdNames.add(normalizedName);
      }

      members.push({ userId, userName });
    });

    return members;
  }

  const seenNames = new Set<string>();
  return (liveRoomMembersBySlug[slug] || [])
    .map((nameRaw) => {
      const userName = asTrimmedString(nameRaw);
      return {
        userId: "",
        userName
      };
    })
    .filter((member) => {
      if (!member.userName) {
        return false;
      }

      const normalizedName = member.userName.toLocaleLowerCase();
      if (seenNames.has(normalizedName)) {
        return false;
      }

      seenNames.add(normalizedName);
      return true;
    });
}
