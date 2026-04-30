/**
 * useOfflineMembers.ts — хук выборки и форматирования offline-участников.
 * Совмещает список ServerMemberItem с PresenceMember, сортирует по «last seen» и форматирует строку.
 */
import { useEffect, useMemo, useState } from "react";
import type { PresenceMember, ServerMemberItem } from "../../domain";
import { asTrimmedString } from "../../utils/stringUtils";
import { formatOfflineLastSeen } from "./offlineLastSeenFormat";

type UseOfflineMembersArgs = {
  serverMembers: ServerMemberItem[];
  liveRoomMemberDetailsBySlug: Record<string, PresenceMember[]>;
};

type OfflineMember = {
  userId: string;
  userName: string;
  lastSeenLabel: string;
};

const collectOnlineUserIds = (bySlug: Record<string, PresenceMember[]>): Set<string> => {
  const onlineById = new Set<string>();

  Object.values(bySlug || {}).forEach((members) => {
    (Array.isArray(members) ? members : []).forEach((member) => {
      const userId = asTrimmedString(member.userId);
      if (userId) {
        onlineById.add(userId);
      }
    });
  });

  return onlineById;
};

export function useOfflineMembers({ serverMembers, liveRoomMemberDetailsBySlug }: UseOfflineMembersArgs): OfflineMember[] {
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return useMemo(() => {
    const onlineById = collectOnlineUserIds(liveRoomMemberDetailsBySlug || {});
    const members = Array.isArray(serverMembers) ? serverMembers : [];
    const byId = new Map<string, ServerMemberItem>();

    members.forEach((member) => {
      const userId = asTrimmedString(member.userId);
      if (!userId || byId.has(userId)) {
        return;
      }

      byId.set(userId, member);
    });

    return Array.from(byId.values())
      .filter((member) => {
        const userId = asTrimmedString(member.userId);
        return Boolean(userId) && !onlineById.has(userId);
      })
      .map((member) => {
        const userId = asTrimmedString(member.userId);
        const userName = String(member.name || member.email || userId).trim();
        const apiLastSeenAt = asTrimmedString(member.lastSeenAt);
        const apiLastSeenTs = apiLastSeenAt ? Date.parse(apiLastSeenAt) : Number.NaN;
        const lastSeenTs = Number.isFinite(apiLastSeenTs) ? apiLastSeenTs : Number.NaN;
        const hasSeen = Number.isFinite(lastSeenTs) && lastSeenTs > 0;
        const diffMs = hasSeen ? Math.max(0, nowTs - lastSeenTs) : 0;

        return {
          userId,
          userName,
          lastSeenSortTs: hasSeen ? lastSeenTs : Number.NEGATIVE_INFINITY,
          lastSeenLabel: hasSeen ? formatOfflineLastSeen(diffMs) : "—"
        };
      })
      .sort((left, right) => {
        if (left.lastSeenSortTs !== right.lastSeenSortTs) {
          return right.lastSeenSortTs - left.lastSeenSortTs;
        }

        return left.userName.localeCompare(right.userName);
      })
      .map(({ userId, userName, lastSeenLabel }) => ({ userId, userName, lastSeenLabel }));
  }, [liveRoomMemberDetailsBySlug, nowTs, serverMembers]);
}
