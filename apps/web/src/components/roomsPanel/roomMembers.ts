import type { PresenceMember } from "../../domain";

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
    details.forEach((member) => {
      const userId = String(member.userId || "").trim();
      const userName = String(member.userName || member.userId || "").trim();
      if (!userName) {
        return;
      }

      if (userId) {
        if (seenUserIds.has(userId)) {
          return;
        }
        seenUserIds.add(userId);
      }

      members.push({ userId, userName });
    });

    return members;
  }

  return (liveRoomMembersBySlug[slug] || [])
    .map((nameRaw) => {
      const userName = String(nameRaw || "").trim();
      return {
        userId: "",
        userName
      };
    })
    .filter((member) => member.userName.length > 0);
}
