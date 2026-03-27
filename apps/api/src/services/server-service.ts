import { db } from "../db.js";
import type { ServerListItem, ServerContext, ServerMemberItem } from "../api-contract.types.ts";
import type { ServerMemberRole, UserRole } from "../db.types.ts";
import { writeServerAuditEvent } from "./server-audit-service.js";

type CreateServerInput = {
  name: string;
  ownerUserId: string;
  creatorRole: UserRole;
};

type RenameServerInput = {
  serverId: string;
  actorUserId: string;
  name: string;
};

type LeaveServerInput = {
  serverId: string;
  userId: string;
};

type RemoveServerMemberInput = {
  serverId: string;
  actorUserId: string;
  targetUserId: string;
};

function toSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  const normalizedBase = baseSlug || "server";
  let candidate = normalizedBase;

  for (let i = 0; i < 100; i += 1) {
    const result = await db.query<{ id: string }>("SELECT id FROM servers WHERE slug = $1 LIMIT 1", [candidate]);
    if ((result.rowCount || 0) === 0) {
      return candidate;
    }

    candidate = `${normalizedBase}-${i + 2}`.slice(0, 48);
  }

  return `${normalizedBase}-${Date.now().toString(36)}`.slice(0, 48);
}

async function mapServerByIdForUser(serverId: string, userId: string): Promise<ServerListItem | null> {
  const result = await db.query<ServerListItem>(
    `SELECT
       s.id,
       s.slug,
       s.name,
       sm.role,
       (
         SELECT COUNT(*)::int
         FROM server_members smc
         WHERE smc.server_id = s.id AND smc.status = 'active'
       ) AS "membersCount"
     FROM servers s
     JOIN server_members sm ON sm.server_id = s.id
     WHERE s.id = $1
       AND sm.user_id = $2
       AND sm.status = 'active'
     LIMIT 1`,
    [serverId, userId]
  );

  return result.rows[0] || null;
}

