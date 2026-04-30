/**
 * chatErrorUtils.ts — нормализация и извлечение бизнес-кодов ошибок чата.
 *
 * Назначение:
 * - `extractBusinessCodeFromErrorMessage` — вытаскивает первый сегмент `CODE:...` из строки.
 * - `getErrorCode` — приводит произвольный `unknown`-ошибочный объект к строковому коду.
 * - `normalizeBusinessErrorCode` — превращает ApiError/строки/объекты в единый формат для UI.
 */
import { asTrimmedString } from "../utils/stringUtils";
export function extractBusinessCodeFromErrorMessage(message: string): string {
  const parts = String(message || "")
    .split(":")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return "";
  }

  const candidate = parts[1] || "";
  return /^[A-Z][A-Za-z0-9_]*$/.test(candidate) ? candidate : "";
}

export function getErrorCode(error: unknown): string {
  const explicitCode = asTrimmedString((error as { code?: string } | null)?.code);
  if (explicitCode) {
    return explicitCode;
  }

  const message = asTrimmedString((error as { message?: string } | null)?.message);
  return extractBusinessCodeFromErrorMessage(message);
}

export function normalizeBusinessErrorCode(error: unknown): unknown {
  const parsedCode = getErrorCode(error);
  if (!parsedCode) {
    return error;
  }

  if (error && typeof error === "object") {
    return Object.assign(error as Record<string, unknown>, { code: parsedCode });
  }

  return {
    code: parsedCode,
    message: String((error as { message?: string } | null)?.message || "")
  };
}