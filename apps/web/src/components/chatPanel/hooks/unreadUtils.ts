import type { Message } from "../../../domain";

const normalizeId = (value: string | null | undefined): string => String(value || "").trim();

export function countTrailingOwnMessagesInList(messages: Message[], currentUserId: string | null): number {
  const normalizedCurrentUserId = normalizeId(currentUserId);
  if (!normalizedCurrentUserId || messages.length === 0) {
    return 0;
  }

  let ownTailCount = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const messageUserId = normalizeId(messages[index]?.user_id);
    if (!messageUserId || messageUserId !== normalizedCurrentUserId) {
      break;
    }
    ownTailCount += 1;
  }

  return ownTailCount;
}

export function subtractTrailingOwnMessagesFromUnread(
  sourceUnreadCount: number,
  messages: Message[],
  currentUserId: string | null
): number {
  const normalizedSourceUnreadCount = Math.max(0, Number(sourceUnreadCount || 0));
  if (normalizedSourceUnreadCount === 0) {
    return 0;
  }

  const ownTailCount = countTrailingOwnMessagesInList(messages, currentUserId);
  if (ownTailCount === 0) {
    return normalizedSourceUnreadCount;
  }

  return Math.max(0, normalizedSourceUnreadCount - Math.min(normalizedSourceUnreadCount, ownTailCount));
}

export function countUnreadMessagesExcludingOwn(messages: Message[], currentUserId: string | null): number {
  if (messages.length === 0) {
    return 0;
  }

  const normalizedCurrentUserId = normalizeId(currentUserId);
  if (!normalizedCurrentUserId) {
    return messages.length;
  }

  return messages.reduce((sum, message) => {
    const messageUserId = normalizeId(message.user_id);
    if (!messageUserId || messageUserId === normalizedCurrentUserId) {
      return sum;
    }
    return sum + 1;
  }, 0);
}