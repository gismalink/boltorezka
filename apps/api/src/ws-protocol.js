/** @typedef {import("./ws-protocol.types.ts").CallSignalEventType} CallSignalEventType */
/** @typedef {import("./ws-protocol.types.ts").CallTerminalEventType} CallTerminalEventType */
/** @typedef {import("./ws-protocol.types.ts").CallEventType} CallEventType */
/** @typedef {import("./ws-protocol.types.ts").WsIncomingEnvelope} WsIncomingEnvelope */
/** @typedef {import("./ws-protocol.types.ts").WsOutgoingEnvelope} WsOutgoingEnvelope */
/** @typedef {import("./ws-protocol.types.ts").PresenceUser} PresenceUser */
/** @typedef {import("./ws-protocol.types.ts").PongPayload} PongPayload */
/** @typedef {import("./ws-protocol.types.ts").ChatMessagePayload} ChatMessagePayload */
/** @typedef {import("./ws-protocol.types.ts").RoomJoinedPayload} RoomJoinedPayload */
/** @typedef {import("./ws-protocol.types.ts").RoomPresencePayload} RoomPresencePayload */
/** @typedef {import("./ws-protocol.types.ts").PresenceJoinedPayload} PresenceJoinedPayload */
/** @typedef {import("./ws-protocol.types.ts").PresenceLeftPayload} PresenceLeftPayload */

export const CALL_SIGNAL_EVENT_TYPES = ["call.offer", "call.answer", "call.ice"];
export const CALL_TERMINAL_EVENT_TYPES = ["call.reject", "call.hangup"];

/**
 * @param {unknown} value
 * @returns {value is CallSignalEventType}
 */
export function isCallSignalEventType(value) {
  return typeof value === "string" && CALL_SIGNAL_EVENT_TYPES.includes(/** @type {CallSignalEventType} */ (value));
}

/**
 * @param {unknown} value
 * @returns {value is CallTerminalEventType}
 */
export function isCallTerminalEventType(value) {
  return typeof value === "string" && CALL_TERMINAL_EVENT_TYPES.includes(/** @type {CallTerminalEventType} */ (value));
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isObjectRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * @param {unknown} raw
 * @returns {WsIncomingEnvelope | null}
 */
export function parseWsIncomingEnvelope(raw) {
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

  /** @type {WsIncomingEnvelope} */
  const envelope = { type };

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

/**
 * @param {Record<string, unknown> | undefined} payload
 * @param {string} key
 * @param {number} maxLength
 * @returns {string | null}
 */
export function getPayloadString(payload, key, maxLength = 1024) {
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
export function getCallSignal(payload) {
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
export function buildAckEnvelope(requestId, eventType, meta = {}) {
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
export function buildNackEnvelope(requestId, eventType, code, message) {
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
export function buildErrorEnvelope(code, message) {
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
export function buildServerReadyEnvelope(userId, userName) {
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
export function buildRoomJoinedEnvelope(roomId, roomSlug, roomTitle) {
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
export function buildRoomPresenceEnvelope(roomId, roomSlug, users) {
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
export function buildPresenceJoinedEnvelope(userId, userName, roomSlug, presenceCount) {
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
export function buildPresenceLeftEnvelope(userId, userName, roomSlug, presenceCount) {
  return {
    type: "presence.left",
    payload: { userId, userName, roomSlug, presenceCount }
  };
}

/**
 * @param {ChatMessagePayload} payload
 * @returns {{ type: "chat.message", payload: ChatMessagePayload }}
 */
export function buildChatMessageEnvelope(payload) {
  return {
    type: "chat.message",
    payload
  };
}

/**
 * @returns {{ type: "pong", payload: PongPayload }}
 */
export function buildPongEnvelope() {
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
function buildCallRelayBasePayload(fromUserId, fromUserName, roomId, roomSlug, targetUserId) {
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
  eventType,
  fromUserId,
  fromUserName,
  roomId,
  roomSlug,
  targetUserId,
  signal
) {
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
  eventType,
  fromUserId,
  fromUserName,
  roomId,
  roomSlug,
  targetUserId,
  reason
) {
  return {
    type: eventType,
    payload: {
      ...buildCallRelayBasePayload(fromUserId, fromUserName, roomId, roomSlug, targetUserId),
      reason
    }
  };
}
