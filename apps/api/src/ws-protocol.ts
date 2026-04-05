import type {
  CallSignalEventType,
  CallMicStateEventType,
  CallVideoStateEventType,
  PresenceUser,
  PongPayload,
  ChatMessagePayload,
  ChatEditedPayload,
  ChatDeletedPayload,
  ChatTypingPayload,
  MediaTopology,
  CallInitialStatePayload,
  CallInitialStateParticipantPayload,
  RealtimeCorrelationPayload,
  RoomJoinedPayload,
  RoomLeftPayload,
  RoomPresencePayload,
  PresenceJoinedPayload,
  PresenceLeftPayload,
  WsIncomingEnvelope,
  WsIncomingKnownEnvelope,
  WsIncomingPayload,
  WsOutgoingEnvelope
} from "./ws-protocol.types.ts";

export const CALL_MIC_STATE_EVENT_TYPES = ["call.mic_state"];
export const CALL_VIDEO_STATE_EVENT_TYPES = ["call.video_state"];

type ParsedIncomingEnvelope = {
  type: string;
  requestId?: string;
  idempotencyKey?: string;
  payload?: WsIncomingPayload;
};

export function isCallMicStateEventType(value: unknown): value is CallMicStateEventType {
  return typeof value === "string" && CALL_MIC_STATE_EVENT_TYPES.includes(value);
}

export function isCallVideoStateEventType(value: unknown): value is CallVideoStateEventType {
  return typeof value === "string" && CALL_VIDEO_STATE_EVENT_TYPES.includes(value);
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * @param {unknown} raw
 * @returns {WsIncomingEnvelope | null}
 */
export function parseWsIncomingEnvelope(raw: unknown): WsIncomingEnvelope | null {
  const text = typeof raw === "string" ? raw : Buffer.isBuffer(raw) ? raw.toString("utf8") : "";
  if (!text) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!isObjectRecord(parsed)) {
    return null;
  }

  const type = typeof parsed.type === "string" ? parsed.type.trim() : "";
  if (!type) {
    return null;
  }

  const envelope: ParsedIncomingEnvelope = { type };

  if (typeof parsed.requestId === "string") {
    envelope.requestId = parsed.requestId;
  }
  if (typeof parsed.idempotencyKey === "string") {
    envelope.idempotencyKey = parsed.idempotencyKey;
  }
  if (isObjectRecord(parsed.payload)) {
    envelope.payload = parsed.payload;
  }

  return envelope;
}

export function asKnownWsIncomingEnvelope(
  envelope: WsIncomingEnvelope
): WsIncomingKnownEnvelope | null {
  switch (envelope.type) {
    case "ping":
    case "room.join":
    case "room.leave":
    case "room.kick":
    case "room.move_member":
    case "chat.send":
    case "chat.edit":
    case "chat.delete":
    case "chat.typing":
    case "call.offer":
    case "call.answer":
    case "call.ice":
    case "call.mic_state":
    case "call.video_state":
    case "screen.share.start":
    case "screen.share.stop":
      return {
        type: envelope.type,
        requestId: envelope.requestId,
        idempotencyKey: envelope.idempotencyKey,
        payload: envelope.payload
      };
    default:
      return null;
  }
}

/**
 * @param {Record<string, unknown> | undefined} payload
 * @param {string} key
 * @param {number} maxLength
 * @returns {string | null}
 */
