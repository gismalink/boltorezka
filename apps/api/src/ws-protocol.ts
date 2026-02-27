import type {
  CallSignalEventType,
  CallTerminalEventType,
  PresenceUser,
  PongPayload,
  ChatMessagePayload,
  RoomJoinedPayload,
  RoomPresencePayload,
  PresenceJoinedPayload,
  PresenceLeftPayload,
  WsIncomingEnvelope,
  WsIncomingKnownEnvelope,
  WsIncomingPayload,
  WsOutgoingEnvelope
} from "./ws-protocol.types.ts";

export const CALL_SIGNAL_EVENT_TYPES = ["call.offer", "call.answer", "call.ice"];
export const CALL_TERMINAL_EVENT_TYPES = ["call.reject", "call.hangup"];

type ParsedIncomingEnvelope = {
  type: string;
  requestId?: string;
  idempotencyKey?: string;
  payload?: WsIncomingPayload;
};

/**
 * @param {unknown} value
 * @returns {value is CallSignalEventType}
 */
export function isCallSignalEventType(value: unknown): value is CallSignalEventType {
  return typeof value === "string" && CALL_SIGNAL_EVENT_TYPES.includes(value);
}

/**
 * @param {unknown} value
 * @returns {value is CallTerminalEventType}
 */
export function isCallTerminalEventType(value: unknown): value is CallTerminalEventType {
  return typeof value === "string" && CALL_TERMINAL_EVENT_TYPES.includes(value);
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
  if (
    envelope.type === "ping" ||
    envelope.type === "room.join" ||
    envelope.type === "chat.send" ||
    isCallSignalEventType(envelope.type) ||
    isCallTerminalEventType(envelope.type)
  ) {
    return envelope as WsIncomingKnownEnvelope;
  }

  return null;
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
 * @param {Record<string, unknown> | undefined} payload
 * @returns {Record<string, unknown> | null}
 */
export function getCallSignal(payload: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!payload) {
    return null;
  }

  const signal = payload.signal;
  if (!isObjectRecord(signal)) {
    return null;
  }

  return signal;
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
export function buildNackEnvelope(requestId: string, eventType: string, code: string, message: string): WsOutgoingEnvelope {
  return {
    type: "nack",
    payload: {
      requestId,
      eventType,
      code,
      message,
      ts: Date.now()
    }
  };
}

/**
 * @param {string} code
 * @param {string} message
 * @returns {WsOutgoingEnvelope}
 */
export function buildErrorEnvelope(code: string, message: string): WsOutgoingEnvelope {
  return {
    type: "error",
    payload: { code, message }
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
export function buildRoomJoinedEnvelope(roomId: string, roomSlug: string, roomTitle: string): { type: "room.joined"; payload: RoomJoinedPayload } {
  return {
    type: "room.joined",
    payload: { roomId, roomSlug, roomTitle }
  };
}

/**
 * @param {string} roomId
 * @param {string} roomSlug
 * @param {PresenceUser[]} users
 * @returns {{ type: "room.presence", payload: RoomPresencePayload }}
 */
export function buildRoomPresenceEnvelope(roomId: string, roomSlug: string, users: PresenceUser[]): { type: "room.presence"; payload: RoomPresencePayload } {
  return {
    type: "room.presence",
    payload: { roomId, roomSlug, users }
  };
}

/**
 * @param {string} userId
 * @param {string} userName
 * @param {string} roomSlug
 * @param {number} presenceCount
 * @returns {{ type: "presence.joined", payload: PresenceJoinedPayload }}
 */
export function buildPresenceJoinedEnvelope(userId: string, userName: string, roomSlug: string, presenceCount: number): { type: "presence.joined"; payload: PresenceJoinedPayload } {
  return {
    type: "presence.joined",
    payload: { userId, userName, roomSlug, presenceCount }
  };
}

/**
 * @param {string} userId
 * @param {string} userName
 * @param {string | null} roomSlug
 * @param {number} presenceCount
 * @returns {{ type: "presence.left", payload: PresenceLeftPayload }}
 */
export function buildPresenceLeftEnvelope(userId: string, userName: string, roomSlug: string | null, presenceCount: number): { type: "presence.left"; payload: PresenceLeftPayload } {
  return {
    type: "presence.left",
    payload: { userId, userName, roomSlug, presenceCount }
  };
}

/**
 * @param {ChatMessagePayload} payload
 * @returns {{ type: "chat.message", payload: ChatMessagePayload }}
 */
export function buildChatMessageEnvelope(payload: ChatMessagePayload): { type: "chat.message"; payload: ChatMessagePayload } {
  return {
    type: "chat.message",
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
 * @returns {{ fromUserId: string, fromUserName: string, roomId: string, roomSlug: string | null, targetUserId: string | null, ts: string }}
 */
function buildCallRelayBasePayload(
  fromUserId: string,
  fromUserName: string,
  roomId: string,
  roomSlug: string | null,
  targetUserId: string | null
): { fromUserId: string; fromUserName: string; roomId: string; roomSlug: string | null; targetUserId: string | null; ts: string } {
  return {
    fromUserId,
    fromUserName,
    roomId,
    roomSlug,
    targetUserId,
    ts: new Date().toISOString()
  };
}

/**
 * @param {CallSignalEventType} eventType
 * @param {string} fromUserId
 * @param {string} fromUserName
 * @param {string} roomId
 * @param {string | null} roomSlug
 * @param {string | null} targetUserId
 * @param {Record<string, unknown>} signal
 * @returns {WsOutgoingEnvelope}
 */
export function buildCallSignalRelayEnvelope(
  eventType: CallSignalEventType,
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
      ...buildCallRelayBasePayload(fromUserId, fromUserName, roomId, roomSlug, targetUserId),
      signal
    }
  };
}

/**
 * @param {CallTerminalEventType} eventType
 * @param {string} fromUserId
 * @param {string} fromUserName
 * @param {string} roomId
 * @param {string | null} roomSlug
 * @param {string | null} targetUserId
 * @param {string | null} reason
 * @returns {WsOutgoingEnvelope}
 */
export function buildCallTerminalRelayEnvelope(
  eventType: CallTerminalEventType,
  fromUserId: string,
  fromUserName: string,
  roomId: string,
  roomSlug: string | null,
  targetUserId: string | null,
  reason: string | null
): WsOutgoingEnvelope {
  return {
    type: eventType,
    payload: {
      ...buildCallRelayBasePayload(fromUserId, fromUserName, roomId, roomSlug, targetUserId),
      reason
    }
  };
}
