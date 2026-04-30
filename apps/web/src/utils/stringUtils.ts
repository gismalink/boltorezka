/**
 * Shared string-coercion helpers used to safely normalize values that are
 * typed as `unknown`/`string | null | undefined` before they reach business
 * logic. Centralizing the pattern avoids dozens of inline
 * `String(x || "").trim()` and `typeof x === "string" ? x.trim() : ""`
 * variations scattered across services and hooks.
 */

/**
 * Returns `value.trim()` when `value` is a string, otherwise `""`.
 * Never throws and never coerces non-string primitives to their `String(...)`
 * representation (e.g. `null` -> `""`, not `"null"`).
 */
export function asTrimmedString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

/**
 * Like `asTrimmedString` but returns `null` for empty / non-string inputs,
 * which matches the common pattern of "treat blank input as missing".
 */
export function asTrimmedStringOrNull(value: unknown): string | null {
  const trimmed = asTrimmedString(value);
  return trimmed === "" ? null : trimmed;
}
