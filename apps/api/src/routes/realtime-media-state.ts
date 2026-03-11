type CanonicalMediaState = {
  muted: boolean;
  speaking: boolean;
  audioMuted: boolean;
  localVideoEnabled: boolean;
  lastUpdatedAtMs: number;
};

type RoomPresenceUser = {
  userId: string;
  userName: string;
};

const CALL_RECONNECT_WINDOW_MS = 90000;

export function createRealtimeMediaStateStore(getRoomPresence: (roomId: string) => RoomPresenceUser[]) {
  const mediaStateByRoomUserKey = new Map<string, CanonicalMediaState>();
  const recentRoomDetachByRoomUserKey = new Map<string, number>();

  const mediaStateKey = (roomId: string, userId: string) => `${roomId}:${userId}`;

  const setCanonicalMediaState = (
    roomId: string,
    userId: string,
    patch: Partial<CanonicalMediaState>
  ) => {
    const key = mediaStateKey(roomId, userId);
    const current = mediaStateByRoomUserKey.get(key) || {
      muted: false,
      speaking: false,
      audioMuted: false,
      localVideoEnabled: false,
      lastUpdatedAtMs: Date.now()
    };

    mediaStateByRoomUserKey.set(key, {
      ...current,
      ...patch,
      lastUpdatedAtMs: Date.now()
    });
  };

  const clearCanonicalMediaState = (roomId: string, userId: string) => {
    mediaStateByRoomUserKey.delete(mediaStateKey(roomId, userId));
  };

  const markRecentRoomDetach = (roomId: string, userId: string) => {
    const key = mediaStateKey(roomId, userId);
    recentRoomDetachByRoomUserKey.set(key, Date.now());

    if (recentRoomDetachByRoomUserKey.size > 6000) {
      const threshold = Date.now() - CALL_RECONNECT_WINDOW_MS;
      for (const [storedKey, at] of recentRoomDetachByRoomUserKey.entries()) {
        if (at < threshold) {
          recentRoomDetachByRoomUserKey.delete(storedKey);
        }
      }
    }
  };

  const consumeRecentReconnectMark = (roomId: string, userId: string): boolean => {
    const key = mediaStateKey(roomId, userId);
    const at = recentRoomDetachByRoomUserKey.get(key) || 0;
    if (!at) {
      return false;
    }

    recentRoomDetachByRoomUserKey.delete(key);
    return Date.now() - at <= CALL_RECONNECT_WINDOW_MS;
  };

  const getCallInitialStateParticipants = (roomId: string) => {
    const presenceByUserId = new Map<string, string>();
    for (const user of getRoomPresence(roomId)) {
      presenceByUserId.set(user.userId, user.userName);
    }

    const participants: Array<{
      userId: string;
      userName: string;
      mic: { muted: boolean; speaking: boolean; audioMuted: boolean };
      video: { localVideoEnabled: boolean };
    }> = [];

    const prefix = `${roomId}:`;
    for (const [key, state] of mediaStateByRoomUserKey.entries()) {
      if (!key.startsWith(prefix)) {
        continue;
      }

      const userId = key.slice(prefix.length);
      const userName = presenceByUserId.get(userId);
      if (!userName) {
        continue;
      }

      participants.push({
        userId,
        userName,
        mic: {
          muted: state.muted,
          speaking: state.speaking,
          audioMuted: state.audioMuted
        },
        video: {
          localVideoEnabled: state.localVideoEnabled
        }
      });
    }

    return participants;
  };

  const getCallInitialStateLagStats = (roomId: string): { count: number; totalLagMs: number } => {
    const presenceByUserId = new Set(getRoomPresence(roomId).map((item) => item.userId));
    const prefix = `${roomId}:`;
    const now = Date.now();
    let count = 0;
    let totalLagMs = 0;

    for (const [key, state] of mediaStateByRoomUserKey.entries()) {
      if (!key.startsWith(prefix)) {
        continue;
      }

      const userId = key.slice(prefix.length);
      if (!presenceByUserId.has(userId)) {
        continue;
      }

      const lagMs = Math.max(0, now - Number(state.lastUpdatedAtMs || 0));
      totalLagMs += lagMs;
      count += 1;
    }

    return { count, totalLagMs };
  };

  return {
    setCanonicalMediaState,
    clearCanonicalMediaState,
    markRecentRoomDetach,
    consumeRecentReconnectMark,
    getCallInitialStateParticipants,
    getCallInitialStateLagStats
  };
}
