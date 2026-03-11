import type { WebSocket } from "ws";

type RoomSocketState = {
  userId: string;
  userName: string;
  roomId: string | null;
  roomSlug: string | null;
};

type RoomPresenceUser = {
  userId: string;
  userName: string;
};

type MediaTopology = "livekit";

type RoomsPresenceEnvelopeBuilder = (
  rooms: Array<{
    roomId: string;
    roomSlug: string;
    users: Array<{ userId: string; userName: string }>;
    mediaTopology: MediaTopology;
  }>
) => unknown;

export function createRealtimeRoomStateStore(params: {
  socketState: WeakMap<WebSocket, RoomSocketState>;
  sendJson: (socket: WebSocket, payload: unknown) => void;
  buildRoomsPresenceEnvelope: RoomsPresenceEnvelopeBuilder;
  resolveRoomMediaTopology: (roomSlug: string, userId: string | null) => MediaTopology;
}) {
  const {
    socketState,
    sendJson,
    buildRoomsPresenceEnvelope,
    resolveRoomMediaTopology
  } = params;

  const socketsByUserId = new Map<string, Set<WebSocket>>();
  const socketsByRoomId = new Map<string, Set<WebSocket>>();

  const attachUserSocket = (userId: string, socket: WebSocket) => {
    const userSockets = socketsByUserId.get(userId) || new Set();
    userSockets.add(socket);
    socketsByUserId.set(userId, userSockets);
  };

  const detachUserSocket = (userId: string, socket: WebSocket) => {
    const userSockets = socketsByUserId.get(userId);
    if (!userSockets) {
      return;
    }
    userSockets.delete(socket);
    if (userSockets.size === 0) {
      socketsByUserId.delete(userId);
    }
  };

  const attachRoomSocket = (roomId: string, socket: WebSocket) => {
    const roomSockets = socketsByRoomId.get(roomId) || new Set();
    roomSockets.add(socket);
    socketsByRoomId.set(roomId, roomSockets);
  };

  const detachRoomSocket = (roomId: string, socket: WebSocket) => {
    const roomSockets = socketsByRoomId.get(roomId);
    if (!roomSockets) {
      return;
    }
    roomSockets.delete(socket);
    if (roomSockets.size === 0) {
      socketsByRoomId.delete(roomId);
    }
  };

  const broadcastRoom = (roomId: string, payload: unknown, excludedSocket: WebSocket | null = null) => {
    const roomSockets = socketsByRoomId.get(roomId);
    if (!roomSockets) {
      return;
    }

    for (const socket of roomSockets) {
      if (socket !== excludedSocket) {
        sendJson(socket, payload);
      }
    }
  };

  const getRoomPresence = (roomId: string): RoomPresenceUser[] => {
    const roomSockets = socketsByRoomId.get(roomId);
    if (!roomSockets) {
      return [];
    }

    const seen = new Set<string>();
    const users: RoomPresenceUser[] = [];

    for (const socket of roomSockets) {
      const state = socketState.get(socket);
      if (!state || seen.has(state.userId)) {
        continue;
      }

      seen.add(state.userId);
      users.push({ userId: state.userId, userName: state.userName });
    }

    return users;
  };

  const getAllRoomsPresence = (forUserId: string | null = null) => {
    const result: Array<{
      roomId: string;
      roomSlug: string;
      users: Array<{ userId: string; userName: string }>;
      mediaTopology: MediaTopology;
    }> = [];

    for (const [roomId, roomSockets] of socketsByRoomId.entries()) {
      let roomSlug: string | null = null;
      for (const socket of roomSockets) {
        const state = socketState.get(socket);
        if (state?.roomSlug) {
          roomSlug = state.roomSlug;
          break;
        }
      }

      if (!roomSlug) {
        continue;
      }

      result.push({
        roomId,
        roomSlug,
        users: getRoomPresence(roomId),
        mediaTopology: resolveRoomMediaTopology(roomSlug, forUserId)
      });
    }

    return result;
  };

  const broadcastAllRoomsPresence = () => {
    const seen = new Set<WebSocket>();

    for (const userSockets of socketsByUserId.values()) {
      for (const socket of userSockets) {
        if (seen.has(socket)) {
          continue;
        }
        seen.add(socket);
        const state = socketState.get(socket);
        const envelope = buildRoomsPresenceEnvelope(getAllRoomsPresence(state?.userId || null));
        sendJson(socket, envelope);
      }
    }
  };

  const getUserRoomSockets = (userId: string, roomId: string): WebSocket[] => {
    const userSockets = socketsByUserId.get(userId);
    if (!userSockets) {
      return [];
    }

    const result: WebSocket[] = [];
    for (const socket of userSockets) {
      const state = socketState.get(socket);
      if (!state) {
        continue;
      }
      if (state.roomId === roomId) {
        result.push(socket);
      }
    }

    return result;
  };

  return {
    socketsByUserId,
    socketsByRoomId,
    attachUserSocket,
    detachUserSocket,
    attachRoomSocket,
    detachRoomSocket,
    broadcastRoom,
    getRoomPresence,
    getAllRoomsPresence,
    broadcastAllRoomsPresence,
    getUserRoomSockets
  };
}
