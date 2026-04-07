import type { WebSocket } from "ws";
import type { WsIncomingPayload } from "../ws-protocol.types.ts";
import {
  handleChatDelete,
  handleChatEdit,
  handleChatPin,
  handleChatReactionAdd,
  handleChatReactionRemove,
  handleChatSend,
  handleChatTyping,
  handleChatUnpin
} from "./realtime-chat.js";

type SocketState = {
  sessionId: string;
  userId: string;
  userName: string;
  roomId: string | null;
  roomSlug: string | null;
};

type ChatEventDeps = {
  normalizeRequestId: (value: unknown) => string | null;
  getPayloadString: (payload: WsIncomingPayload | undefined, key: string, maxLength?: number) => string | null;
  sendNoActiveRoomNack: (socket: WebSocket, requestId: string | null, eventType: string, meta?: Record<string, unknown>) => void;
  sendValidationNack: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    message: string,
    meta?: Record<string, unknown>
  ) => void;
  sendForbiddenNack: (socket: WebSocket, requestId: string | null, eventType: string, message?: string) => void;
  sendNack: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    code: string,
    message: string,
    meta?: Record<string, unknown>
  ) => void;
  incrementMetric: (name: string) => Promise<void>;
  sendJson: (socket: WebSocket, payload: unknown) => void;
  sendAckWithMetrics: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta?: Record<string, unknown>,
    additionalMetrics?: string[]
  ) => void;
  broadcastRoom: (roomId: string, envelope: unknown, except?: WebSocket) => void;
  buildChatMessageEnvelope: (...args: any[]) => unknown;
  buildChatEditedEnvelope: (...args: any[]) => unknown;
  buildChatDeletedEnvelope: (...args: any[]) => unknown;
  buildChatTypingEnvelope: (...args: any[]) => unknown;
  redisGet: (key: string) => Promise<string | null>;
  redisDel: (key: string) => Promise<number>;
  redisSetEx: (key: string, seconds: number, value: string) => Promise<string | null>;
  dbQuery: <T = unknown>(queryText: string, values?: unknown[]) => Promise<{ rowCount: number | null; rows: T[] }>;
};

export function createRealtimeChatEventHandlers(deps: ChatEventDeps) {
  const {
    normalizeRequestId,
    getPayloadString,
    sendNoActiveRoomNack,
    sendValidationNack,
    sendForbiddenNack,
    sendNack,
    incrementMetric,
    sendJson,
    sendAckWithMetrics,
    broadcastRoom,
    buildChatMessageEnvelope,
    buildChatEditedEnvelope,
    buildChatDeletedEnvelope,
    buildChatTypingEnvelope,
    redisGet,
    redisDel,
    redisSetEx,
    dbQuery
  } = deps;

  const buildChatBaseParams = (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string
  ) => ({
    connection,
    state,
    payload,
    requestId,
    eventType,
    normalizeRequestId,
    getPayloadString,
    sendNoActiveRoomNack,
    sendValidationNack,
    sendForbiddenNack,
    sendNack,
    incrementMetric,
    sendJson,
    sendAckWithMetrics,
    broadcastRoom: (roomId: string, payloadOut: unknown, excludedSocket?: WebSocket | null) => {
      broadcastRoom(roomId, payloadOut, excludedSocket ?? undefined);
    },
    buildChatMessageEnvelope,
    buildChatEditedEnvelope,
    buildChatDeletedEnvelope,
    buildChatTypingEnvelope,
    redisGet,
    redisDel,
    redisSetEx,
    dbQuery
  });

  const handleChatSendEvent = async (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string,
    incomingIdempotencyKey: string | undefined
  ) => {
    await handleChatSend({
      ...buildChatBaseParams(connection, state, payload, requestId, eventType),
      incomingIdempotencyKey
    });
  };

  const handleChatEditEvent = async (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string
  ) => {
    await handleChatEdit(buildChatBaseParams(connection, state, payload, requestId, eventType));
  };

  const handleChatDeleteEvent = async (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string
  ) => {
    await handleChatDelete(buildChatBaseParams(connection, state, payload, requestId, eventType));
  };

  const handleChatTypingEvent = async (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string
  ) => {
    await handleChatTyping(buildChatBaseParams(connection, state, payload, requestId, eventType));
  };

  const handleChatPinEvent = async (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string
  ) => {
    await handleChatPin(buildChatBaseParams(connection, state, payload, requestId, eventType));
  };

  const handleChatUnpinEvent = async (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string
  ) => {
    await handleChatUnpin(buildChatBaseParams(connection, state, payload, requestId, eventType));
  };

  const handleChatReactionAddEvent = async (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string
  ) => {
    await handleChatReactionAdd(buildChatBaseParams(connection, state, payload, requestId, eventType));
  };

  const handleChatReactionRemoveEvent = async (
    connection: WebSocket,
    state: SocketState,
    payload: WsIncomingPayload | undefined,
    requestId: string | null,
    eventType: string
  ) => {
    await handleChatReactionRemove(buildChatBaseParams(connection, state, payload, requestId, eventType));
  };

  return {
    handleChatSendEvent,
    handleChatEditEvent,
    handleChatDeleteEvent,
    handleChatPinEvent,
    handleChatUnpinEvent,
    handleChatReactionAddEvent,
    handleChatReactionRemoveEvent,
    handleChatTypingEvent
  };
}
