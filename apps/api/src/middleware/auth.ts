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
    "SELECT id, email, name, role, is_banned, created_at FROM users WHERE id = $1",
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
