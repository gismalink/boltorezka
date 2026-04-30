/**
 * roomUnreadWsBumpTracker.ts — модульный трекер свежих WS-изменений room-unread.
 *
 * Назначение: защитить локальное состояние счётчиков непрочитанных от
 * затирания фоновым polling-результатом. После WS-события (incoming message
 * или mark-read) для слага N секунд считаем, что network-ответ может быть
 * устаревшим — в этот период предпочитаем локальное значение.
 */

import { asTrimmedString } from "../../../utils/stringUtils";
const WS_BUMP_GUARD_MS = 60_000;

const lastBumpAtBySlug = new Map<string, number>();

export function markRoomUnreadWsBump(slug: string): void {
  const normalized = asTrimmedString(slug);
  if (!normalized) return;
  lastBumpAtBySlug.set(normalized, Date.now());
}

export function isRoomUnreadWsBumpFresh(slug: string): boolean {
  const normalized = asTrimmedString(slug);
  if (!normalized) return false;
  const ts = lastBumpAtBySlug.get(normalized);
  if (!ts) return false;
  if (Date.now() - ts > WS_BUMP_GUARD_MS) {
    lastBumpAtBySlug.delete(normalized);
    return false;
  }
  return true;
}
