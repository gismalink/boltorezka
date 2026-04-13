import { db } from "../db.js";
import type { ServerBanRow, ServerMemberRole, ServiceBanRow } from "../db.types.ts";
import { writeServerAuditEvent } from "./server-audit-service.js";
import { emitModerationInboxEvent } from "./notification-inbox-service.js";
import { resolveEffectiveServerPermissions } from "./server-permissions-service.js";
import { normalizeBoundedString } from "../validators.js";

type BaseBanInput = {
  actorUserId: string;
  targetUserId: string;
  reason?: string | null;
  expiresAt?: string | null;
};

type ServerBanInput = BaseBanInput & {
  serverId: string;
};

async function getServerRole(serverId: string, userId: string): Promise<ServerMemberRole | null> {
  const membership = await db.query<{ role: ServerMemberRole }>(
    `SELECT role
     FROM server_members
     WHERE server_id = $1
       AND user_id = $2
       AND status = 'active'
     LIMIT 1`,
    [serverId, userId]
  );

  return membership.rows[0]?.role || null;
}

async function resolveUserName(userId: string): Promise<string> {
  const result = await db.query<{ name: string }>(
    `SELECT name FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );

  return normalizeBoundedString(result.rows[0]?.name, 128) || "Moderator";
}

function normalizeReason(reason?: string | null): string | null {
  const value = normalizeBoundedString(reason, 500) || "";
  return value ? value.slice(0, 500) : null;
}

function normalizeExpiresAt(expiresAt?: string | null): string | null {
  const value = normalizeBoundedString(expiresAt, 128) || "";
  if (!value) {
    return null;
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("invalid_expires_at");
  }

  return timestamp.toISOString();
}

export async function applyServerBan(input: ServerBanInput): Promise<ServerBanRow> {
  if (input.actorUserId === input.targetUserId) {
    throw new Error("invalid_action");
  }

  const actorRole = await getServerRole(input.serverId, input.actorUserId);
  if (!actorRole) {
    throw new Error("ForbiddenRole");
  }

  const actorPermissions = await resolveEffectiveServerPermissions({
    serverId: input.serverId,
    userId: input.actorUserId,
    serverRole: actorRole
  });

  if (!actorPermissions.permissions.moderateMembers) {
    throw new Error("ForbiddenRole");
  }

  const targetRole = await getServerRole(input.serverId, input.targetUserId);
  if (targetRole === "owner") {
    throw new Error("protected_user");
  }

  if ((actorRole === "admin" || actorRole === "member") && targetRole === "admin") {
    throw new Error("protected_user");
  }

  const reason = normalizeReason(input.reason);
  const expiresAt = normalizeExpiresAt(input.expiresAt);

  const result = await db.query<ServerBanRow>(
    `INSERT INTO server_bans (server_id, user_id, reason, banned_by_user_id, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (server_id, user_id)
     DO UPDATE SET
       reason = EXCLUDED.reason,
       banned_by_user_id = EXCLUDED.banned_by_user_id,
       expires_at = EXCLUDED.expires_at,
       created_at = NOW()
     RETURNING id, server_id, user_id, reason, banned_by_user_id, expires_at, created_at`,
    [input.serverId, input.targetUserId, reason, input.actorUserId, expiresAt]
  );

  await db.query(
    `UPDATE server_members
     SET status = 'removed'
     WHERE server_id = $1
       AND user_id = $2`,
    [input.serverId, input.targetUserId]
  );

  await writeServerAuditEvent({
    action: "server.ban.applied",
    serverId: input.serverId,
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    meta: {
      reason,
      expiresAt,
      banId: result.rows[0]?.id || null
    }
  });

  const actorName = await resolveUserName(input.actorUserId);
  void emitModerationInboxEvent({
    actorUserId: input.actorUserId,
    actorUserName: actorName,
    targetUserId: input.targetUserId,
    action: "server.ban.applied",
    title: "You were banned from a server",
    body: reason
      ? `Reason: ${reason}`
      : "A moderator banned you from a server",
    serverId: input.serverId
  });

  return result.rows[0];
}

export async function revokeServerBan(input: Pick<ServerBanInput, "serverId" | "actorUserId" | "targetUserId">): Promise<boolean> {
  const actorRole = await getServerRole(input.serverId, input.actorUserId);
  if (!actorRole) {
    throw new Error("ForbiddenRole");
  }

  const actorPermissions = await resolveEffectiveServerPermissions({
    serverId: input.serverId,
    userId: input.actorUserId,
    serverRole: actorRole
  });

  if (!actorPermissions.permissions.moderateMembers) {
    throw new Error("ForbiddenRole");
  }

  const result = await db.query(
    `DELETE FROM server_bans
     WHERE server_id = $1
       AND user_id = $2`,
    [input.serverId, input.targetUserId]
  );

  await writeServerAuditEvent({
    action: "server.ban.revoked",
    serverId: input.serverId,
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    meta: {
      revoked: (result.rowCount || 0) > 0
    }
  });

  if ((result.rowCount || 0) > 0) {
    const actorName = await resolveUserName(input.actorUserId);
    void emitModerationInboxEvent({
      actorUserId: input.actorUserId,
      actorUserName: actorName,
      targetUserId: input.targetUserId,
      action: "server.ban.revoked",
      title: "Your server ban was revoked",
      body: "A moderator revoked your server ban",
      serverId: input.serverId
    });
  }

  return (result.rowCount || 0) > 0;
}

export async function applyServiceBan(input: BaseBanInput): Promise<ServiceBanRow> {
  if (input.actorUserId === input.targetUserId) {
    throw new Error("invalid_action");
  }

  const reason = normalizeReason(input.reason);
  const expiresAt = normalizeExpiresAt(input.expiresAt);

  const result = await db.query<ServiceBanRow>(
    `INSERT INTO service_bans (user_id, reason, banned_by_user_id, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id)
     DO UPDATE SET
       reason = EXCLUDED.reason,
       banned_by_user_id = EXCLUDED.banned_by_user_id,
       expires_at = EXCLUDED.expires_at,
       created_at = NOW()
     RETURNING id, user_id, reason, banned_by_user_id, expires_at, created_at`,
    [input.targetUserId, reason, input.actorUserId, expiresAt]
  );

  await writeServerAuditEvent({
    action: "service.ban.applied",
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    meta: {
      reason,
      expiresAt,
      banId: result.rows[0]?.id || null
    }
  });

  const actorName = await resolveUserName(input.actorUserId);
  void emitModerationInboxEvent({
    actorUserId: input.actorUserId,
    actorUserName: actorName,
    targetUserId: input.targetUserId,
    action: "service.ban.applied",
    title: "Your account was restricted",
    body: reason
      ? `Reason: ${reason}`
      : "A moderator applied a service-level restriction"
  });

  return result.rows[0];
}

export async function revokeServiceBan(input: Pick<BaseBanInput, "actorUserId" | "targetUserId">): Promise<boolean> {
  if (input.actorUserId === input.targetUserId) {
    throw new Error("invalid_action");
  }

  const result = await db.query(
    `DELETE FROM service_bans
     WHERE user_id = $1`,
    [input.targetUserId]
  );

  await writeServerAuditEvent({
    action: "service.ban.revoked",
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    meta: {
      revoked: (result.rowCount || 0) > 0
    }
  });

  if ((result.rowCount || 0) > 0) {
    const actorName = await resolveUserName(input.actorUserId);
    void emitModerationInboxEvent({
      actorUserId: input.actorUserId,
      actorUserName: actorName,
      targetUserId: input.targetUserId,
      action: "service.ban.revoked",
      title: "Your account restriction was removed",
      body: "A moderator removed a service-level restriction"
    });
  }

  return (result.rowCount || 0) > 0;
}
