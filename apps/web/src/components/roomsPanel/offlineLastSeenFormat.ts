/**
 * offlineLastSeenFormat.ts — форматирование времени «последний раз в сети».
 * Принимает diffMs и возвращает человекочитаемую строку (секунды/минуты/часы/дни).
 */
export function formatOfflineLastSeen(diffMs: number): string {
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;
  const monthMs = 30 * dayMs;
  const yearMs = 365 * dayMs;

  if (diffMs < hourMs) {
    const minutes = Math.max(1, Math.floor(diffMs / minuteMs));
    return `${minutes}мин`;
  }

  if (diffMs < dayMs) {
    const hours = Math.max(1, Math.floor(diffMs / hourMs));
    return `${hours}ч`;
  }

  if (diffMs < weekMs) {
    const days = Math.max(1, Math.floor(diffMs / dayMs));
    return `${days}д`;
  }

  if (diffMs < monthMs) {
    const weeks = Math.max(1, Math.floor(diffMs / weekMs));
    return `${weeks}нед`;
  }

  if (diffMs < yearMs) {
    const months = Math.max(1, Math.floor(diffMs / monthMs));
    return `${months}мес`;
  }

  const years = Math.max(1, Math.floor(diffMs / yearMs));
  return `${years}г`;
}