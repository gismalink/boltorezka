import { useMemo } from "react";
import type { PresenceMember, Room, RoomsTreeResponse } from "../../domain";

const OUTSIDE_ROOMS_PRESENCE_KEY = "__outside_rooms__";

type OutsideOnlineMember = {
  userId: string;
  userName: string;
};

type UseRoomsPanelDerivedDataInput = {
  roomsTree: RoomsTreeResponse | null;
  uncategorizedRooms: Room[];
  archivedRooms: Room[];
  roomUnreadBySlug: Record<string, number>;
  liveRoomMembersBySlug: Record<string, string[]>;
  liveRoomMemberDetailsBySlug: Record<string, PresenceMember[]>;
};

export function useRoomsPanelDerivedData({
  roomsTree,
  uncategorizedRooms,
  archivedRooms,
  roomUnreadBySlug,
  liveRoomMembersBySlug,
  liveRoomMemberDetailsBySlug
}: UseRoomsPanelDerivedDataInput) {
  return useMemo(() => {
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
      const isOutsideBucket = slug === OUTSIDE_ROOMS_PRESENCE_KEY || !knownRoomSlugs.has(slug);
      if (!isOutsideBucket) {
        return;
      }

      (Array.isArray(members) ? members : []).forEach((member) => {
        addOutsideMember({ userId: member.userId, userName: member.userName });
      });
    });

    Object.entries(liveRoomMembersBySlug || {}).forEach(([slugRaw, memberNames]) => {
      const slug = String(slugRaw || "").trim();
      const isOutsideBucket = slug === OUTSIDE_ROOMS_PRESENCE_KEY || !knownRoomSlugs.has(slug);
      if (!isOutsideBucket) {
        return;
      }

      (Array.isArray(memberNames) ? memberNames : []).forEach((nameRaw) => {
        addOutsideMember({ userName: String(nameRaw || "").trim() });
      });
    });

    const onlineOutsideRooms = Array.from(outsideByKey.values()).sort((a, b) => a.userName.localeCompare(b.userName));

    const uncategorizedUnreadCount = uncategorizedRooms.reduce((sum, room) => {
      const slug = String(room.slug || "").trim();
      if (!slug) {
        return sum;
      }
      return sum + Math.max(0, Number(roomUnreadBySlug[slug] || 0));
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

    const categoryUnreadById: Record<string, number> = {};
    (roomsTree?.categories || []).forEach((category) => {
      const categoryRooms = Array.isArray((category as { channels?: Room[] }).channels)
        ? (category as { channels?: Room[] }).channels || []
        : Array.isArray((category as { rooms?: Room[] }).rooms)
          ? (category as { rooms?: Room[] }).rooms || []
          : [];
      categoryUnreadById[category.id] = categoryRooms.reduce((sum, room) => {
        const slug = String(room.slug || "").trim();
        if (!slug) {
          return sum;
        }
        return sum + Math.max(0, Number(roomUnreadBySlug[slug] || 0));
      }, 0);
    });

    return {
      onlineOutsideRooms,
      uncategorizedUnreadCount,
      outsideRoomsUnreadCount,
      categoryUnreadById
    };
  }, [
    roomsTree,
    uncategorizedRooms,
    archivedRooms,
    roomUnreadBySlug,
    liveRoomMembersBySlug,
    liveRoomMemberDetailsBySlug
  ]);
}
