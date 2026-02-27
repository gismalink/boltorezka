import { db } from "../db.js";
/** @typedef {import("../db.types.ts").UserRow} UserRow */

export async function requireAuth(request, reply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({
      error: "Unauthorized",
      message: "Valid bearer token is required"
    });
  }
}

export async function loadCurrentUser(request, reply) {
  const userId = request.user?.sub;

  if (!userId) {
    return reply.code(401).send({
      error: "Unauthorized",
      message: "Valid bearer token is required"
    });
  }

  const result = await db.query(
    "SELECT id, email, name, role, created_at FROM users WHERE id = $1",
    [userId]
  );

  if (result.rowCount === 0) {
    return reply.code(401).send({
      error: "Unauthorized",
      message: "User does not exist"
    });
  }

  request.currentUser = /** @type {UserRow} */ (result.rows[0]);
}

export function requireRole(roles) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return async function roleGuard(request, reply) {
    const role = request.currentUser?.role || "user";

    if (!allowedRoles.includes(role)) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Insufficient permissions"
      });
    }
  };
}
