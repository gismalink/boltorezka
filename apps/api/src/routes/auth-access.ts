import type { FastifyReply } from "fastify";
import type { UserCompactRow, UserRow } from "../db.types.ts";
import { sendAccountDeleted } from "./auth.helpers.js";

type AccessStateUser = Pick<UserRow, "role" | "access_state">;
type LifecycleUser = Pick<UserRow, "is_banned" | "deleted_at" | "purge_scheduled_at">;

export function enforceServiceAccess(reply: FastifyReply, user: AccessStateUser): boolean {
  if (user.role === "admin" || user.role === "super_admin" || user.access_state === "active") {
    return true;
  }

  reply.code(403).send({
    error: user.access_state === "blocked" ? "ServiceAccessBlocked" : "ServiceAccessPending",
    message: user.access_state === "blocked" ? "Service access is blocked" : "Service access requires admin approval"
  });
  return false;
}

export function enforceUserLifecycleAccess(reply: FastifyReply, user: LifecycleUser): boolean {
  if (user.is_banned) {
    reply.code(403).send({
      error: "UserBanned",
      message: "User is banned"
    });
    return false;
  }

  if (user.deleted_at) {
    sendAccountDeleted(reply, user);
    return false;
  }

  return true;
}

export function enforceCompactUserAccess(reply: FastifyReply, user: UserCompactRow): boolean {
  if (!enforceUserLifecycleAccess(reply, user)) {
    return false;
  }

  return enforceServiceAccess(reply, user);
}