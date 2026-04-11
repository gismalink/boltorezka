/**
 * Утилиты нормализации строк.
 *
 * Единый набор функций для trim/slice ID, slug, email —
 * устраняет ~30+ дублирующихся `String(...).trim()` паттернов по кодобазе.
 */

/** Нормализует произвольное значение в trimmed string. Возвращает null если пусто. */
export function normalizeId(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return s || null;
}

/** Нормализует slug (trim + ограничение длины). Возвращает null если пусто. */
export function normalizeSlug(value: unknown, maxLen = 128): string | null {
  const s = String(value ?? "").trim().slice(0, maxLen);
  return s || null;
}

/** Нормализует email (trim + lowercase). Возвращает пустую строку если нет значения. */
export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}
