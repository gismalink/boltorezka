/**
 * stringUtils — общие хелперы безопасного приведения unknown к строке.
 * Зачем: централизуем паттерн `String(x || "").trim()` и его варианты,
 * который встречался десятки раз в сервисах и хуках. Помимо удобства,
 * наша версия НЕ приводит не-строки к их `String(...)` представлению
 * (например, `null` -> `""`, а не `"null"`).
 */

/**
 * Возвращает `value.trim()` если `value` — строка, иначе `""`.
 * Никогда не бросает и не выполняет неявное преобразование примитивов.
 */
export function asTrimmedString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

/**
 * То же, что `asTrimmedString`, но возвращает `null` для пустых/не-строковых
 * входов — удобно, когда «пустая строка означает отсутствие значения».
 */
export function asTrimmedStringOrNull(value: unknown): string | null {
  const trimmed = asTrimmedString(value);
  return trimmed === "" ? null : trimmed;
}
