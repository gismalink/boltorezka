import { z } from "zod";
import { normalizeBoundedString } from "../validators.js";

const uuidSchema = z.string().trim().uuid();
const targetUserIdsSchema = z.array(uuidSchema).max(200);

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ReturnType<z.ZodError["flatten"]> };

export function validateTargetUserId(targetUserId: unknown): ValidationResult<string> {
  const parsed = uuidSchema.safeParse(targetUserId);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.flatten() };
  }
  return { ok: true, value: parsed.data };
}

export function validateTargetUserIdsCsv(rawTargetIds: unknown): ValidationResult<string[]> {
  const normalized = normalizeBoundedString(rawTargetIds, 4000) || "";
  if (!normalized) {
    return { ok: true, value: [] };
  }

  const targetUserIds = Array.from(
    new Set(
      normalized
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  ).slice(0, 200);

  const parsed = targetUserIdsSchema.safeParse(targetUserIds);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.flatten() };
  }

  return { ok: true, value: parsed.data };
}
