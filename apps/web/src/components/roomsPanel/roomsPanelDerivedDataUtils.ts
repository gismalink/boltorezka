import type { PresenceMember, Room, RoomsTreeResponse } from "../../domain";
import { mapRoomMembersForSlug, type RoomMember } from "./roomMembers";

export const OUTSIDE_ROOMS_PRESENCE_KEY = "__outside_rooms__";

type OutsideOnlineMember = {
  userId: string;
  userName: string;
};

type BuildRoomsPanelDerivedDataInput = {
  roomsTree: RoomsTreeResponse | null;
  uncategorizedRooms: Room[];
  archivedRooms: Room[];
  roomUnreadBySlug: Record<string, number>;
  roomMentionUnreadBySlug: Record<string, number>;
  roomMutePresetByRoomId: Record<string, "1h" | "8h" | "24h" | "forever" | "off">;
  liveRoomMembersBySlug: Record<string, string[]>;
  liveRoomMemberDetailsBySlug: Record<string, PresenceMember[]>;
};

// Чистая функция для вычисления производных данных панели комнат.
// Вынесена отдельно, чтобы логику можно было надежно покрывать unit-тестами.
export function buildRoomsPanelDerivedData({
  roomsTree,
  uncategorizedRooms,
  archivedRooms,
  roomUnreadBySlug,
  roomMentionUnreadBySlug,
  roomMutePresetByRoomId,
  liveRoomMembersBySlug,
  liveRoomMemberDetailsBySlug
}: BuildRoomsPanelDerivedDataInput) {
  const knownRoomSlugs = new Set<string>();
  (roomsTree?.categories || []).forEach((category) => {
    const categoryRooms = Array.isArray((category as { channels?: Room[] }).channels)
      ? (category as { channels?: Room[] }).channels || []
      : Array.isArray((category as { rooms?: Room[] }).rooms)
        ? (category as { rooms?: Room[] }).rooms || []
        : [];
    categoryRooms.forEach((room) => {
      const slug = String(room.slug || "").trim();
      if (slug) {
        knownRoomSlugs.add(slug);
      }
    });
  });
  uncategorizedRooms.forEach((room) => {
    const slug = String(room.slug || "").trim();
    if (slug) {
      knownRoomSlugs.add(slug);
    }
  });
  archivedRooms.forEach((room) => {
    const slug = String(room.slug || "").trim();
    if (slug) {
      knownRoomSlugs.add(slug);
    }
  });

  const knownRoomUserIds = new Set<string>();
  const knownRoomUserNames = new Set<string>();
  Object.entries(liveRoomMemberDetailsBySlug || {}).forEach(([slugRaw, members]) => {
    const slug = String(slugRaw || "").trim();
    if (!slug || slug === OUTSIDE_ROOMS_PRESENCE_KEY || !knownRoomSlugs.has(slug)) {
      return;
    }

    (Array.isArray(members) ? members : []).forEach((member) => {
      const userId = String(member.userId || "").trim();
      const userName = String(member.userName || member.userId || "").trim().toLowerCase();
      if (userId) {
        knownRoomUserIds.add(userId);
      }
      if (userName) {
        knownRoomUserNames.add(userName);
      }
    });
  });

  Object.entries(liveRoomMembersBySlug || {}).forEach(([slugRaw, members]) => {
    const slug = String(slugRaw || "").trim();
    if (!slug || slug === OUTSIDE_ROOMS_PRESENCE_KEY || !knownRoomSlugs.has(slug)) {
      return;
    }

    (Array.isArray(members) ? members : []).forEach((memberName) => {
      const normalizedName = String(memberName || "").trim().toLowerCase();
      if (normalizedName) {
        knownRoomUserNames.add(normalizedName);
      }
    });
  });

  const outsideByKey = new Map<string, OutsideOnlineMember>();
  const seenOutsideIds = new Set<string>();
  const seenOutsideNames = new Set<string>();

  const addOutsideMember = (input: { userId?: string | null; userName?: string | null }) => {
    const userId = String(input.userId || "").trim();
    const userName = String(input.userName || input.userId || "").trim();
    if (!userName) {
      return;
    }

    const normalizedUserName = userName.toLowerCase();
    if ((userId && knownRoomUserIds.has(userId)) || knownRoomUserNames.has(normalizedUserName)) {
      return;
    }

    const hasById = userId ? seenOutsideIds.has(userId) : false;
    const hasByName = seenOutsideNames.has(normalizedUserName);
    if (hasById || hasByName) {
      if (hasByName && userId) {
        seenOutsideIds.add(userId);
      }
      return;
    }

    if (userId) {
      seenOutsideIds.add(userId);
    }
    seenOutsideNames.add(normalizedUserName);
    outsideByKey.set(userId || normalizedUserName, { userId, userName });
  };

  Object.entries(liveRoomMemberDetailsBySlug || {}).forEach(([slugRaw, members]) => {
    const slug = String(slugRaw || "").trim();
    if (slug !== OUTSIDE_ROOMS_PRESENCE_KEY) {
      return;
    }

    (Array.isArray(members) ? members : []).forEach((member) => {
      addOutsideMember({ userId: member.userId, userName: member.userName });
    });
  });

  Object.entries(liveRoomMembersBySlug || {}).forEach(([slugRaw, memberNames]) => {
    const slug = String(slugRaw || "").trim();
    if (slug !== OUTSIDE_ROOMS_PRESENCE_KEY) {
      return;
    }

    (Array.isArray(memberNames) ? memberNames : []).forEach((nameRaw) => {
      addOutsideMember({ userName: String(nameRaw || "").trim() });
    });
  });

  const onlineOutsideRooms = Array.from(outsideByKey.values()).sort((a, b) => a.userName.localeCompare(b.userName));

  const roomMembersBySlug: Record<string, RoomMember[]> = {};
  knownRoomSlugs.forEach((slug) => {
    roomMembersBySlug[slug] = mapRoomMembersForSlug(liveRoomMemberDetailsBySlug, liveRoomMembersBySlug, slug);
  });

  const uncategorizedUnreadCount = uncategorizedRooms.reduce((sum, room) => {
    const slug = String(room.slug || "").trim();
    if (!slug) {
      return sum;
    }
    return sum + Math.max(0, Number(roomUnreadBySlug[slug] || 0));
  }, 0);

  const uncategorizedMentionCount = uncategorizedRooms.reduce((sum, room) => {
    const slug = String(room.slug || "").trim();
    if (!slug) {
      return sum;
    }
    return sum + Math.max(0, Number(roomMentionUnreadBySlug[slug] || 0));
  }, 0);

  const outsideRoomsUnreadCount = Object.entries(roomUnreadBySlug).reduce((sum, [slugRaw, unreadRaw]) => {
    const slug = String(slugRaw || "").trim();
    if (!slug) {
      return sum;
    }
    if (slug !== OUTSIDE_ROOMS_PRESENCE_KEY && knownRoomSlugs.has(slug)) {
      return sum;
    }
    return sum + Math.max(0, Number(unreadRaw || 0));
  }, 0);

  const categoryUnreadMutedById: Record<string, number> = {};
  const categoryUnreadUnmutedById: Record<string, number> = {};
  const categoryMentionById: Record<string, number> = {};
  (roomsTree?.categories || []).forEach((category) => {
    const categoryRooms = Array.isArray((category as { channels?: Room[] }).channels)
      ? (category as { channels?: Room[] }).channels || []
      : Array.isArray((category as { rooms?: Room[] }).rooms)
        ? (category as { rooms?: Room[] }).rooms || []
        : [];
    const categoryId = String(category.id || "").trim();
    if (!categoryId) {
      return;
    }

    categoryMentionById[categoryId] = categoryRooms.reduce((sum, room) => {
      const slug = String(room.slug || "").trim();
      if (!slug) {
        return sum;
      }
      return sum + Math.max(0, Number(roomMentionUnreadBySlug[slug] || 0));
    }, 0);

    categoryUnreadMutedById[categoryId] = categoryRooms.reduce((sum, room) => {
      const roomId = String(room.id || "").trim();
      const slug = String(room.slug || "").trim();
      if (!roomId || !slug) {
        return sum;
      }

      const preset = roomMutePresetByRoomId[roomId];
      if (preset != null && preset !== "off") {
        return sum + Math.max(0, Number(roomUnreadBySlug[slug] || 0));
      }

      return sum;
    }, 0);

    categoryUnreadUnmutedById[categoryId] = categoryRooms.reduce((sum, room) => {
      const roomId = String(room.id || "").trim();
      const slug = String(room.slug || "").trim();
      if (!roomId || !slug) {
        return sum;
      }

      const preset = roomMutePresetByRoomId[roomId];
      if (preset == null || preset === "off") {
        return sum + Math.max(0, Number(roomUnreadBySlug[slug] || 0));
      }

      return sum;
    }, 0);
  });

  return {
    onlineOutsideRooms,
    roomMembersBySlug,
    uncategorizedUnreadCount,
    uncategorizedMentionCount,
    outsideRoomsUnreadCount,
    categoryUnreadMutedById,
    categoryUnreadUnmutedById,
    categoryMentionById
  };
}
