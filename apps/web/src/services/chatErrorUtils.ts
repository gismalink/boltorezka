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
  const explicitCode = String((error as { code?: string } | null)?.code || "").trim();
  if (explicitCode) {
    return explicitCode;
  }

  const message = String((error as { message?: string } | null)?.message || "").trim();
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