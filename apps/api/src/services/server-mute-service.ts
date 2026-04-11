import { db } from "../db.js";
import type { ServerMemberRole, ServerMuteRow } from "../db.types.ts";
import { writeServerAuditEvent } from "./server-audit-service.js";
import { emitModerationInboxEvent } from "./notification-inbox-service.js";
import { resolveEffectiveServerPermissions } from "./server-permissions-service.js";

type ServerMuteInput = {
  serverId: string;
  actorUserId: string;
  targetUserId: string;
  reason?: string | null;
  expiresAt?: string | null;
};

export type ServerMuteState = {
  isMuted: boolean;
  expiresAt: string | null;
  retryAfterSec: number | null;
  reason: string | null;
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

  return String(result.rows[0]?.name || "Moderator").trim() || "Moderator";
}

function normalizeReason(reason?: string | null): string | null {
  const value = String(reason || "").trim();
  return value ? value.slice(0, 500) : null;
}

function normalizeExpiresAt(expiresAt?: string | null): string | null {
  const value = String(expiresAt || "").trim();
  if (!value) {
    return null;
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("invalid_expires_at");
  }

  return timestamp.toISOString();
}

export async function applyServerMute(input: ServerMuteInput): Promise<ServerMuteRow> {
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
  if (!targetRole) {
    throw new Error("target_not_member");
  }

  if (targetRole === "owner") {
    throw new Error("protected_user");
  }

  if ((actorRole === "admin" || actorRole === "member") && targetRole === "admin") {
    throw new Error("protected_user");
  }

  const reason = normalizeReason(input.reason);
  const expiresAt = normalizeExpiresAt(input.expiresAt);

  const result = await db.query<ServerMuteRow>(
    `INSERT INTO server_mutes (server_id, user_id, reason, muted_by_user_id, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (server_id, user_id)
     DO UPDATE SET
       reason = EXCLUDED.reason,
       muted_by_user_id = EXCLUDED.muted_by_user_id,
       expires_at = EXCLUDED.expires_at,
       created_at = NOW()
     RETURNING id, server_id, user_id, reason, muted_by_user_id, expires_at, created_at`,
    [input.serverId, input.targetUserId, reason, input.actorUserId, expiresAt]
  );

  await writeServerAuditEvent({
    action: "server.mute.applied",
    serverId: input.serverId,
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    meta: {
      reason,
      expiresAt,
      muteId: result.rows[0]?.id || null
    }
  });

  const actorName = await resolveUserName(input.actorUserId);
  void emitModerationInboxEvent({
    actorUserId: input.actorUserId,
    actorUserName: actorName,
    targetUserId: input.targetUserId,
    action: "server.mute.applied",
    title: "You were muted in a server",
    body: reason
      ? `Reason: ${reason}`
      : "A moderator muted your messaging in this server",
    serverId: input.serverId
  });

  return result.rows[0];
}

export async function revokeServerMute(input: Pick<ServerMuteInput, "serverId" | "actorUserId" | "targetUserId">): Promise<boolean> {
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
    `DELETE FROM server_mutes
     WHERE server_id = $1
       AND user_id = $2`,
    [input.serverId, input.targetUserId]
  );

  await writeServerAuditEvent({
    action: "server.mute.revoked",
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
      action: "server.mute.revoked",
      title: "Your server mute was revoked",
      body: "A moderator restored your messaging in this server",
      serverId: input.serverId
    });
  }

  return (result.rowCount || 0) > 0;
}

export async function resolveActiveServerMute(serverId: string, userId: string): Promise<ServerMuteState> {
  const result = await db.query<ServerMuteRow>(
    `SELECT id, server_id, user_id, reason, muted_by_user_id, expires_at, created_at
     FROM server_mutes
     WHERE server_id = $1
       AND user_id = $2
     LIMIT 1`,
    [serverId, userId]
  );

  const mute = result.rows[0];
  if (!mute) {
    return {
      isMuted: false,
      expiresAt: null,
      retryAfterSec: null,
      reason: null
    };
  }

  if (mute.expires_at) {
    const expiresAtMs = new Date(mute.expires_at).getTime();
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      await db.query(
        `DELETE FROM server_mutes
         WHERE server_id = $1
           AND user_id = $2`,
        [serverId, userId]
      );

      return {
        isMuted: false,
        expiresAt: null,
        retryAfterSec: null,
        reason: null
      };
    }

    const retryAfterSec = Number.isFinite(expiresAtMs)
      ? Math.max(1, Math.ceil((expiresAtMs - Date.now()) / 1000))
      : null;

    return {
      isMuted: true,
      expiresAt: mute.expires_at,
      retryAfterSec,
      reason: mute.reason
    };
  }

  return {
    isMuted: true,
    expiresAt: null,
    retryAfterSec: null,
    reason: mute.reason
  };
}
