/**
 * Типы для WebSocket chat handlers.
 *
 * Вынесены из realtime-chat.ts для уменьшения объёма route-файла.
 */
import type { WebSocket } from "ws";
import type { SocketState } from "../ws-protocol.types.ts";

export type TopicMessageOps = {
  createTopicMessage: (input: {
    topicId: string;
    userId: string;
    text: string;
  }) => Promise<{
    room: { id: string; slug: string };
    topic: { id: string; slug: string };
    message: {
      id: string;
      room_id: string;
      topic_id?: string | null;
      reply_to_message_id?: string | null;
      reply_to_user_id?: string | null;
      reply_to_user_name?: string | null;
      reply_to_text?: string | null;
      user_id: string;
      user_name: string;
      text: string;
      created_at: string;
    };
  }>;
  replyTopicMessage: (input: {
    messageId: string;
    userId: string;
    text: string;
  }) => Promise<{
    room: { id: string; slug: string };
    topic: { id: string; slug: string };
    parentMessageId: string;
    message: {
      id: string;
      room_id: string;
      topic_id?: string | null;
      reply_to_message_id?: string | null;
      reply_to_user_id?: string | null;
      reply_to_user_name?: string | null;
      reply_to_text?: string | null;
      user_id: string;
      user_name: string;
      text: string;
      created_at: string;
    };
  }>;
  setTopicMessagePinned: (input: { messageId: string; userId: string; pinned: boolean }) => Promise<{
    room: { id: string; slug: string };
    topic: { id: string; slug: string };
    messageId: string;
    pinned: boolean;
  }>;
  setTopicMessageReaction: (input: { messageId: string; userId: string; emoji: string; active: boolean }) => Promise<{
    room: { id: string; slug: string };
    topic: { id: string; slug: string };
    messageId: string;
    emoji: string;
    userId: string;
    active: boolean;
  }>;
  createTopicMessageReport: (input: {
    messageId: string;
    userId: string;
    reason: string;
    details?: string;
  }) => Promise<{
    reportId: string;
    messageId: string;
  }>;
  markTopicRead: (input: {
    topicId: string;
    userId: string;
    lastReadMessageId?: string | null;
  }) => Promise<{
    roomId: string;
    topicId: string;
    lastReadMessageId: string | null;
    lastReadAt: string;
    unreadDelta: number;
    mentionDelta: number;
  }>;
};

export type NotificationInboxOps = {
  emitMentionInboxEvents: (input: {
    actorUserId: string;
    actorUserName: string;
    roomId: string;
    roomSlug: string;
    topicId: string | null;
    topicSlug: string | null;
    messageId: string;
    text: string;
    mentionUserIds?: string[];
  }) => Promise<string[]>;
  emitReplyInboxEvent: (input: {
    actorUserId: string;
    actorUserName: string;
    targetUserId: string | null;
    roomId: string;
    roomSlug: string;
    topicId: string | null;
    topicSlug: string | null;
    messageId: string;
    text: string;
  }) => Promise<void>;
};

export type ChatCommonParams = {
  connection: WebSocket;
  state: SocketState;
  payload: unknown;
  requestId: string | null;
  eventType: string;
  normalizeRequestId: (value: unknown) => string | null;
  getPayloadString: (payload: any, key: string, maxLength?: number) => string | null;
  sendNoActiveRoomNack: (socket: WebSocket, requestId: string | null, eventType: string) => void;
  sendValidationNack: (socket: WebSocket, requestId: string | null, eventType: string, message: string) => void;
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
  getUserSocketsByUserId?: (userId: string) => WebSocket[];
  getSocketRoomId?: (socket: WebSocket) => string | null;
  sendAckWithMetrics: (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    meta?: Record<string, unknown>,
    additionalMetrics?: string[]
  ) => void;
  broadcastRoom: (roomId: string, payload: unknown, excludedSocket?: WebSocket | null) => void;
  buildChatMessageEnvelope: (...args: any[]) => unknown;
  buildChatEditedEnvelope: (...args: any[]) => unknown;
  buildChatDeletedEnvelope: (...args: any[]) => unknown;
  buildChatTypingEnvelope?: (...args: any[]) => unknown;
  redisGet: (key: string) => Promise<string | null>;
  redisDel: (key: string) => Promise<number>;
  redisSetEx: (key: string, ttlSeconds: number, value: string) => Promise<string | null>;
  dbQuery: <T = unknown>(text: string, params?: unknown[]) => Promise<{ rowCount: number | null; rows: T[] }>;
};
