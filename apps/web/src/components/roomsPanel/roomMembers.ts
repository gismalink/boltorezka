import type { PresenceMember } from "../../domain";

export type RoomMember = { userId: string; userName: string };

export function mapRoomMembersForSlug(
  liveRoomMemberDetailsBySlug: Record<string, PresenceMember[]>,
  liveRoomMembersBySlug: Record<string, string[]>,
  slug: string
): RoomMember[] {
  const details = liveRoomMemberDetailsBySlug[slug] || [];
  if (details.length > 0) {
    const byKey = new Map<string, RoomMember>();
    details.forEach((member) => {
      const userId = String(member.userId || "").trim();
      const userName = String(member.userName || member.userId || "").trim();
      if (!userName) {
        return;
      }

      const key = userId || userName.toLocaleLowerCase();
      if (!byKey.has(key)) {
        byKey.set(key, { userId, userName });
      }
    });

    return Array.from(byKey.values());
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
