import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db.js";
import type { UserRow } from "../db.types.ts";
import { config } from "../config.js";

function unauthorized(reply: FastifyReply) {
  return reply.code(401).send({
    error: "Unauthorized",
    message: "Valid auth session is required"
  });
}

function banned(reply: FastifyReply) {
  return reply.code(403).send({
    error: "UserBanned",
    message: "User is banned"
  });
}

function serviceAccessDenied(reply: FastifyReply, accessState: string) {
  if (accessState === "blocked") {
    return reply.code(403).send({
      error: "ServiceAccessBlocked",
      message: "Service access is blocked"
    });
  }

  return reply.code(403).send({
    error: "ServiceAccessPending",
    message: "Service access requires admin approval"
  });
}

async function resolveCurrentUser(request: FastifyRequest) {
  const userId = request.user?.sub;
  if (!userId) {
    return null;
  }

  const result = await db.query<UserRow>(
    "SELECT id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, created_at FROM users WHERE id = $1",
    [userId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
}

function resolveBearerToken(headerValue: unknown): string | null {
  const raw = String(headerValue || "").trim();
  const match = raw.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }
  const token = String(match[1] || "").trim();
  return token || null;
}

function readCookieValue(cookieHeader: unknown, cookieName: string): string | null {
  const raw = String(cookieHeader || "");
  if (!raw) {
    return null;
  }

  const parts = raw.split(";");
  for (const part of parts) {
    const [name, ...rest] = part.split("=");
    if (String(name || "").trim() !== cookieName) {
      continue;
    }

    const value = rest.join("=").trim();
    if (!value) {
      return null;
    }

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const bearerToken = resolveBearerToken(request.headers.authorization);
  const cookieToken = config.authCookieMode
    ? readCookieValue(request.headers.cookie, config.authSessionCookieName)
    : null;
  const authToken = bearerToken || cookieToken;

  if (!authToken) {
    return unauthorized(reply);
  }

  try {
    if (bearerToken) {
      await request.jwtVerify();
    } else {
      const payload = await request.server.jwt.verify(authToken);
      request.user = payload as typeof request.user;
    }
  } catch {
    return unauthorized(reply);
  }

  const userId = String(request.user?.sub || "").trim();
  const sessionId = String(request.user?.sid || "").trim();
  if (userId && sessionId) {
    const raw = await request.server.redis.get(`auth:session:${sessionId}`);
    if (!raw) {
      return unauthorized(reply);
    }

    try {
      const payload = JSON.parse(raw) as { userId?: string; revoked?: boolean };
      if (payload?.revoked === true || String(payload?.userId || "") !== userId) {
        return unauthorized(reply);
      }
    } catch {
      return unauthorized(reply);
    }
  }

  if (request.currentUser) {
    if (request.currentUser.is_banned) {
      return banned(reply);
    }
    return;
  }

  const user = await resolveCurrentUser(request);
  if (!user) {
    return unauthorized(reply);
  }

  if (user.is_banned) {
    return banned(reply);
  }

  request.currentUser = user;
}

export async function loadCurrentUser(request: FastifyRequest, reply: FastifyReply) {
  if (request.currentUser) {
    if (request.currentUser.is_banned) {
      return banned(reply);
    }
    return;
  }

  const userId = request.user?.sub;

  if (!userId) {
    return unauthorized(reply);
  }

  const user = await resolveCurrentUser(request);
  if (!user) {
    return unauthorized(reply);
  }

  if (user.is_banned) {
    return banned(reply);
  }

  request.currentUser = user;
}

export function requireRole(roles: string[] | string) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return async function roleGuard(request: FastifyRequest, reply: FastifyReply) {
    const role = request.currentUser?.role || "user";

    if (!allowedRoles.includes(role)) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Insufficient permissions"
      });
    }
  };
}

export async function requireServiceAccess(request: FastifyRequest, reply: FastifyReply) {
  const user = request.currentUser;
  if (!user) {
    return unauthorized(reply);
  }

  if (user.role === "admin" || user.role === "super_admin") {
    return;
  }

  const accessState = String(user.access_state || "pending").trim();
  if (accessState !== "active") {
    return serviceAccessDenied(reply, accessState);
  }
}
