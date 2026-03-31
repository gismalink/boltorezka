import type { WebSocket } from "ws";

type PresenceMemberLike = {
  userId: string;
  userName: string;
};

type BuildRealtimeScreenShareStateStoreArgs = {
  getRoomPresence: (roomId: string) => PresenceMemberLike[];
  broadcastRoom: (roomId: string, payload: unknown, skipSocket?: WebSocket | null) => void;
};

export function buildRealtimeScreenShareStateStore({
  getRoomPresence,
  broadcastRoom
}: BuildRealtimeScreenShareStateStoreArgs) {
  const screenShareOwnerByRoomId = new Map<string, string>();

  const buildScreenShareStateEnvelope = (roomId: string, roomSlug: string | null) => {
    const ownerUserId = screenShareOwnerByRoomId.get(roomId) || null;
    const ownerUserName = ownerUserId
      ? (getRoomPresence(roomId).find((item) => item.userId === ownerUserId)?.userName || null)
      : null;

    return {
      type: "screen.share.state",
      payload: {
        roomId,
        roomSlug,
        active: Boolean(ownerUserId),
        ownerUserId,
        ownerUserName,
        ts: new Date().toISOString()
      }
    };
  };

  const clearRoomScreenShareOwnerIfMatches = (roomId: string, userId: string, roomSlug: string | null) => {
    const currentOwnerUserId = screenShareOwnerByRoomId.get(roomId) || null;
    if (!currentOwnerUserId || currentOwnerUserId !== userId) {
      return;
    }

    screenShareOwnerByRoomId.delete(roomId);
    broadcastRoom(roomId, buildScreenShareStateEnvelope(roomId, roomSlug));
  };

  return {
    screenShareOwnerByRoomId,
    buildScreenShareStateEnvelope,
    clearRoomScreenShareOwnerIfMatches
  };
}