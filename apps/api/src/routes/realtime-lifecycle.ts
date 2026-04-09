import type { WebSocket } from "ws";

type SocketState = {
  userId: string;
  userName: string;
  currentServerId: string | null;
  roomId: string | null;
  roomSlug: string | null;
};

export async function initializeRealtimeConnection(params: {
  connection: WebSocket;
  userId: string;
  userName: string;
  appBuildSha: string;
  currentServerId: string | null;
  socketState: WeakMap<WebSocket, any>;
  attachUserSocket: (userId: string, socket: WebSocket) => void;
  registerRealtimeSocket: (socket: WebSocket, userId?: string) => void;
  redisHSet: (key: string, value: Record<string, string>) => Promise<unknown>;
  redisExpire: (key: string, seconds: number) => Promise<unknown>;
  sendJson: (socket: WebSocket, payload: unknown) => void;
  buildServerReadyEnvelope: (userId: string, userName: string, appBuildSha: string | null) => unknown;
  buildRoomsPresenceEnvelope: (...args: any[]) => unknown;
  getAllRoomsPresence: (forUserId: string | null, forServerId?: string | null) => unknown;
  broadcastAllRoomsPresence: () => void;
}) {
  const {
    connection,
    userId,
    userName,
    appBuildSha,
    currentServerId,
    socketState,
    attachUserSocket,
    registerRealtimeSocket,
    redisHSet,
    redisExpire,
    sendJson,
    buildServerReadyEnvelope,
    buildRoomsPresenceEnvelope,
    getAllRoomsPresence,
    broadcastAllRoomsPresence
  } = params;

  socketState.set(connection, {
    sessionId: crypto.randomUUID(),
    userId,
    userName,
    currentServerId,
    roomId: null,
    roomSlug: null,
    roomKind: null
  });

  attachUserSocket(userId, connection);
  registerRealtimeSocket(connection, userId);

  await redisHSet(`presence:user:${userId}`, {
    online: "1",
    updatedAt: new Date().toISOString()
  });
  await redisExpire(`presence:user:${userId}`, 120);

  sendJson(connection, buildServerReadyEnvelope(userId, userName, appBuildSha));
  sendJson(connection, buildRoomsPresenceEnvelope(getAllRoomsPresence(userId, currentServerId)));
  broadcastAllRoomsPresence();
}

export async function closeRealtimeConnection(params: {
  connection: WebSocket;
  socketState: WeakMap<WebSocket, SocketState>;
  unregisterRealtimeSocket: (socket: WebSocket) => void;
  detachUserSocket: (userId: string, socket: WebSocket) => void;
  markRecentRoomDetach: (roomId: string, userId: string) => void;
  detachRoomSocket: (roomId: string, socket: WebSocket) => void;
  clearCanonicalMediaState: (roomId: string, userId: string) => void;
  clearRoomScreenShareOwnerIfMatches: (roomId: string, userId: string, roomSlug: string | null) => void;
  broadcastRoom: (roomId: string, payload: unknown, excludedSocket?: WebSocket | null) => void;
  buildPresenceLeftEnvelope: (...args: any[]) => unknown;
  getRoomPresence: (roomId: string) => Array<{ userId: string; userName: string }>;
  broadcastAllRoomsPresence: () => void;
  socketsByUserId: Map<string, Set<WebSocket>>;
  redisHSet: (key: string, value: Record<string, string>) => Promise<unknown>;
  redisExpire: (key: string, seconds: number) => Promise<unknown>;
  updateUserLastSeenAt: (userId: string, isoTs: string) => Promise<unknown>;
}) {
  const {
    connection,
    socketState,
    unregisterRealtimeSocket,
    detachUserSocket,
    markRecentRoomDetach,
    detachRoomSocket,
    clearCanonicalMediaState,
    clearRoomScreenShareOwnerIfMatches,
    broadcastRoom,
    buildPresenceLeftEnvelope,
    getRoomPresence,
    broadcastAllRoomsPresence,
    socketsByUserId,
    redisHSet,
    redisExpire,
    updateUserLastSeenAt
  } = params;

  const state = socketState.get(connection);
  unregisterRealtimeSocket(connection);
  if (!state) {
    return;
  }

  detachUserSocket(state.userId, connection);

  if (state.roomId) {
    markRecentRoomDetach(state.roomId, state.userId);
    detachRoomSocket(state.roomId, connection);
    clearCanonicalMediaState(state.roomId, state.userId);
    clearRoomScreenShareOwnerIfMatches(state.roomId, state.userId, state.roomSlug);
    broadcastRoom(
      state.roomId,
      buildPresenceLeftEnvelope(
        state.userId,
        state.userName,
        state.roomSlug,
        getRoomPresence(state.roomId).length
      )
    );
  }

  broadcastAllRoomsPresence();

  const userSockets = socketsByUserId.get(state.userId);
  if (!userSockets || userSockets.size === 0) {
    const lastSeenAtIso = new Date().toISOString();

    await updateUserLastSeenAt(state.userId, lastSeenAtIso);

    await redisHSet(`presence:user:${state.userId}`, {
      online: "0",
      updatedAt: lastSeenAtIso
    });
    await redisExpire(`presence:user:${state.userId}`, 120);
  }
}
