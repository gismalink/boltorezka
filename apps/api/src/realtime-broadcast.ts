import type { WebSocket } from "ws";

const activeSockets = new Set<WebSocket>();
const socketsByUserId = new Map<string, Set<WebSocket>>();
const userIdBySocket = new WeakMap<WebSocket, string>();

function sendJson(socket: WebSocket, payload: unknown) {
  if (socket.readyState !== socket.OPEN) {
    activeSockets.delete(socket);
    return;
  }

  socket.send(JSON.stringify(payload));
}

export function registerRealtimeSocket(socket: WebSocket, userId?: string) {
  activeSockets.add(socket);

  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return;
  }

  userIdBySocket.set(socket, normalizedUserId);
  const userSockets = socketsByUserId.get(normalizedUserId) || new Set<WebSocket>();
  userSockets.add(socket);
  socketsByUserId.set(normalizedUserId, userSockets);
}

export function unregisterRealtimeSocket(socket: WebSocket) {
  activeSockets.delete(socket);

  const userId = String(userIdBySocket.get(socket) || "").trim();
  if (!userId) {
    return;
  }

  const userSockets = socketsByUserId.get(userId);
  if (!userSockets) {
    return;
  }

  userSockets.delete(socket);
  if (userSockets.size === 0) {
    socketsByUserId.delete(userId);
  }
}

export function disconnectRealtimeSocketsForUser(userId: string, code = 4009, reason = "Server membership changed") {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return 0;
  }

  const userSockets = socketsByUserId.get(normalizedUserId);
  if (!userSockets || userSockets.size === 0) {
    return 0;
  }

  let disconnected = 0;
  for (const socket of userSockets) {
    try {
      socket.close(code, reason);
      disconnected += 1;
    } catch {
      continue;
    }
  }

  return disconnected;
}

export function broadcastRealtimeEnvelope(payload: unknown, excludedSocket: WebSocket | null = null) {
  for (const socket of activeSockets) {
    if (socket === excludedSocket) {
      continue;
    }

    sendJson(socket, payload);
  }
}
