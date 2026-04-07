// Утилиты таймлайна чата: расчет ключа дня и подписи для разделителя дат.

export function toLocalDateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function formatDateSeparatorLabel(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const currentYear = new Date().getFullYear();
  const includeYear = date.getFullYear() !== currentYear;
  return date.toLocaleDateString(locale, {
    weekday: "short",
    day: "2-digit",
    month: "long",
    ...(includeYear ? { year: "numeric" } : {})
  });
}

export function shouldShowDateDivider(previousCreatedAt: string | null, currentCreatedAt: string): boolean {
  const currentKey = toLocalDateKey(currentCreatedAt);
  if (!currentKey) {
    return false;
  }

  const previousKey = previousCreatedAt ? toLocalDateKey(previousCreatedAt) : "";
  return currentKey !== previousKey;
}
