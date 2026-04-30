/**
 * unreadUtils.ts — вспомогательные функции расчёта непрочитанного.
 * Исключает собственные сообщения пользователя и считает эффективный unread по ленте сообщений.
 */
// Утилиты непрочитанного: исключение своих сообщений и расчет эффективного unread.
import type { Message } from "../../../domain";
import { asTrimmedString } from "../../../utils/stringUtils";

export function countTrailingOwnMessagesInList(messages: Message[], currentUserId: string | null): number {
  const normalizedCurrentUserId = asTrimmedString(currentUserId);
  if (!normalizedCurrentUserId || messages.length === 0) {
    return 0;
  }

  let ownTailCount = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const messageUserId = asTrimmedString(messages[index]?.user_id);
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

  const normalizedCurrentUserId = asTrimmedString(currentUserId);
  if (!normalizedCurrentUserId) {
    return messages.length;
  }

  return messages.reduce((sum, message) => {
    const messageUserId = asTrimmedString(message.user_id);
    if (!messageUserId || messageUserId === normalizedCurrentUserId) {
      return sum;
    }
    return sum + 1;
  }, 0);
}