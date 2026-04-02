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

type TransferServerOwnershipInput = {
  serverId: string;
  actorUserId: string;
  targetUserId: string;
};

type DeleteServerInput = {
  serverId: string;
  actorUserId: string;
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
    const result = await db.query<{ id: string }>("SELECT id FROM servers WHERE slug = $1 AND is_archived = FALSE LIMIT 1", [candidate]);
    if ((result.rowCount || 0) === 0) {
      return candidate;
    }

    candidate = `${normalizedBase}-${i + 2}`.slice(0, 48);
  }

  return `${normalizedBase}-${Date.now().toString(36)}`.slice(0, 48);
}

async function ensureUniqueRoomSlug(client: { query: typeof db.query }, baseSlug: string): Promise<string> {
  const normalizedBase = baseSlug || "general";
  let candidate = normalizedBase;

  for (let i = 0; i < 100; i += 1) {
    const result = await client.query<{ id: string }>("SELECT id FROM rooms WHERE slug = $1 LIMIT 1", [candidate]);
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
       AND s.is_archived = FALSE
       AND s.is_blocked = FALSE
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
      "SELECT COUNT(*)::text AS count FROM servers WHERE owner_user_id = $1 AND is_archived = FALSE",
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

    const generalRoomSlug = await ensureUniqueRoomSlug(client, "general");
    const createdRoom = await client.query<{ id: string }>(
      `INSERT INTO rooms (slug, title, kind, category_id, audio_quality_override, position, is_public, created_by, server_id)
       VALUES ($1, $2, 'text', NULL, NULL, 0, TRUE, $3, $4)
       RETURNING id`,
      [generalRoomSlug, "general", ownerUserId, server.id]
    );

    const createdRoomId = String(createdRoom.rows[0]?.id || "").trim();
    if (createdRoomId) {
      await client.query(
        `INSERT INTO room_members (room_id, user_id, role)
         VALUES ($1, $2, 'owner')
         ON CONFLICT (room_id, user_id) DO NOTHING`,
        [createdRoomId, ownerUserId]
      );
    }

    await writeServerAuditEvent({
      client,
      action: "server.created",
      serverId: server.id,
      actorUserId: ownerUserId,
      meta: {
        slug: server.slug,
        name: server.name,
        defaultRoomSlug: generalRoomSlug
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
       AND s.is_archived = FALSE
       AND s.is_blocked = FALSE
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
       sm.status,
       sm.joined_at AS "joinedAt",
       COALESCE((
         SELECT json_agg(
           json_build_object('id', scr.id, 'name', scr.name)
           ORDER BY scr.name ASC
         )
         FROM server_member_custom_roles smcr
         JOIN server_custom_roles scr ON scr.id = smcr.role_id
         WHERE smcr.server_id = sm.server_id
           AND smcr.user_id = sm.user_id
       ), '[]'::json) AS "customRoles",
       EXISTS (
         SELECT 1
         FROM server_bans sb
         WHERE sb.server_id = sm.server_id
           AND sb.user_id = sm.user_id
           AND (sb.expires_at IS NULL OR sb.expires_at > NOW())
       ) AS "isServerBanned"
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
       AND s.is_archived = FALSE
       AND s.is_blocked = FALSE
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

export async function transferServerOwnershipForUser(
  input: TransferServerOwnershipInput
): Promise<{ transferred: boolean }> {
  const actor = await mapServerByIdForUser(input.serverId, input.actorUserId);
  if (!actor) {
    return { transferred: false };
  }

  if (actor.role !== "owner") {
    throw new Error("forbidden_role");
  }

  if (input.actorUserId === input.targetUserId) {
    throw new Error("transfer_to_self");
  }

  const target = await mapServerByIdForUser(input.serverId, input.targetUserId);
  if (!target) {
    throw new Error("target_not_member");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const ownerUpdate = await client.query(
      `UPDATE servers
       SET owner_user_id = $2,
           updated_at = NOW()
       WHERE id = $1
         AND owner_user_id = $3`,
      [input.serverId, input.targetUserId, input.actorUserId]
    );

    if ((ownerUpdate.rowCount || 0) === 0) {
      throw new Error("owner_changed");
    }

    await client.query(
      `UPDATE server_members
       SET role = 'admin',
           status = 'active'
       WHERE server_id = $1
         AND user_id = $2`,
      [input.serverId, input.actorUserId]
    );

    await client.query(
      `INSERT INTO server_members (server_id, user_id, role, status)
       VALUES ($1, $2, 'owner', 'active')
       ON CONFLICT (server_id, user_id)
       DO UPDATE SET role = 'owner', status = 'active'`,
      [input.serverId, input.targetUserId]
    );

    await writeServerAuditEvent({
      client,
      action: "server.owner.transferred",
      serverId: input.serverId,
      actorUserId: input.actorUserId,
      targetUserId: input.targetUserId,
      meta: {
        previousOwnerUserId: input.actorUserId,
        nextOwnerUserId: input.targetUserId,
        previousTargetRole: target.role
      }
    });

    await client.query("COMMIT");
    return { transferred: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteServerForUser(input: DeleteServerInput): Promise<{ deleted: boolean }> {
  const actor = await mapServerByIdForUser(input.serverId, input.actorUserId);
  if (!actor) {
    return { deleted: false };
  }

  if (actor.role !== "owner") {
    throw new Error("forbidden_role");
  }

  const serverState = await db.query<{ is_default: boolean; is_archived: boolean }>(
    `SELECT is_default, is_archived
     FROM servers
     WHERE id = $1
     LIMIT 1`,
    [input.serverId]
  );

  const state = serverState.rows[0];
  if (!state || state.is_archived) {
    return { deleted: false };
  }

  if (state.is_default) {
    throw new Error("default_server_cannot_be_deleted");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const archived = await client.query(
      `UPDATE servers
       SET is_archived = TRUE,
           updated_at = NOW()
       WHERE id = $1
         AND is_archived = FALSE`,
      [input.serverId]
    );

    if ((archived.rowCount || 0) === 0) {
      await client.query("ROLLBACK");
      return { deleted: false };
    }

    const membershipUpdate = await client.query(
      `UPDATE server_members
       SET status = 'removed'
       WHERE server_id = $1
         AND status = 'active'`,
      [input.serverId]
    );

    await writeServerAuditEvent({
      client,
      action: "server.deleted",
      serverId: input.serverId,
      actorUserId: input.actorUserId,
      meta: {
        actorRole: actor.role,
        affectedActiveMembers: Number(membershipUpdate.rowCount || 0)
      }
    });

    await client.query("COMMIT");
    return { deleted: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
