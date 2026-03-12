import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db.js";
import type { UserRow } from "../db.types.ts";

function unauthorized(reply: FastifyReply) {
  return reply.code(401).send({
    error: "Unauthorized",
    message: "Valid bearer token is required"
  });
}

function banned(reply: FastifyReply) {
  return reply.code(403).send({
    error: "UserBanned",
    message: "User is banned"
  });
}

async function resolveCurrentUser(request: FastifyRequest) {
  const userId = request.user?.sub;
  if (!userId) {
    return null;
  }

  const result = await db.query<UserRow>(
    "SELECT id, email, username, name, ui_theme, role, is_banned, created_at FROM users WHERE id = $1",
    [userId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
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
