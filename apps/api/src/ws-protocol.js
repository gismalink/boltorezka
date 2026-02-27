/** @typedef {"call.offer" | "call.answer" | "call.ice"} CallSignalEventType */
/** @typedef {"call.reject" | "call.hangup"} CallTerminalEventType */
/** @typedef {CallSignalEventType | CallTerminalEventType} CallEventType */

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
