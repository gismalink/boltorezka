import { randomUUID } from "node:crypto";

const AUTH_DESKTOP_HANDOFF_PREFIX = "auth:desktop-handoff:";
const AUTH_DESKTOP_HANDOFF_TTL_SEC = 120;
const AUTH_DESKTOP_HANDOFF_ATTEMPT_PREFIX = "auth:desktop-handoff-attempt:";

type RedisLike = {
  setEx: (key: string, ttlSec: number, value: string) => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
  del: (key: string) => Promise<unknown>;
  ttl: (key: string) => Promise<number>;
};

export type DesktopHandoffAttemptState = {
  status: "pending" | "completed";
  userId: string;
  createdAt: string;
  completedAt: string | null;
};

export function desktopHandoffTtlSec(): number {
  return AUTH_DESKTOP_HANDOFF_TTL_SEC;
}

function buildAttemptKey(attemptId: string): string {
  return `${AUTH_DESKTOP_HANDOFF_ATTEMPT_PREFIX}${attemptId}`;
}

function buildCodeKey(code: string): string {
  return `${AUTH_DESKTOP_HANDOFF_PREFIX}${code}`;
}

export async function createDesktopHandoffAttempt(redis: RedisLike, userId: string) {
  const attemptId = randomUUID();
  const state: DesktopHandoffAttemptState = {
    status: "pending",
    userId,
    createdAt: new Date().toISOString(),
    completedAt: null
  };

  await redis.setEx(
    buildAttemptKey(attemptId),
    AUTH_DESKTOP_HANDOFF_TTL_SEC,
    JSON.stringify(state)
  );

  return {
    attemptId,
    expiresInSec: AUTH_DESKTOP_HANDOFF_TTL_SEC
  };
}

export async function readDesktopHandoffAttempt(redis: RedisLike, attemptId: string): Promise<DesktopHandoffAttemptState | null> {
  const raw = await redis.get(buildAttemptKey(attemptId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as DesktopHandoffAttemptState;
    if (!parsed || !parsed.userId || (parsed.status !== "pending" && parsed.status !== "completed")) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function completeDesktopHandoffAttempt(
  redis: RedisLike,
  attemptId: string,
  state: DesktopHandoffAttemptState
): Promise<"completed" | "expired"> {
  const key = buildAttemptKey(attemptId);
  const ttlSec = await redis.ttl(key);
  if (ttlSec <= 0) {
    return "expired";
  }

  const nextState: DesktopHandoffAttemptState = {
    ...state,
    status: "completed",
    completedAt: new Date().toISOString()
  };

  await redis.setEx(key, ttlSec, JSON.stringify(nextState));
  return "completed";
}

export async function issueDesktopHandoffCode(redis: RedisLike, userId: string) {
  const code = randomUUID();
  await redis.setEx(
    buildCodeKey(code),
    AUTH_DESKTOP_HANDOFF_TTL_SEC,
    JSON.stringify({
      userId,
      issuedAt: new Date().toISOString()
    })
  );

  return {
    code,
    expiresInSec: AUTH_DESKTOP_HANDOFF_TTL_SEC
  };
}

export async function consumeDesktopHandoffCode(
  redis: RedisLike,
  code: string
): Promise<{ status: "missing" } | { status: "invalid" } | { status: "ok"; userId: string }> {
  const key = buildCodeKey(code);
  const raw = await redis.get(key);
  if (!raw) {
    return { status: "missing" };
  }

  await redis.del(key);

  try {
    const payload = JSON.parse(raw) as { userId?: string };
    const userId = String(payload.userId || "").trim();
    if (!userId) {
      return { status: "invalid" };
    }
    return {
      status: "ok",
      userId
    };
  } catch {
    return { status: "invalid" };
  }
}