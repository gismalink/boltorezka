import { db } from "../db.js";
import type { ServerListItem, ServerContext } from "../api-contract.types.ts";
import type { ServerMemberRole } from "../db.types.ts";

type CreateServerInput = {
  name: string;
  ownerUserId: string;
};

type RenameServerInput = {
  serverId: string;
  actorUserId: string;
  name: string;
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

  const ownerServers = await db.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM servers WHERE owner_user_id = $1",
    [ownerUserId]
  );

  const ownedCount = Number(ownerServers.rows[0]?.count || "0");
  if (ownedCount >= 1) {
    throw new Error("server_limit_reached");
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

export async function renameServerForUser(input: RenameServerInput): Promise<ServerListItem | null> {
  const server = await mapServerByIdForUser(input.serverId, input.actorUserId);
  if (!server) {
    return null;
  }

  const allowedRoles = new Set<ServerMemberRole>(["owner", "admin", "member"]);
  if (!allowedRoles.has(server.role)) {
    throw new Error("forbidden_role");
  }

  const trimmedName = String(input.name || "").trim();
  await db.query(
    `UPDATE servers
     SET name = $2, updated_at = NOW()
     WHERE id = $1`,
    [input.serverId, trimmedName]
  );

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
