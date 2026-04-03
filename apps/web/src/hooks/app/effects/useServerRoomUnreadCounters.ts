import { useEffect, useMemo, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { api } from "../../../api";
import {
  ROOM_UNREAD_BACKGROUND_JITTER_MS,
  ROOM_UNREAD_BACKGROUND_MAX_REFRESH_MS,
  ROOM_UNREAD_BACKGROUND_REFRESH_MS,
  ROOM_UNREAD_CACHE_TTL_MS,
  ROOM_UNREAD_MAX_CONCURRENCY,
  ROOM_UNREAD_METRICS_SUMMARY_EVERY
} from "../../../constants/appConfig";
import type { Room, RoomTopic } from "../../../domain";

type RoomUnreadCountItem = {
  roomId: string;
  unreadCount: number;
};

type RoomUnreadFetchMetrics = {
  requested: number;
  cacheHits: number;
  cacheMisses: number;
  durationMs: number;
};

type RoomUnreadCacheEntry = {
  unreadCount: number;
  ts: number;
};

type RoomUnreadAggregateMetrics = {
  cycles: number;
  requested: number;
  cacheHits: number;
  cacheMisses: number;
  failed: number;
  durationMs: number;
};

function createEmptyAggregateMetrics(): RoomUnreadAggregateMetrics {
  return {
    cycles: 0,
    requested: 0,
    cacheHits: 0,
    cacheMisses: 0,
    failed: 0,
    durationMs: 0
  };
}

async function fetchRoomUnreadCounts(
  token: string,
  roomIds: string[],
  concurrency = ROOM_UNREAD_MAX_CONCURRENCY,
  cache?: Map<string, RoomUnreadCacheEntry>
): Promise<{
  settled: Array<PromiseSettledResult<RoomUnreadCountItem>>;
  metrics: RoomUnreadFetchMetrics;
}> {
  const startedAt = performance.now();
  const normalizedConcurrency = Math.max(1, Math.floor(concurrency));
  const settled: Array<PromiseSettledResult<RoomUnreadCountItem>> = new Array(roomIds.length);
  const pending: Array<{ roomId: string; index: number }> = [];
  const nowMs = Date.now();
  let cacheHits = 0;

  roomIds.forEach((roomId, index) => {
    const cached = cache?.get(roomId);
    if (cached && nowMs - cached.ts <= ROOM_UNREAD_CACHE_TTL_MS) {
      cacheHits += 1;
      settled[index] = {
        status: "fulfilled",
        value: {
          roomId,
          unreadCount: cached.unreadCount
        }
      };
      return;
    }

    pending.push({ roomId, index });
  });

  for (let offset = 0; offset < pending.length; offset += normalizedConcurrency) {
    const batch = pending.slice(offset, offset + normalizedConcurrency);
    const batchSettled = await Promise.allSettled(
      batch.map(async ({ roomId }) => {
        const response = await api.roomTopics(token, roomId);
        const unreadCount = (Array.isArray(response.topics) ? response.topics : [])
          .reduce((sum, topic) => sum + Math.max(0, Number(topic.unreadCount || 0)), 0);
        cache?.set(roomId, { unreadCount, ts: Date.now() });
        return { roomId, unreadCount };
      })
    );

    batchSettled.forEach((entry, localIndex) => {
      const targetIndex = batch[localIndex]?.index;
      if (typeof targetIndex === "number") {
        settled[targetIndex] = entry;
      }
    });
  }

  const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
  return {
    settled,
    metrics: {
      requested: roomIds.length,
      cacheHits,
      cacheMisses: pending.length,
      durationMs
    }
  };
}

type UseServerRoomUnreadCountersArgs = {
  token: string;
  currentServerId: string;
  allRooms: Room[];
  chatRoomSlug: string;
  chatTopics: RoomTopic[];
  roomUnreadBySlug: Record<string, number>;
  setRoomUnreadBySlug: Dispatch<SetStateAction<Record<string, number>>>;
  pushLog: (text: string) => void;
};

export function useServerRoomUnreadCounters({
  token,
  currentServerId,
  allRooms,
  chatRoomSlug,
  chatTopics,
  roomUnreadBySlug,
  setRoomUnreadBySlug,
  pushLog
}: UseServerRoomUnreadCountersArgs) {
  const unreadCacheRef = useRef<Map<string, RoomUnreadCacheEntry>>(new Map());
  const prefetchAggregateRef = useRef<RoomUnreadAggregateMetrics>(createEmptyAggregateMetrics());
  const refreshAggregateRef = useRef<RoomUnreadAggregateMetrics>(createEmptyAggregateMetrics());

  const pushSummaryMetrics = (
    kind: "prefetch" | "refresh",
    aggregateRef: MutableRefObject<RoomUnreadAggregateMetrics>,
    metrics: RoomUnreadFetchMetrics,
    failedCount: number
  ) => {
    const aggregate = aggregateRef.current;
    aggregate.cycles += 1;
    aggregate.requested += metrics.requested;
    aggregate.cacheHits += metrics.cacheHits;
    aggregate.cacheMisses += metrics.cacheMisses;
    aggregate.failed += failedCount;
    aggregate.durationMs += metrics.durationMs;

    if (aggregate.cycles < ROOM_UNREAD_METRICS_SUMMARY_EVERY) {
      return;
    }

    const avgDurationMs = Math.round(aggregate.durationMs / Math.max(1, aggregate.cycles));
    const hitRatePct = aggregate.requested > 0
      ? Math.round((aggregate.cacheHits / aggregate.requested) * 100)
      : 0;
    pushLog(
      `room unread ${kind} summary (${aggregate.cycles} cycles): rooms=${aggregate.requested} hit=${aggregate.cacheHits} miss=${aggregate.cacheMisses} failed=${aggregate.failed} avgDurationMs=${avgDurationMs} hitRate=${hitRatePct}%`
    );

    aggregateRef.current = createEmptyAggregateMetrics();
  };

  useEffect(() => {
    unreadCacheRef.current.clear();
  }, [token, currentServerId]);

  useEffect(() => {
    const normalizedToken = String(token || "").trim();
    const normalizedServerId = String(currentServerId || "").trim();
    if (!normalizedToken || !normalizedServerId) {
      setRoomUnreadBySlug({});
      return;
    }

    const roomList = allRooms
      .map((room) => ({ id: String(room.id || "").trim(), slug: String(room.slug || "").trim() }))
      .filter((room) => room.id && room.slug);

    if (roomList.length === 0) {
      setRoomUnreadBySlug({});
      return;
    }

    let cancelled = false;

    const load = async () => {
      const { settled, metrics } = await fetchRoomUnreadCounts(
        normalizedToken,
        roomList.map((room) => room.id),
        ROOM_UNREAD_MAX_CONCURRENCY,
        unreadCacheRef.current
      );

      if (cancelled) {
        return;
      }

      const next: Record<string, number> = {};
      settled.forEach((entry, index) => {
        const targetRoom = roomList[index];
        if (!targetRoom?.slug) {
          return;
        }

        if (entry.status === "fulfilled") {
          next[targetRoom.slug] = entry.value.unreadCount;
          return;
        }

        next[targetRoom.slug] = 0;
      });

      setRoomUnreadBySlug(next);

      const failedCount = settled.filter((item) => item.status === "rejected").length;
      pushLog(
        `room unread prefetch metrics: rooms=${metrics.requested} hit=${metrics.cacheHits} miss=${metrics.cacheMisses} durationMs=${metrics.durationMs} failed=${failedCount}`
      );
      pushSummaryMetrics("prefetch", prefetchAggregateRef, metrics, failedCount);
      if (failedCount > 0) {
        pushLog(`room unread prefetch partial failure: ${failedCount}/${settled.length}`);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [token, currentServerId, allRooms, setRoomUnreadBySlug, pushLog]);

  const roomIdBySlug = useMemo(() => {
    return allRooms.reduce<Record<string, string>>((acc, room) => {
      const roomId = String(room.id || "").trim();
      const roomSlug = String(room.slug || "").trim();
      if (!roomId || !roomSlug) {
        return acc;
      }

      acc[roomSlug] = roomId;
      return acc;
    }, {});
  }, [allRooms]);

  const refreshRoomIds = useMemo(() => {
    const activeSlug = String(chatRoomSlug || "").trim();
    const slugsToRefresh = new Set<string>();
    if (activeSlug) {
      slugsToRefresh.add(activeSlug);
    }

    Object.entries(roomUnreadBySlug).forEach(([slug, unreadCount]) => {
      if (Math.max(0, Number(unreadCount || 0)) > 0) {
        slugsToRefresh.add(String(slug || "").trim());
      }
    });

    return Array.from(slugsToRefresh)
      .map((slug) => roomIdBySlug[slug])
      .filter((roomId): roomId is string => Boolean(roomId));
  }, [chatRoomSlug, roomIdBySlug, roomUnreadBySlug]);

  useEffect(() => {
    const normalizedToken = String(token || "").trim();
    const normalizedServerId = String(currentServerId || "").trim();
    if (!normalizedToken || !normalizedServerId || refreshRoomIds.length === 0) {
      return;
    }

    let cancelled = false;
    let failureStreak = 0;
    let timerId: number | null = null;

    const nextDelayMs = () => {
      const baseDelay = Math.min(
        ROOM_UNREAD_BACKGROUND_MAX_REFRESH_MS,
        ROOM_UNREAD_BACKGROUND_REFRESH_MS * Math.pow(2, Math.max(0, failureStreak))
      );
      const jitter = Math.floor(Math.random() * (ROOM_UNREAD_BACKGROUND_JITTER_MS + 1));
      return baseDelay + jitter;
    };

    const refreshSelected = async () => {
      const { settled, metrics } = await fetchRoomUnreadCounts(
        normalizedToken,
        refreshRoomIds,
        ROOM_UNREAD_MAX_CONCURRENCY,
        unreadCacheRef.current
      );

      if (cancelled) {
        return;
      }

      const slugById = Object.entries(roomIdBySlug).reduce<Record<string, string>>((acc, [slug, id]) => {
        acc[id] = slug;
        return acc;
      }, {});

      setRoomUnreadBySlug((prev) => {
        const next = { ...prev };
        settled.forEach((entry) => {
          if (entry.status !== "fulfilled") {
            return;
          }

          const targetSlug = slugById[entry.value.roomId];
          if (!targetSlug) {
            return;
          }

          next[targetSlug] = entry.value.unreadCount;
        });
        return next;
      });

      const failedCount = settled.filter((entry) => entry.status === "rejected").length;
      const allFailed = failedCount === settled.length && settled.length > 0;
      failureStreak = allFailed ? failureStreak + 1 : 0;
      pushLog(
        `room unread refresh metrics: rooms=${metrics.requested} hit=${metrics.cacheHits} miss=${metrics.cacheMisses} durationMs=${metrics.durationMs} failed=${failedCount} backoffLevel=${failureStreak}`
      );
      pushSummaryMetrics("refresh", refreshAggregateRef, metrics, failedCount);
      if (failedCount > 0) {
        pushLog(`room unread background refresh failures: ${failedCount}/${settled.length}`);
      }

      if (!cancelled) {
        timerId = window.setTimeout(() => {
          void refreshSelected();
        }, nextDelayMs());
      }
    };

    void refreshSelected();

    return () => {
      cancelled = true;
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [token, currentServerId, refreshRoomIds, roomIdBySlug, setRoomUnreadBySlug, pushLog]);

  useEffect(() => {
    const normalizedSlug = String(chatRoomSlug || "").trim();
    if (!normalizedSlug) {
      return;
    }

    const unreadCount = chatTopics.reduce((sum, topic) => sum + Math.max(0, Number(topic.unreadCount || 0)), 0);
    const activeRoomId = roomIdBySlug[normalizedSlug];
    if (activeRoomId) {
      unreadCacheRef.current.set(activeRoomId, {
        unreadCount,
        ts: Date.now()
      });
    }

    setRoomUnreadBySlug((prev) => {
      if ((prev[normalizedSlug] || 0) === unreadCount) {
        return prev;
      }

      return {
        ...prev,
        [normalizedSlug]: unreadCount
      };
    });
  }, [chatRoomSlug, chatTopics, roomIdBySlug, setRoomUnreadBySlug]);

  const serverUnreadCount = useMemo(
    () => Object.values(roomUnreadBySlug).reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0),
    [roomUnreadBySlug]
  );

  return {
    serverUnreadCount
  };
}