export function getPayloadString(payload: Record<string, unknown> | undefined, key: string, maxLength = 1024): string | null {
  if (!payload) {
    return null;
  }

  const value = payload[key];
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

/**
 * @param {string} requestId
 * @param {string} eventType
 * @param {Record<string, unknown>} [meta]
 * @returns {WsOutgoingEnvelope}
 */
export function buildAckEnvelope(requestId: string, eventType: string, meta: Record<string, unknown> = {}): WsOutgoingEnvelope {
  return {
    type: "ack",
    payload: {
      requestId,
      eventType,
      ts: Date.now(),
      ...meta
    }
  };
}

/**
 * @param {string} requestId
 * @param {string} eventType
 * @param {string} code
 * @param {string} message
 * @returns {WsOutgoingEnvelope}
 */
export function buildNackEnvelope(
  requestId: string,
  eventType: string,
  code: string,
  message: string,
  category?: "auth" | "permissions" | "topology" | "transport",
  meta: Record<string, unknown> = {}
): WsOutgoingEnvelope {
  return {
    type: "nack",
    payload: {
      requestId,
      eventType,
      code,
      message,
      ts: Date.now(),
      ...(category ? { category } : {}),
      ...meta
    }
  };
}

/**
 * @param {string} code
 * @param {string} message
 * @returns {WsOutgoingEnvelope}
 */
export function buildErrorEnvelope(
  code: string,
  message: string,
  category?: "auth" | "permissions" | "topology" | "transport"
): WsOutgoingEnvelope {
  return {
    type: "error",
    payload: {
      code,
      message,
      ...(category ? { category } : {})
    }
  };
}

/**
 * @param {string} userId
 * @param {string} userName
 * @returns {WsOutgoingEnvelope}
 */
export function buildServerReadyEnvelope(userId: string, userName: string): WsOutgoingEnvelope {
  return {
    type: "server.ready",
    payload: {
      userId,
      userName,
      connectedAt: new Date().toISOString()
    }
  };
}

/**
 * @param {string} roomId
 * @param {string} roomSlug
 * @param {string} roomTitle
 * @returns {{ type: "room.joined", payload: RoomJoinedPayload }}
 */
export function buildRoomJoinedEnvelope(
  roomId: string,
  roomSlug: string,
  roomTitle: string,
  mediaTopology: MediaTopology,
  correlation: RealtimeCorrelationPayload | null = null,
  reconnect = false
): { type: "room.joined"; payload: RoomJoinedPayload } {
  return {
    type: "room.joined",
    payload: {
      roomId,
      roomSlug,
      roomTitle,
      mediaTopology,
      ...(correlation ? { correlation } : {}),
      ...(reconnect ? { reconnect: true } : {})
    }
  };
}

/**
 * @param {string} roomId
 * @param {string} roomSlug
 * @returns {{ type: "room.left", payload: RoomLeftPayload }}
 */
export function buildRoomLeftEnvelope(
  roomId: string,
  roomSlug: string,
  correlation: RealtimeCorrelationPayload | null = null
): { type: "room.left"; payload: RoomLeftPayload } {
  return {
    type: "room.left",
    payload: {
      roomId,
      roomSlug,
      ...(correlation ? { correlation } : {})
    }
  };
}

/**
 * @param {string} roomId
 * @param {string} roomSlug
 * @param {PresenceUser[]} users
 * @returns {{ type: "room.presence", payload: RoomPresencePayload }}
 */
export function buildRoomPresenceEnvelope(
  roomId: string,
  roomSlug: string,
  users: PresenceUser[],
  mediaTopology: MediaTopology,
  correlation: RealtimeCorrelationPayload | null = null
): { type: "room.presence"; payload: RoomPresencePayload } {
  return {
    type: "room.presence",
    payload: {
      roomId,
      roomSlug,
      users,
      mediaTopology,
      ...(correlation ? { correlation } : {})
    }
  };
}

export function buildRoomsPresenceEnvelope(
  rooms: Array<{ roomId: string; roomSlug: string; users: PresenceUser[]; mediaTopology: MediaTopology }>
): { type: "rooms.presence"; payload: { rooms: Array<{ roomId: string; roomSlug: string; users: PresenceUser[]; mediaTopology: MediaTopology }> } } {
  return {
    type: "rooms.presence",
    payload: { rooms }
  };
}

/**
 * @param {string} userId
 * @param {string} userName
 * @param {string} roomSlug
 * @param {number} presenceCount
 * @returns {{ type: "presence.joined", payload: PresenceJoinedPayload }}
 */
export function buildPresenceJoinedEnvelope(
  userId: string,
  userName: string,
  roomSlug: string,
  presenceCount: number,
  correlation: RealtimeCorrelationPayload | null = null
): { type: "presence.joined"; payload: PresenceJoinedPayload } {
  return {
    type: "presence.joined",
    payload: {
      userId,
      userName,
      roomSlug,
      presenceCount,
      ...(correlation ? { correlation } : {})
    }
  };
}

/**
 * @param {string} userId
 * @param {string} userName
 * @param {string | null} roomSlug
 * @param {number} presenceCount
 * @returns {{ type: "presence.left", payload: PresenceLeftPayload }}
 */
export function buildPresenceLeftEnvelope(
  userId: string,
  userName: string,
  roomSlug: string | null,
  presenceCount: number,
  correlation: RealtimeCorrelationPayload | null = null
): { type: "presence.left"; payload: PresenceLeftPayload } {
  return {
    type: "presence.left",
    payload: {
      userId,
      userName,
      roomSlug,
      presenceCount,
      ...(correlation ? { correlation } : {})
    }
  };
}

/**
 * @param {ChatMessagePayload} payload
 * @returns {{ type: "chat.message.created", payload: ChatMessagePayload }}
 */
export function buildChatMessageEnvelope(payload: ChatMessagePayload): { type: "chat.message.created"; payload: ChatMessagePayload } {
  return {
    type: "chat.message.created",
    payload
  };
}

export function buildChatEditedEnvelope(payload: ChatEditedPayload): { type: "chat.message.updated"; payload: ChatEditedPayload } {
  return {
    type: "chat.message.updated",
    payload
  };
}

export function buildChatDeletedEnvelope(payload: ChatDeletedPayload): { type: "chat.message.deleted"; payload: ChatDeletedPayload } {
  return {
    type: "chat.message.deleted",
    payload
  };
}

export function buildChatTypingEnvelope(payload: ChatTypingPayload): { type: "chat.typing"; payload: ChatTypingPayload } {
  return {
    type: "chat.typing",
    payload
  };
}

/**
 * @returns {{ type: "pong", payload: PongPayload }}
 */
export function buildPongEnvelope(): { type: "pong"; payload: PongPayload } {
  return {
    type: "pong",
    payload: {
      ts: Date.now()
    }
  };
}

/**
 * @param {string} fromUserId
 * @param {string} fromUserName
 * @param {string} roomId
 * @param {string | null} roomSlug
 * @param {string | null} targetUserId
 * @returns {{ requestId: string | null, sessionId: string, traceId: string, fromUserId: string, fromUserName: string, roomId: string, roomSlug: string | null, targetUserId: string | null, ts: string }}
 */
function buildCallRelayBasePayload(
  requestId: string | null,
  sessionId: string,
  traceId: string,
  fromUserId: string,
  fromUserName: string,
  roomId: string,
  roomSlug: string | null,
  targetUserId: string | null
): { requestId: string | null; sessionId: string; traceId: string; fromUserId: string; fromUserName: string; roomId: string; roomSlug: string | null; targetUserId: string | null; ts: string } {
  return {
    requestId,
    sessionId,
    traceId,
    fromUserId,
    fromUserName,
    roomId,
    roomSlug,
    targetUserId,
    ts: new Date().toISOString()
  };
}

export function buildCallMicStateRelayEnvelope(
  eventType: CallMicStateEventType,
  requestId: string | null,
  sessionId: string,
  traceId: string,
  fromUserId: string,
  fromUserName: string,
  roomId: string,
  roomSlug: string | null,
  targetUserId: string | null,
  payload: { muted: boolean; speaking?: boolean; audioMuted?: boolean }
): WsOutgoingEnvelope {
  return {
    type: eventType,
    payload: {
      ...buildCallRelayBasePayload(requestId, sessionId, traceId, fromUserId, fromUserName, roomId, roomSlug, targetUserId),
      muted: payload.muted,
      speaking: payload.speaking,
      audioMuted: payload.audioMuted
    }
  };
}

export function buildCallVideoStateRelayEnvelope(
  eventType: CallVideoStateEventType,
  requestId: string | null,
  sessionId: string,
  traceId: string,
  fromUserId: string,
  fromUserName: string,
  roomId: string,
  roomSlug: string | null,
  targetUserId: string | null,
  settings: Record<string, unknown>
): WsOutgoingEnvelope {
  return {
    type: eventType,
    payload: {
      ...buildCallRelayBasePayload(requestId, sessionId, traceId, fromUserId, fromUserName, roomId, roomSlug, targetUserId),
      settings
    }
  };
}

export function buildCallSignalRelayEnvelope(
  eventType: CallSignalEventType,
  requestId: string | null,
  sessionId: string,
  traceId: string,
  fromUserId: string,
  fromUserName: string,
  roomId: string,
  roomSlug: string | null,
  targetUserId: string | null,
  signal: Record<string, unknown>
): WsOutgoingEnvelope {
  return {
    type: eventType,
    payload: {
      ...buildCallRelayBasePayload(requestId, sessionId, traceId, fromUserId, fromUserName, roomId, roomSlug, targetUserId),
      signal
    }
  };
}

export function buildCallInitialStateEnvelope(
  roomId: string,
  roomSlug: string,
  participants: CallInitialStateParticipantPayload[]
): { type: "call.initial_state"; payload: CallInitialStatePayload } {
  return {
    type: "call.initial_state",
    payload: {
      roomId,
      roomSlug,
      participants
    }
  };
}
