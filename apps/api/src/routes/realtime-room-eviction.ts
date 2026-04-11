import type { WebSocket } from "ws";
import type { SocketState } from "../ws-protocol.types.ts";

type RoomEvictionDeps = {
  socketsByUserId: Map<string, Set<WebSocket>>;
  socketState: WeakMap<WebSocket, SocketState>;
  detachRoomSocket: (roomId: string, socket: WebSocket) => void;
  clearCanonicalMediaState: (roomId: string, userId: string) => void;
  sendJson: (socket: WebSocket, payload: unknown) => void;
  buildRoomLeftEnvelope: (roomId: string, roomSlug: string) => unknown;
  buildErrorEnvelope: (code: string, message: string, category: "auth" | "permissions" | "topology" | "transport") => unknown;
  broadcastRoom: (roomId: string, payload: unknown, excludedSocket?: WebSocket | null) => void;
  buildPresenceLeftEnvelope: (
    userId: string,
    userName: string,
    roomSlug: string,
    onlineCount: number
  ) => unknown;
  getRoomPresence: (roomId: string) => Array<{ userId: string; userName: string }>;
  broadcastAllRoomsPresence: () => void;
};

export function createRealtimeRoomEvictionHandler(deps: RoomEvictionDeps) {
  const {
    socketsByUserId,
    socketState,
    detachRoomSocket,
    clearCanonicalMediaState,
    sendJson,
    buildRoomLeftEnvelope,
    buildErrorEnvelope,
    broadcastRoom,
    buildPresenceLeftEnvelope,
    getRoomPresence,
    broadcastAllRoomsPresence
  } = deps;

  const evictUserFromOtherNonTextChannels = (userId: string, keepSocket: WebSocket) => {
    const userSockets = socketsByUserId.get(userId);
    if (!userSockets) {
      return;
    }

    let didChange = false;

    for (const socket of userSockets) {
      if (socket === keepSocket) {
        continue;
      }

      const state = socketState.get(socket);
      if (!state || !state.roomId || !state.roomSlug || !state.roomKind || state.roomKind === "text") {
        continue;
      }

      const previousRoomId = state.roomId;
      const previousRoomSlug = state.roomSlug;

      detachRoomSocket(previousRoomId, socket);
      clearCanonicalMediaState(previousRoomId, state.userId);
      state.roomId = null;
      state.roomSlug = null;
      state.roomKind = null;

      sendJson(socket, buildRoomLeftEnvelope(previousRoomId, previousRoomSlug));
      sendJson(
        socket,
        buildErrorEnvelope(
          "ChannelSessionMoved",
          "You were disconnected from this channel because your account joined another channel elsewhere",
          "topology"
        )
      );

      broadcastRoom(
        previousRoomId,
        buildPresenceLeftEnvelope(
          state.userId,
          state.userName,
          previousRoomSlug,
          getRoomPresence(previousRoomId).length
        ),
        socket
      );

      didChange = true;
    }

    if (didChange) {
      broadcastAllRoomsPresence();
    }
  };

  return {
    evictUserFromOtherNonTextChannels
  };
}
