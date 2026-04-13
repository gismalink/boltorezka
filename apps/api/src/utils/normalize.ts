/**
 * Утилиты нормализации строк.
 *
 * Единый набор функций для trim/slice ID, slug, email —
 * устраняет ~30+ дублирующихся trim-паттернов по кодобазе.
 */

const toTrimmedString = (value: unknown): string => {
  const raw = typeof value === "string" ? value : String(value ?? "");
  return raw.trim();
};

/** Нормализует произвольное значение в trimmed string. Возвращает null если пусто. */
export function normalizeId(value: unknown): string | null {
  const s = toTrimmedString(value);
  return s || null;
}

/** Нормализует slug (trim + ограничение длины). Возвращает null если пусто. */
export function normalizeSlug(value: unknown, maxLen = 128): string | null {
  const s = toTrimmedString(value).slice(0, maxLen);
  return s || null;
}

/** Нормализует email (trim + lowercase). Возвращает пустую строку если нет значения. */
export function normalizeEmail(value: unknown): string {
  return toTrimmedString(value).toLowerCase();
}
