import { buildErrorEnvelope } from "../ws-protocol.js";
import { sendJson, sendNack } from "./realtime-io.js";
import { buildErrorCorrelationMeta } from "./realtime-relay.js";
import type { WebSocket } from "ws";

type SocketStateLike = {
  sessionId: string;
  userId: string;
  userName: string;
  roomId: string | null;
  roomSlug: string | null;
  roomKind: "text" | "text_voice" | "text_voice_video" | null;
};

type CreateRealtimeNackSendersArgs = {
  socketState: WeakMap<WebSocket, SocketStateLike>;
  incrementMetric: (name: string) => Promise<unknown>;
};

export function createRealtimeNackSenders({
  socketState,
  incrementMetric
}: CreateRealtimeNackSendersArgs) {
  const sendNoActiveRoomNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta: Record<string, unknown> = {}
  ) => {
    sendNack(
      socket,
      requestId,
      eventType,
      "NoActiveRoom",
      "Join a room first",
      buildErrorCorrelationMeta(socket, socketState, meta)
    );
    void incrementMetric("nack_sent");
  };

  const sendTargetNotInRoomNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta: Record<string, unknown> = {}
  ) => {
    sendNack(
      socket,
      requestId,
      eventType,
      "TargetNotInRoom",
      "Target user is offline or not in this room",
      buildErrorCorrelationMeta(socket, socketState, meta)
    );
    void incrementMetric("nack_sent");
  };

  const sendValidationNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    message: string,
    meta: Record<string, unknown> = {}
  ) => {
    sendNack(
      socket,
      requestId,
      eventType,
      "ValidationError",
      message,
      buildErrorCorrelationMeta(socket, socketState, meta)
    );
    void incrementMetric("nack_sent");
  };

  const sendInvalidEnvelopeError = (socket: WebSocket) => {
    sendJson(socket, buildErrorEnvelope("ValidationError", "Invalid ws envelope", "transport"));
    void incrementMetric("nack_sent");
  };

  const sendUnknownEventNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string
  ) => {
    sendNack(socket, requestId, eventType, "UnknownEvent", "Unsupported event type");
    void incrementMetric("nack_sent");
  };

  return {
    sendNoActiveRoomNack,
    sendTargetNotInRoomNack,
    sendValidationNack,
    sendInvalidEnvelopeError,
    sendUnknownEventNack
  };
}