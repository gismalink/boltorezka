import type { WebSocket } from "ws";
import { buildAckEnvelope, buildErrorEnvelope, buildNackEnvelope } from "../ws-protocol.js";

type RealtimeErrorCategory = "auth" | "permissions" | "topology" | "transport";

export function sendJson(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

export function normalizeRequestId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, 128);
}

export function sendAck(
  socket: WebSocket,
  requestId: string | null,
  eventType: string,
  meta: Record<string, unknown> = {}
) {
  if (!requestId) {
    return;
  }

  sendJson(socket, buildAckEnvelope(requestId, eventType, meta));
}

function resolveErrorCategory(code: string): RealtimeErrorCategory {
  if (code === "Forbidden" || code === "ChannelKicked") {
    return "permissions";
  }

  if (
    code === "RoomNotFound"
    || code === "NoActiveRoom"
    || code === "TargetNotInRoom"
    || code === "ChannelSessionMoved"
  ) {
    return "topology";
  }

  if (code === "MissingTicket" || code === "InvalidTicket") {
    return "auth";
  }

  return "transport";
}

export function sendNack(
  socket: WebSocket,
  requestId: string | null,
  eventType: string,
  code: string,
  message: string,
  meta: Record<string, unknown> = {}
) {
  const category = resolveErrorCategory(code);
  if (!requestId) {
    sendJson(socket, buildErrorEnvelope(code, message, category));
    return;
  }

  sendJson(socket, buildNackEnvelope(requestId, eventType, code, message, category, meta));
}
