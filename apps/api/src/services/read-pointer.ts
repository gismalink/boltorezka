import { normalizeBoundedString } from "../validators.js";

export function isReadPointerAdvance(
  currentPointer: { messageId: string; createdAtIso: string } | null,
  requestedPointer: { messageId: string; createdAtIso: string } | null
): boolean {
  if (!requestedPointer) {
    return true;
  }
  if (!currentPointer) {
    return true;
  }

  const currentTs = Date.parse(String(currentPointer.createdAtIso || ""));
  const requestedTs = Date.parse(String(requestedPointer.createdAtIso || ""));

  if (Number.isFinite(currentTs) && Number.isFinite(requestedTs)) {
    if (requestedTs > currentTs) {
      return true;
    }
    if (requestedTs < currentTs) {
      return false;
    }

    // Equal timestamps are treated as non-stale because unread anchoring uses
    // created_at thresholding; rejecting equal-time reads can cause false rollbacks.
    return true;
  }

  const currentMessageId = normalizeBoundedString(currentPointer.messageId, 128) || "";
  const requestedMessageId = normalizeBoundedString(requestedPointer.messageId, 128) || "";
  if (!currentMessageId || !requestedMessageId) {
    return true;
  }

  return requestedMessageId > currentMessageId;
}