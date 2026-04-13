import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db.js";
import type { ServerMemberRole, UserRow } from "../db.types.ts";
import { config } from "../config.js";
import { ROLES, type RoleName } from "../roles.js";
import { normalizeBoundedString } from "../validators.js";

const normId = (value: unknown) => normalizeBoundedString(value, 128) || "";

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

function computeDaysRemaining(purgeScheduledAt: string | null | undefined): number {
  if (!purgeScheduledAt) {
    return 30;
  }

  const purgeTs = Date.parse(purgeScheduledAt);
  if (!Number.isFinite(purgeTs)) {
    return 30;
  }

  const deltaMs = purgeTs - Date.now();
  const days = Math.ceil(deltaMs / (24 * 60 * 60 * 1000));
  return Math.max(0, days);
}

function accountDeleted(reply: FastifyReply, purgeScheduledAt: string | null | undefined) {
  return reply.code(403).send({
    error: "AccountDeleted",
    message: "Account is scheduled for deletion",
    purgeScheduledAt: purgeScheduledAt || null,
    daysRemaining: computeDaysRemaining(purgeScheduledAt)
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

function serviceBanned(reply: FastifyReply) {
  return reply.code(403).send({
    error: "service_banned",
    message: "User is banned in service"
  });
}

function serverBanned(reply: FastifyReply) {
  return reply.code(403).send({
    error: "ServerBanned",
    message: "User is banned on this server"
  });
}

function serverMembershipDenied(reply: FastifyReply) {
  return reply.code(403).send({
    error: "NotServerMember",
    message: "User is not a server member"
  });
}

async function resolveCurrentUser(request: FastifyRequest) {
  const userId = request.user?.sub;
  if (!userId) {
    return null;
  }

  const result = await db.query<UserRow>(
    "SELECT id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, deleted_at, purge_scheduled_at, created_at FROM users WHERE id = $1",
    [userId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
}

function getRequestServerId(request: FastifyRequest): string | null {
  const paramsServerId = normId((request.params as { serverId?: unknown } | undefined)?.serverId);
  if (paramsServerId) {
    return paramsServerId;
  }

  const queryServerId = normId((request.query as { serverId?: unknown } | undefined)?.serverId);
  if (queryServerId) {
    return queryServerId;
  }

  const headerServerId = normId(request.headers["x-server-id"]);
  if (headerServerId) {
    return headerServerId;
  }

  return null;
}

async function resolveDefaultServerId(): Promise<string | null> {
  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM servers
     WHERE is_default = TRUE
       AND is_archived = FALSE
       AND is_blocked = FALSE
     ORDER BY created_at ASC
     LIMIT 1`
  );

  return normalizeBoundedString(result.rows[0]?.id, 128);
}

async function resolveServerMembership(userId: string, serverId: string) {
  const result = await db.query<{
    id: string;
    slug: string;
    name: string;
    role: ServerMemberRole;
    status: string;
  }>(
    `SELECT s.id, s.slug, s.name, sm.role, sm.status
     FROM server_members sm
     JOIN servers s ON s.id = sm.server_id
     WHERE sm.server_id = $1
       AND s.is_archived = FALSE
       AND s.is_blocked = FALSE
       AND sm.user_id = $2
     LIMIT 1`,
    [serverId, userId]
  );

  if ((result.rowCount || 0) === 0) {
    return null;
  }

  return result.rows[0];
}

function resolveBearerToken(headerValue: unknown): string | null {
  const raw = normalizeBoundedString(headerValue, 4096) || "";
  const match = raw.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }
  const token = normalizeBoundedString(match[1], 4096) || "";
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
    if ((normalizeBoundedString(name, 256) || "") !== cookieName) {
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

  const userId = normId(request.user?.sub);
  const sessionId = normId(request.user?.sid);
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
    if (request.currentUser.deleted_at) {
      return accountDeleted(reply, request.currentUser.purge_scheduled_at || null);
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

  if (user.deleted_at) {
    return accountDeleted(reply, user.purge_scheduled_at || null);
  }

  request.currentUser = user;
}

export async function loadCurrentUser(request: FastifyRequest, reply: FastifyReply) {
  if (request.currentUser) {
    if (request.currentUser.is_banned) {
      return banned(reply);
    }
    if (request.currentUser.deleted_at) {
      return accountDeleted(reply, request.currentUser.purge_scheduled_at || null);
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

  if (user.deleted_at) {
    return accountDeleted(reply, user.purge_scheduled_at || null);
  }

  request.currentUser = user;
}

export function requireRole(roles: RoleName[] | RoleName) {
  const allowedRoles: string[] = Array.isArray(roles) ? roles : [roles];

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

  if (user.role === ROLES.ADMIN || user.role === ROLES.SUPER_ADMIN) {
    return;
  }

  const accessState = normalizeBoundedString(user.access_state, 32) || "pending";
  if (accessState !== "active") {
    return serviceAccessDenied(reply, accessState);
  }
}

export async function requireNotServiceBanned(request: FastifyRequest, reply: FastifyReply) {
  const user = request.currentUser;
  if (!user) {
    return unauthorized(reply);
  }

  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM service_bans
     WHERE user_id = $1
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [user.id]
  );

  if ((result.rowCount || 0) > 0) {
    return serviceBanned(reply);
  }
}

export async function requireServerMembership(request: FastifyRequest, reply: FastifyReply) {
  const user = request.currentUser;
  if (!user) {
    return unauthorized(reply);
  }

  const requestedServerId = getRequestServerId(request);
  const serverId = requestedServerId || await resolveDefaultServerId();
  if (!serverId) {
    return reply.code(500).send({
      error: "ServerNotConfigured",
      message: "Default server is not configured"
    });
  }

  const membership = await resolveServerMembership(user.id, serverId);
  if (!membership || String(membership.status || "") !== "active") {
    return serverMembershipDenied(reply);
  }

  request.currentServer = {
    id: membership.id,
    slug: membership.slug,
    name: membership.name,
    role: membership.role
  };
}

export async function requireNotServerBanned(request: FastifyRequest, reply: FastifyReply) {
  const user = request.currentUser;
  const server = request.currentServer;

  if (!user) {
    return unauthorized(reply);
  }

  if (!server) {
    return reply.code(500).send({
      error: "ServerContextMissing",
      message: "Server context was not resolved"
    });
  }

  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM server_bans
     WHERE server_id = $1
       AND user_id = $2
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [server.id, user.id]
  );

  if ((result.rowCount || 0) > 0) {
    return serverBanned(reply);
  }
}
