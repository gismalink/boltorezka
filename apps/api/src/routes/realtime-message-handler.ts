import type { RawData, WebSocket } from "ws";
import {
  asKnownWsIncomingEnvelope,
  buildErrorEnvelope,
  buildPongEnvelope,
  parseWsIncomingEnvelope
} from "../ws-protocol.js";
import type { WsIncomingPayload } from "../ws-protocol.types.ts";

type SocketState = {
  sessionId: string;
  userId: string;
  userName: string;
  roomId: string | null;
  roomSlug: string | null;
  roomKind: "text" | "text_voice" | "text_voice_video" | null;
};

type RealtimeMessageHandlerDeps = {
  socketState: WeakMap<WebSocket, SocketState>;
  normalizeRequestId: (value: unknown) => string | null;
  sendJson: (socket: WebSocket, payload: unknown) => void;
  sendInvalidEnvelopeError: (socket: WebSocket) => void;
  sendUnknownEventNack: (socket: WebSocket, requestId: string | null, eventType: string) => void;
  sendAckWithMetrics: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta?: Record<string, unknown>,
    additionalMetrics?: string[]
  ) => void;
  handleRoomJoinEvent: (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string
  ) => Promise<void>;
  handleRoomLeaveEvent: (
    connection: WebSocket,
    state: SocketState,
    requestId: string | null,
    eventType: string
  ) => void;
  handleRoomKickEvent: (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string
  ) => Promise<void>;
  handleRoomMoveMemberEvent: (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string
  ) => Promise<void>;
  handleChatSendEvent: (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string,
    incomingIdempotencyKey: string | undefined
  ) => Promise<void>;
  handleChatEditEvent: (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string
  ) => Promise<void>;
  handleChatDeleteEvent: (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string
  ) => Promise<void>;
  handleChatTypingEvent: (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string
  ) => Promise<void>;
  handleScreenShareStartEvent: (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string,
    knownMessageType: "screen.share.start"
  ) => void;
  handleScreenShareStopEvent: (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string,
    knownMessageType: "screen.share.stop"
  ) => void;
  handleCallMicStateEvent: (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string,
    knownMessageType: "call.mic_state"
  ) => Promise<void>;
  handleCallSignalingEvent: (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string,
    knownMessageType: "call.offer" | "call.answer" | "call.ice"
  ) => Promise<void>;
  handleCallVideoStateEvent: (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string,
    knownMessageType: "call.video_state"
  ) => Promise<void>;
  logWsError: (error: unknown) => void;
};

export function createRealtimeMessageHandler(deps: RealtimeMessageHandlerDeps) {
  const {
    socketState,
    normalizeRequestId,
    sendJson,
    sendInvalidEnvelopeError,
    sendUnknownEventNack,
    sendAckWithMetrics,
    handleRoomJoinEvent,
    handleRoomLeaveEvent,
    handleRoomKickEvent,
    handleRoomMoveMemberEvent,
    handleChatSendEvent,
    handleChatEditEvent,
    handleChatDeleteEvent,
    handleChatTypingEvent,
    handleScreenShareStartEvent,
    handleScreenShareStopEvent,
    handleCallMicStateEvent,
    handleCallSignalingEvent,
    handleCallVideoStateEvent,
    logWsError
  } = deps;

  const handleMessage = async (connection: WebSocket, raw: RawData) => {
    try {
      const message = parseWsIncomingEnvelope(raw);
      if (!message) {
        sendInvalidEnvelopeError(connection);
        return;
      }

      const state = socketState.get(connection);
      const requestId = normalizeRequestId(message.requestId);
      const eventType = message.type;
      const payload = message.payload;
      const knownMessage = asKnownWsIncomingEnvelope(message);

      if (!state) {
        return;
      }

      if (!knownMessage) {
        sendUnknownEventNack(connection, requestId, eventType);
        return;
      }

      switch (knownMessage.type) {
        case "ping": {
          sendJson(connection, buildPongEnvelope());
          sendAckWithMetrics(connection, requestId, eventType);
          return;
        }

        case "room.join": {
          await handleRoomJoinEvent(connection, state, payload, requestId, eventType);
          return;
        }

        case "room.leave": {
          handleRoomLeaveEvent(connection, state, requestId, eventType);
          return;
        }

        case "room.kick": {
          await handleRoomKickEvent(connection, state, payload, requestId, eventType);
          return;
        }

        case "room.move_member": {
          await handleRoomMoveMemberEvent(connection, state, payload, requestId, eventType);
          return;
        }

        case "chat.send": {
          await handleChatSendEvent(connection, state, payload, requestId, eventType, knownMessage.idempotencyKey);
          return;
        }

        case "chat.edit": {
          await handleChatEditEvent(connection, state, payload, requestId, eventType);
          return;
        }

        case "chat.delete": {
          await handleChatDeleteEvent(connection, state, payload, requestId, eventType);
          return;
        }

        case "chat.typing": {
          await handleChatTypingEvent(connection, state, payload, requestId, eventType);
          return;
        }

        case "screen.share.start": {
          handleScreenShareStartEvent(connection, state, payload, requestId, eventType, knownMessage.type);
          return;
        }

        case "screen.share.stop": {
          handleScreenShareStopEvent(connection, state, payload, requestId, eventType, knownMessage.type);
          return;
        }

        case "call.mic_state": {
          await handleCallMicStateEvent(connection, state, payload, requestId, eventType, knownMessage.type);
          return;
        }

        case "call.offer":
        case "call.answer":
        case "call.ice": {
          await handleCallSignalingEvent(connection, state, payload, requestId, eventType, knownMessage.type);
          return;
        }

        case "call.video_state": {
          await handleCallVideoStateEvent(connection, state, payload, requestId, eventType, knownMessage.type);
          return;
        }
      }
    } catch (error) {
      logWsError(error);
      sendJson(connection, buildErrorEnvelope("ServerError", "Failed to process event"));
    }
  };

  return {
    handleMessage
  };
}
