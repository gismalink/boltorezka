import type { WebSocket } from "ws";

type SocketCorrelationState = {
  roomId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
};

export type RelayOutcome = {
  ok: boolean;
  relayedCount: number;
};

export function relayToTargetOrRoom(params: {
  senderSocket: WebSocket;
  roomId: string;
  targetUserId: string | null;
  relayEnvelope: unknown;
  getUserRoomSockets: (userId: string, roomId: string) => WebSocket[];
  socketsByRoomId: Map<string, Set<WebSocket>>;
  sendJson: (socket: WebSocket, payload: unknown) => void;
}): RelayOutcome {
  const {
    senderSocket,
    roomId,
    targetUserId,
    relayEnvelope,
    getUserRoomSockets,
    socketsByRoomId,
    sendJson
  } = params;

  let relayedCount = 0;

  if (targetUserId) {
    const targetSockets = getUserRoomSockets(targetUserId, roomId);
    for (const targetSocket of targetSockets) {
      if (targetSocket === senderSocket) {
        continue;
      }

      sendJson(targetSocket, relayEnvelope);
      relayedCount += 1;
    }

    if (relayedCount === 0) {
      return { ok: false, relayedCount };
    }

    return { ok: true, relayedCount };
  }

  const roomSockets = socketsByRoomId.get(roomId) || new Set<WebSocket>();
  for (const roomSocket of roomSockets) {
    if (roomSocket === senderSocket) {
      continue;
    }

    sendJson(roomSocket, relayEnvelope);
    relayedCount += 1;
  }

  return { ok: true, relayedCount };
}

export function buildErrorCorrelationMeta(
  socket: WebSocket,
  socketState: WeakMap<WebSocket, SocketCorrelationState>,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const state = socketState.get(socket);
  return {
    roomId: state?.roomId ?? null,
    userId: state?.userId ?? null,
    sessionId: state?.sessionId ?? null,
    ...extra
  };
}
