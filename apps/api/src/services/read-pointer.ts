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
  }

  const currentMessageId = String(currentPointer.messageId || "").trim();
  const requestedMessageId = String(requestedPointer.messageId || "").trim();
  if (!currentMessageId || !requestedMessageId) {
    return true;
  }

  return requestedMessageId > currentMessageId;
}