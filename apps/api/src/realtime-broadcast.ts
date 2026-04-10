import type { WebSocket } from "ws";

const activeSockets = new Set<WebSocket>();
const socketsByUserId = new Map<string, Set<WebSocket>>();
const userIdBySocket = new WeakMap<WebSocket, string>();
let realtimeSequence = 0;
const realtimeScopeSequenceByKey = new Map<string, number>();

function asTrimmedString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function detectRealtimeScope(payload: Record<string, unknown>): string {
  const eventType = asTrimmedString(payload.type);

  if (!eventType.startsWith("chat.")) {
    return eventType ? `stream:${eventType}` : "stream:unknown";
  }

  const payloadRecord = payload.payload && typeof payload.payload === "object"
    ? payload.payload as Record<string, unknown>
    : null;

  const roomId = asTrimmedString(
    payloadRecord?.roomId
    || payloadRecord?.room_id
    || payload.roomId
    || payload.room_id
  );
  const topicId = asTrimmedString(
    payloadRecord?.topicId
    || payloadRecord?.topic_id
    || payload.topicId
    || payload.topic_id
  );

  if (roomId && topicId) {
    return `topic:${roomId}:${topicId}`;
  }
  if (roomId) {
    return `room:${roomId}`;
  }

  return "chat:global";
}

function stampRealtimeSequence(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const envelope = payload as Record<string, unknown>;
  const existing = Number(envelope.realtimeSeq ?? envelope.realtime_seq);
  if (Number.isFinite(existing) && existing > 0) {
    return payload;
  }

  const scope = detectRealtimeScope(envelope);
  const scopeCurrent = Number(realtimeScopeSequenceByKey.get(scope) || 0);
  const scopeNext = scopeCurrent + 1;

  realtimeScopeSequenceByKey.set(scope, scopeNext);
  realtimeSequence += 1;

  return {
    ...envelope,
    realtimeSeq: realtimeSequence,
    realtimeScope: scope,
    realtimeScopeSeq: scopeNext
  };
}

function sendJson(socket: WebSocket, payload: unknown) {
  if (socket.readyState !== socket.OPEN) {
    activeSockets.delete(socket);
    return;
  }

  socket.send(JSON.stringify(stampRealtimeSequence(payload)));
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

export function broadcastRealtimeEnvelopeToUser(userId: string, payload: unknown, excludedSocket: WebSocket | null = null) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return;
  }

  const userSockets = socketsByUserId.get(normalizedUserId);
  if (!userSockets || userSockets.size === 0) {
    return;
  }

  for (const socket of userSockets) {
    if (socket === excludedSocket) {
      continue;
    }

    sendJson(socket, payload);
  }
}
