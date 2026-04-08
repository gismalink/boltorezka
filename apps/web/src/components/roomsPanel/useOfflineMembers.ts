import { useCallback, useEffect, useMemo, useState } from "react";
import type { PresenceMember, ServerMemberItem } from "../../domain";
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
      const userId = String(member.userId || "").trim();
      if (userId) {
        onlineById.add(userId);
      }
    });
  });

  return onlineById;
};

export function useOfflineMembers({ serverMembers, liveRoomMemberDetailsBySlug }: UseOfflineMembersArgs): OfflineMember[] {
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [lastSeenByUserId, setLastSeenByUserId] = useState<Record<string, number>>({});

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onlineById = collectOnlineUserIds(liveRoomMemberDetailsBySlug || {});
    if (onlineById.size === 0) {
      return;
    }

    const seenAt = Date.now();
    setLastSeenByUserId((prev) => {
      let changed = false;
      const next = { ...prev };
      onlineById.forEach((userId) => {
        if (!next[userId] || seenAt > next[userId]) {
          next[userId] = seenAt;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [liveRoomMemberDetailsBySlug]);

  return useMemo(() => {
    const onlineById = collectOnlineUserIds(liveRoomMemberDetailsBySlug || {});
    const members = Array.isArray(serverMembers) ? serverMembers : [];
    const byId = new Map<string, ServerMemberItem>();

    members.forEach((member) => {
      const userId = String(member.userId || "").trim();
      if (!userId || byId.has(userId)) {
        return;
      }

      byId.set(userId, member);
    });

    return Array.from(byId.values())
      .filter((member) => {
        const userId = String(member.userId || "").trim();
        return Boolean(userId) && !onlineById.has(userId);
      })
      .map((member) => {
        const userId = String(member.userId || "").trim();
        const userName = String(member.name || member.email || userId).trim();
        const apiLastSeenAt = String(member.lastSeenAt || "").trim();
        const apiLastSeenTs = apiLastSeenAt ? Date.parse(apiLastSeenAt) : Number.NaN;
        const sessionLastSeenTs = Number(lastSeenByUserId[userId] || 0);
        const lastSeenTs = Number.isFinite(apiLastSeenTs) ? apiLastSeenTs : sessionLastSeenTs;
        const hasSeen = Number.isFinite(lastSeenTs) && lastSeenTs > 0;
        const diffMs = hasSeen ? Math.max(0, nowTs - lastSeenTs) : 0;

        return {
          userId,
          userName,
          lastSeenLabel: hasSeen ? formatOfflineLastSeen(diffMs) : "—"
        };
      })
      .sort((left, right) => left.userName.localeCompare(right.userName));
  }, [lastSeenByUserId, liveRoomMemberDetailsBySlug, nowTs, serverMembers]);
}
