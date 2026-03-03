import type { WebSocket } from "ws";

const activeSockets = new Set<WebSocket>();

function sendJson(socket: WebSocket, payload: unknown) {
  if (socket.readyState !== socket.OPEN) {
    activeSockets.delete(socket);
    return;
  }

  socket.send(JSON.stringify(payload));
}

export function registerRealtimeSocket(socket: WebSocket) {
  activeSockets.add(socket);
}

export function unregisterRealtimeSocket(socket: WebSocket) {
  activeSockets.delete(socket);
}

export function broadcastRealtimeEnvelope(payload: unknown, excludedSocket: WebSocket | null = null) {
  for (const socket of activeSockets) {
    if (socket === excludedSocket) {
      continue;
    }

    sendJson(socket, payload);
  }
}
