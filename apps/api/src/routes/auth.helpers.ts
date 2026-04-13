import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import type { UserRow } from "../db.types.ts";
import { normalizeBoundedString } from "../validators.js";

const AUTH_RATE_LIMIT_PREFIX = "auth:rl:";
const ACCOUNT_DELETE_GRACE_DAYS = 30;

type AuthRateLimitPolicy = {
  namespace: string;
  max: number;
  windowSec: number;
};

type AccountDeletionState = {
  purgeScheduledAt: string | null;
  daysRemaining: number;
};

export function buildAccountDeletionState(user: Pick<UserRow, "deleted_at" | "purge_scheduled_at">): AccountDeletionState {
  const purgeScheduledAt = user.purge_scheduled_at || null;
  if (!purgeScheduledAt) {
    return {
      purgeScheduledAt: null,
      daysRemaining: ACCOUNT_DELETE_GRACE_DAYS
    };
  }

  const purgeTs = Date.parse(purgeScheduledAt);
  if (!Number.isFinite(purgeTs)) {
    return {
      purgeScheduledAt,
      daysRemaining: ACCOUNT_DELETE_GRACE_DAYS
    };
  }

  const deltaMs = purgeTs - Date.now();
  return {
    purgeScheduledAt,
    daysRemaining: Math.max(0, Math.ceil(deltaMs / (24 * 60 * 60 * 1000)))
  };
}

export function sendAccountDeleted(reply: FastifyReply, user: Pick<UserRow, "deleted_at" | "purge_scheduled_at">) {
  const deletionState = buildAccountDeletionState(user);
  return reply.code(403).send({
    authenticated: false,
    error: "AccountDeleted",
    message: "Account is scheduled for deletion",
    purgeScheduledAt: deletionState.purgeScheduledAt,
    daysRemaining: deletionState.daysRemaining
  });
}

export function buildAuthAuditContext(request: FastifyRequest, extra: Record<string, unknown> = {}) {
  const requestId = normalizeBoundedString(request.id, 128);
  const userId = normalizeBoundedString(request.user?.sub || request.currentUser?.id, 128);
  const sessionId = normalizeBoundedString(request.user?.sid, 128);
  const ip = String(request.ip || request.headers["x-forwarded-for"] || "unknown")
    .split(",")[0]
    .trim() || null;
  const userAgent = normalizeBoundedString(request.headers["user-agent"], 512);

  return {
    requestId,
    userId,
    sessionId,
    ip,
    userAgent,
    ...extra
  };
}

function resolveRateLimitSubject(request: FastifyRequest): string {
  const userId = normalizeBoundedString(request.user?.sub, 128) || "";
  if (userId) {
    return `u:${userId}`;
  }

  const ip = String(request.ip || request.headers["x-forwarded-for"] || "unknown")
    .split(",")[0]
    .trim();
  return `ip:${ip || "unknown"}`;
}

export function makeAuthRateLimiter(policy: AuthRateLimitPolicy) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const nowWindow = Math.floor(Date.now() / 1000 / policy.windowSec);
    const key = `${AUTH_RATE_LIMIT_PREFIX}${policy.namespace}:${resolveRateLimitSubject(request)}:${nowWindow}`;

    const current = await request.server.redis.incr(key);
    if (current === 1) {
      await request.server.redis.expire(key, policy.windowSec);
    }

    if (current > policy.max) {
      request.server.log.warn(
        buildAuthAuditContext(request, {
          event: "auth.rate_limit.exceeded",
          namespace: policy.namespace,
          limit: policy.max,
          windowSec: policy.windowSec,
          current
        }),
        "auth rate limit exceeded"
      );
      reply.header("Retry-After", String(policy.windowSec));
      return reply.code(429).send({
        error: "RateLimitExceeded",
        message: `Too many requests for ${policy.namespace}`
      });
    }

    return undefined;
  };
}

export function appendSetCookie(reply: FastifyReply, value: string) {
  const current = reply.getHeader("set-cookie");
  if (!current) {
    reply.header("set-cookie", value);
    return;
  }

  if (Array.isArray(current)) {
    reply.header("set-cookie", [...current.map((item) => String(item)), value]);
    return;
  }

  reply.header("set-cookie", [String(current), value]);
}

export function buildSessionCookieValue(token: string) {
  const parts = [
    `${config.authSessionCookieName}=${encodeURIComponent(token)}`,
    `Path=${config.authSessionCookiePath}`,
    `Max-Age=${config.authSessionCookieMaxAgeSec}`,
    "HttpOnly",
    `SameSite=${config.authSessionCookieSameSite}`
  ];

  if (config.authSessionCookieDomain) {
    parts.push(`Domain=${config.authSessionCookieDomain}`);
  }

  if (config.authSessionCookieSecure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function buildSessionCookieClearValue() {
  const parts = [
    `${config.authSessionCookieName}=`,
    `Path=${config.authSessionCookiePath}`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    `SameSite=${config.authSessionCookieSameSite}`
  ];

  if (config.authSessionCookieDomain) {
    parts.push(`Domain=${config.authSessionCookieDomain}`);
  }

  if (config.authSessionCookieSecure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}