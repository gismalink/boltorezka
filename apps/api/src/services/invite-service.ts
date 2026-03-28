import { createHash, randomBytes } from "node:crypto";
import { db } from "../db.js";
import type { ServerContext } from "../api-contract.types.ts";
import type { ServerMemberRole } from "../db.types.ts";
import { writeServerAuditEvent } from "./server-audit-service.js";

const ACTIVE_SERVER_INVITES_LIMIT = Math.max(
  1,
  Number.parseInt(String(process.env.SERVER_ACTIVE_INVITES_LIMIT || "20"), 10) || 20
);

type CreateInviteInput = {
  serverId: string;
  actorUserId: string;
  ttlHours?: number;
  maxUses?: number;
};

type AcceptInviteInput = {
  token: string;
  userId: string;
};

type InviteCreateResult = {
  token: string;
  expiresAt: string | null;
};

type InviteRow = {
  id: string;
  server_id: string;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  is_revoked: boolean;
};

type MembershipRow = {
  role: ServerMemberRole;
  status: string;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

function toExpiresAt(ttlHours?: number): string | null {
  if (typeof ttlHours !== "number" || !Number.isFinite(ttlHours) || ttlHours <= 0) {
    return null;
  }

  const ttlMs = Math.floor(ttlHours * 60 * 60 * 1000);
  return new Date(Date.now() + ttlMs).toISOString();
}

async function getServerRole(serverId: string, userId: string): Promise<ServerMemberRole | null> {
  const membership = await db.query<{ role: ServerMemberRole }>(
    `SELECT role
     FROM server_members sm
     JOIN servers s ON s.id = sm.server_id
     WHERE sm.server_id = $1
       AND s.is_archived = FALSE
       AND sm.user_id = $2
       AND status = 'active'
     LIMIT 1`,
    [serverId, userId]
  );

  return membership.rows[0]?.role || null;
}

export async function createServerInvite(input: CreateInviteInput): Promise<InviteCreateResult> {
  const actorRole = await getServerRole(input.serverId, input.actorUserId);
  if (actorRole !== "owner" && actorRole !== "admin") {
    throw new Error("forbidden_role");
  }

  const activeInvitesResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM server_invites
     WHERE server_id = $1
       AND is_revoked = FALSE
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_uses IS NULL OR used_count < max_uses)`,
    [input.serverId]
  );

  const activeInvitesCount = Number(activeInvitesResult.rows[0]?.count || "0");
  if (activeInvitesCount >= ACTIVE_SERVER_INVITES_LIMIT) {
    throw new Error("active_invite_limit_reached");
  }

  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = toExpiresAt(input.ttlHours);
  const maxUses = typeof input.maxUses === "number" && Number.isFinite(input.maxUses) && input.maxUses > 0
    ? Math.floor(input.maxUses)
    : null;

  await db.query(
    `INSERT INTO server_invites (server_id, token_hash, created_by_user_id, expires_at, max_uses)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.serverId, tokenHash, input.actorUserId, expiresAt, maxUses]
  );

  await writeServerAuditEvent({
    action: "server.invite.created",
    serverId: input.serverId,
    actorUserId: input.actorUserId,
    meta: {
      ttlHours: typeof input.ttlHours === "number" ? input.ttlHours : null,
      maxUses
    }
  });

  return {
    token,
    expiresAt
  };
}

export async function acceptServerInvite(input: AcceptInviteInput): Promise<ServerContext> {
  const tokenHash = hashToken(input.token);
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const inviteResult = await client.query<InviteRow>(
      `SELECT id, server_id, expires_at, max_uses, used_count, is_revoked
       FROM server_invites
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash]
    );

    const invite = inviteResult.rows[0];
    if (!invite) {
      throw new Error("invite_not_found");
    }

    if (invite.is_revoked) {
      throw new Error("invite_revoked");
    }

    if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
      throw new Error("invite_expired");
    }

    if (typeof invite.max_uses === "number" && invite.used_count >= invite.max_uses) {
      throw new Error("invite_limit_reached");
    }

    const serverBanResult = await client.query<{ id: string }>(
      `SELECT id
       FROM server_bans
       WHERE server_id = $1
         AND user_id = $2
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [invite.server_id, input.userId]
    );

    if ((serverBanResult.rowCount || 0) > 0) {
      throw new Error("server_banned");
    }

    const existingMembershipResult = await client.query<MembershipRow>(
      `SELECT role, status
       FROM server_members
       WHERE server_id = $1
         AND user_id = $2
       FOR UPDATE`,
      [invite.server_id, input.userId]
    );

    const existingMembership = existingMembershipResult.rows[0] || null;
    if (existingMembership && existingMembership.status === "active") {
      const contextResult = await client.query<ServerContext>(
        `SELECT s.id, s.slug, s.name, sm.role
         FROM servers s
         JOIN server_members sm ON sm.server_id = s.id
         WHERE s.id = $1
           AND s.is_archived = FALSE
           AND sm.user_id = $2
           AND sm.status = 'active'
         LIMIT 1`,
        [invite.server_id, input.userId]
      );

      const context = contextResult.rows[0];
      if (!context) {
        throw new Error("invite_accept_failed");
      }

      await writeServerAuditEvent({
        client,
        action: "server.invite.accepted_idempotent",
        serverId: invite.server_id,
        actorUserId: input.userId,
        targetUserId: input.userId,
        meta: {
          inviteId: invite.id
        }
      });

      await client.query("COMMIT");
      return context;
    }

    await client.query(
      `UPDATE server_invites
       SET used_count = used_count + 1
       WHERE id = $1`,
      [invite.id]
    );

    await client.query(
      `INSERT INTO server_members (server_id, user_id, role, status)
       VALUES ($1, $2, 'member', 'active')
       ON CONFLICT (server_id, user_id)
       DO UPDATE SET
         status = 'active',
         role = CASE
           WHEN server_members.role IN ('owner', 'admin') THEN server_members.role
           ELSE 'member'
         END`,
      [invite.server_id, input.userId]
    );

    const contextResult = await client.query<ServerContext>(
      `SELECT s.id, s.slug, s.name, sm.role
       FROM servers s
       JOIN server_members sm ON sm.server_id = s.id
       WHERE s.id = $1
         AND s.is_archived = FALSE
         AND sm.user_id = $2
         AND sm.status = 'active'
       LIMIT 1`,
      [invite.server_id, input.userId]
    );

    const context = contextResult.rows[0];
    if (!context) {
      throw new Error("invite_accept_failed");
    }

    await writeServerAuditEvent({
      client,
      action: "server.invite.accepted",
      serverId: invite.server_id,
      actorUserId: input.userId,
      targetUserId: input.userId,
      meta: {
        inviteId: invite.id
      }
    });

    await client.query("COMMIT");
    return context;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
