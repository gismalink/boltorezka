/**
 * roomsPanelDerivedDataUtils.ts — чистые функции расчёта агрегатов для RoomsPanel.
 * Сводит дерево комнат + presence в структуры, удобные для рендера (online/offline/voice/category).
 */
import type { PresenceMember, Room, RoomsTreeResponse } from "../../domain";
import { asTrimmedString } from "../../utils/stringUtils";
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
      const slug = asTrimmedString(room.slug);
      if (slug) {
        knownRoomSlugs.add(slug);
      }
    });
  });
  uncategorizedRooms.forEach((room) => {
    const slug = asTrimmedString(room.slug);
    if (slug) {
      knownRoomSlugs.add(slug);
    }
  });
  archivedRooms.forEach((room) => {
    const slug = asTrimmedString(room.slug);
    if (slug) {
      knownRoomSlugs.add(slug);
    }
  });

  const knownRoomUserIds = new Set<string>();
  Object.entries(liveRoomMemberDetailsBySlug || {}).forEach(([slugRaw, members]) => {
    const slug = asTrimmedString(slugRaw);
    if (!slug || slug === OUTSIDE_ROOMS_PRESENCE_KEY || !knownRoomSlugs.has(slug)) {
      return;
    }

    (Array.isArray(members) ? members : []).forEach((member) => {
      const userId = asTrimmedString(member.userId);
      if (userId) {
        knownRoomUserIds.add(userId);
      }
    });
  });

  const outsideByKey = new Map<string, OutsideOnlineMember>();
  const seenOutsideIds = new Set<string>();
  const seenOutsideNoIdNames = new Set<string>();
  let outsideNoIdCounter = 0;

  const addOutsideMember = (input: { userId?: string | null; userName?: string | null }) => {
    const userId = asTrimmedString(input.userId);
    const userName = asTrimmedString(input.userName || input.userId);
    if (!userName) {
      return;
    }

    if (userId && knownRoomUserIds.has(userId)) {
      return;
    }

    if (userId && seenOutsideIds.has(userId)) {
      return;
    }

    if (userId) {
      seenOutsideIds.add(userId);
      seenOutsideNoIdNames.add(userName.toLowerCase());
    } else {
      const normalizedName = userName.toLowerCase();
      if (seenOutsideNoIdNames.has(normalizedName)) {
        return;
      }
      seenOutsideNoIdNames.add(normalizedName);
    }

    const entryKey = userId || `outside-no-id:${outsideNoIdCounter++}`;
    outsideByKey.set(entryKey, { userId, userName });
  };

  Object.entries(liveRoomMemberDetailsBySlug || {}).forEach(([slugRaw, members]) => {
    const slug = asTrimmedString(slugRaw);
    if (slug !== OUTSIDE_ROOMS_PRESENCE_KEY) {
      return;
    }

    (Array.isArray(members) ? members : []).forEach((member) => {
      addOutsideMember({ userId: member.userId, userName: member.userName });
    });
  });

  Object.entries(liveRoomMembersBySlug || {}).forEach(([slugRaw, memberNames]) => {
    const slug = asTrimmedString(slugRaw);
    if (slug !== OUTSIDE_ROOMS_PRESENCE_KEY) {
      return;
    }

    (Array.isArray(memberNames) ? memberNames : []).forEach((nameRaw) => {
      addOutsideMember({ userName: asTrimmedString(nameRaw) });
    });
  });

  const onlineOutsideRooms = Array.from(outsideByKey.values()).sort((a, b) => a.userName.localeCompare(b.userName));

  const roomMembersBySlug: Record<string, RoomMember[]> = {};
  knownRoomSlugs.forEach((slug) => {
    roomMembersBySlug[slug] = mapRoomMembersForSlug(liveRoomMemberDetailsBySlug, liveRoomMembersBySlug, slug);
  });

  const uncategorizedUnreadCount = uncategorizedRooms.reduce((sum, room) => {
    const slug = asTrimmedString(room.slug);
    if (!slug) {
      return sum;
    }
    return sum + Math.max(0, Number(roomUnreadBySlug[slug] || 0));
  }, 0);

  const uncategorizedMentionCount = uncategorizedRooms.reduce((sum, room) => {
    const slug = asTrimmedString(room.slug);
    if (!slug) {
      return sum;
    }
    return sum + Math.max(0, Number(roomMentionUnreadBySlug[slug] || 0));
  }, 0);

  const outsideRoomsUnreadCount = Object.entries(roomUnreadBySlug).reduce((sum, [slugRaw, unreadRaw]) => {
    const slug = asTrimmedString(slugRaw);
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
  const uncategorizedUnreadMutedCount = uncategorizedRooms.reduce((sum, room) => {
    const roomId = asTrimmedString(room.id);
    const slug = asTrimmedString(room.slug);
    if (!roomId || !slug) {
      return sum;
    }

    const preset = roomMutePresetByRoomId[roomId];
    if (preset != null && preset !== "off") {
      return sum + Math.max(0, Number(roomUnreadBySlug[slug] || 0));
    }

    return sum;
  }, 0);

  const uncategorizedUnreadUnmutedCount = uncategorizedRooms.reduce((sum, room) => {
    const roomId = asTrimmedString(room.id);
    const slug = asTrimmedString(room.slug);
    if (!roomId || !slug) {
      return sum;
    }

    const preset = roomMutePresetByRoomId[roomId];
    if (preset == null || preset === "off") {
      return sum + Math.max(0, Number(roomUnreadBySlug[slug] || 0));
    }

    return sum;
  }, 0);
  (roomsTree?.categories || []).forEach((category) => {
    const categoryRooms = Array.isArray((category as { channels?: Room[] }).channels)
      ? (category as { channels?: Room[] }).channels || []
      : Array.isArray((category as { rooms?: Room[] }).rooms)
        ? (category as { rooms?: Room[] }).rooms || []
        : [];
    const categoryId = asTrimmedString(category.id);
    if (!categoryId) {
      return;
    }

    categoryMentionById[categoryId] = categoryRooms.reduce((sum, room) => {
      const slug = asTrimmedString(room.slug);
      if (!slug) {
        return sum;
      }
      return sum + Math.max(0, Number(roomMentionUnreadBySlug[slug] || 0));
    }, 0);

    categoryUnreadMutedById[categoryId] = categoryRooms.reduce((sum, room) => {
      const roomId = asTrimmedString(room.id);
      const slug = asTrimmedString(room.slug);
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
      const roomId = asTrimmedString(room.id);
      const slug = asTrimmedString(room.slug);
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
    uncategorizedUnreadMutedCount,
    uncategorizedUnreadUnmutedCount,
    uncategorizedMentionCount,
    outsideRoomsUnreadCount,
    categoryUnreadMutedById,
    categoryUnreadUnmutedById,
    categoryMentionById
  };
}