export async function createServerForUser(input: CreateServerInput): Promise<ServerListItem> {
  const ownerUserId = String(input.ownerUserId || "").trim();
  const trimmedName = String(input.name || "").trim();
  const creatorRole: UserRole = input.creatorRole;

  if (creatorRole !== "super_admin") {
    const ownerServers = await db.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM servers WHERE owner_user_id = $1",
      [ownerUserId]
    );

    const ownedCount = Number(ownerServers.rows[0]?.count || "0");
    if (ownedCount >= 1) {
      throw new Error("server_limit_reached");
    }
  }

  const uniqueSlug = await ensureUniqueSlug(toSlug(trimmedName) || "server");

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const insertedServer = await client.query<{ id: string; slug: string; name: string }>(
      `INSERT INTO servers (slug, name, owner_user_id)
       VALUES ($1, $2, $3)
       RETURNING id, slug, name`,
      [uniqueSlug, trimmedName, ownerUserId]
    );

    const server = insertedServer.rows[0];
    await client.query(
      `INSERT INTO server_members (server_id, user_id, role, status)
       VALUES ($1, $2, 'owner', 'active')
       ON CONFLICT (server_id, user_id) DO UPDATE SET role = 'owner', status = 'active'`,
      [server.id, ownerUserId]
    );

    await writeServerAuditEvent({
      client,
      action: "server.created",
      serverId: server.id,
      actorUserId: ownerUserId,
      meta: {
        slug: server.slug,
        name: server.name
      }
    });

    await client.query("COMMIT");

    return {
      id: server.id,
      slug: server.slug,
      name: server.name,
      role: "owner",
      membersCount: 1
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listUserServers(userId: string): Promise<ServerListItem[]> {
  const result = await db.query<ServerListItem>(
    `SELECT
       s.id,
       s.slug,
       s.name,
       sm.role,
       (
         SELECT COUNT(*)::int
         FROM server_members smc
         WHERE smc.server_id = s.id AND smc.status = 'active'
       ) AS "membersCount"
     FROM server_members sm
     JOIN servers s ON s.id = sm.server_id
     WHERE sm.user_id = $1
       AND sm.status = 'active'
     ORDER BY s.is_default DESC, s.created_at ASC`,
    [userId]
  );

  return result.rows;
}

export async function getServerForUser(serverId: string, userId: string): Promise<ServerListItem | null> {
  return mapServerByIdForUser(serverId, userId);
}

export async function listServerMembers(serverId: string): Promise<ServerMemberItem[]> {
  const result = await db.query<ServerMemberItem>(
    `SELECT
       sm.user_id AS "userId",
       u.email,
       u.name,
       sm.role,
       sm.status
     FROM server_members sm
     JOIN users u ON u.id = sm.user_id
     WHERE sm.server_id = $1
       AND sm.status = 'active'
     ORDER BY
       CASE sm.role
         WHEN 'owner' THEN 0
         WHEN 'admin' THEN 1
         ELSE 2
       END,
       u.name ASC,
       u.email ASC`,
    [serverId]
  );

  return result.rows;
}

export async function renameServerForUser(input: RenameServerInput): Promise<ServerListItem | null> {
  const server = await mapServerByIdForUser(input.serverId, input.actorUserId);
  if (!server) {
    return null;
  }

  const allowedRoles = new Set<ServerMemberRole>(["owner", "admin"]);
  if (!allowedRoles.has(server.role)) {
    throw new Error("forbidden_role");
  }

  const trimmedName = String(input.name || "").trim();
  const previousName = server.name;
  await db.query(
    `UPDATE servers
     SET name = $2, updated_at = NOW()
     WHERE id = $1`,
    [input.serverId, trimmedName]
  );

  await writeServerAuditEvent({
    action: "server.renamed",
    serverId: input.serverId,
    actorUserId: input.actorUserId,
    meta: {
      previousName,
      nextName: trimmedName,
      actorRole: server.role
    }
  });

  return mapServerByIdForUser(input.serverId, input.actorUserId);
}

export async function getDefaultServerContextForUser(userId: string): Promise<ServerContext | null> {
  const result = await db.query<ServerContext>(
    `SELECT s.id, s.slug, s.name, sm.role
     FROM servers s
     JOIN server_members sm ON sm.server_id = s.id
     WHERE s.is_default = TRUE
       AND sm.user_id = $1
       AND sm.status = 'active'
     ORDER BY s.created_at ASC
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}

export async function leaveServerForUser(input: LeaveServerInput): Promise<{ left: boolean }> {
  const actor = await mapServerByIdForUser(input.serverId, input.userId);
  if (!actor) {
    return { left: false };
  }

  if (actor.role === "owner") {
    throw new Error("owner_cannot_leave");
  }

  const updated = await db.query(
    `UPDATE server_members
     SET status = 'left'
     WHERE server_id = $1
       AND user_id = $2
       AND status = 'active'`,
    [input.serverId, input.userId]
  );

  if ((updated.rowCount || 0) === 0) {
    return { left: false };
  }

  await writeServerAuditEvent({
    action: "server.member.left",
    serverId: input.serverId,
    actorUserId: input.userId,
    targetUserId: input.userId,
    meta: {
      role: actor.role
    }
  });

  return { left: true };
}

export async function removeServerMemberForUser(input: RemoveServerMemberInput): Promise<{ removed: boolean }> {
  const actor = await mapServerByIdForUser(input.serverId, input.actorUserId);
  if (!actor) {
    return { removed: false };
  }

  if (input.actorUserId === input.targetUserId) {
    throw new Error("use_leave_for_self");
  }

  const target = await mapServerByIdForUser(input.serverId, input.targetUserId);
  if (!target) {
    return { removed: false };
  }

  if (target.role === "owner") {
    throw new Error("owner_cannot_be_removed");
  }

  if (actor.role === "member") {
    throw new Error("forbidden_role");
  }

  if (actor.role === "admin" && target.role !== "member") {
    throw new Error("forbidden_role");
  }

  const updated = await db.query(
    `UPDATE server_members
     SET status = 'removed'
     WHERE server_id = $1
       AND user_id = $2
       AND status = 'active'`,
    [input.serverId, input.targetUserId]
  );

  if ((updated.rowCount || 0) === 0) {
    return { removed: false };
  }

  await writeServerAuditEvent({
    action: "server.member.removed",
    serverId: input.serverId,
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    meta: {
      actorRole: actor.role,
      targetRole: target.role
    }
  });

  return { removed: true };
}
