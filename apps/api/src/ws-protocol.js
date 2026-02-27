/** @typedef {"call.offer" | "call.answer" | "call.ice"} CallSignalEventType */
/** @typedef {"call.reject" | "call.hangup"} CallTerminalEventType */
/** @typedef {CallSignalEventType | CallTerminalEventType} CallEventType */
/** @typedef {{ type: string, requestId?: string, idempotencyKey?: string, payload?: Record<string, unknown> }} WsIncomingEnvelope */
/** @typedef {{ type: string, payload: Record<string, unknown> }} WsOutgoingEnvelope */
/** @typedef {{ userId: string, userName: string }} PresenceUser */

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
 * @returns {WsOutgoingEnvelope}
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
 * @returns {WsOutgoingEnvelope}
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
 * @returns {WsOutgoingEnvelope}
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
 * @returns {WsOutgoingEnvelope}
 */
export function buildPresenceLeftEnvelope(userId, userName, roomSlug, presenceCount) {
  return {
    type: "presence.left",
    payload: { userId, userName, roomSlug, presenceCount }
  };
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {WsOutgoingEnvelope}
 */
export function buildChatMessageEnvelope(payload) {
  return {
    type: "chat.message",
    payload
  };
}
