// DM-сервис: блокировка и контакты.
import { db } from "../db.js";

// ─── block list ─────────────────────────────────────────

export async function blockUser(ownerUserId: string, blockedUserId: string): Promise<void> {
  if (ownerUserId === blockedUserId) {
    throw new Error("dm_block_self");
  }

  await db.query(
    `INSERT INTO dm_block_list (owner_user_id, blocked_user_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [ownerUserId, blockedUserId]
  );
}

export async function unblockUser(ownerUserId: string, blockedUserId: string): Promise<void> {
  await db.query(
    `DELETE FROM dm_block_list WHERE owner_user_id = $1 AND blocked_user_id = $2`,
    [ownerUserId, blockedUserId]
  );
}

export async function getBlockList(ownerUserId: string): Promise<Array<{ userId: string; name: string; createdAt: string }>> {
  const result = await db.query<{ userId: string; name: string; createdAt: string }>(
    `SELECT bl.blocked_user_id AS "userId", u.name, bl.created_at AS "createdAt"
     FROM dm_block_list bl
     JOIN users u ON u.id = bl.blocked_user_id
     WHERE bl.owner_user_id = $1
     ORDER BY bl.created_at DESC`,
    [ownerUserId]
  );
  return result.rows;
}

export async function isBlocked(ownerUserId: string, blockedUserId: string): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM dm_block_list WHERE owner_user_id = $1 AND blocked_user_id = $2`,
    [ownerUserId, blockedUserId]
  );
  return (result.rowCount || 0) > 0;
}

// ─── contacts ───────────────────────────────────────────

export type DmContact = {
  userId: string;
  name: string;
  email: string;
  source: "manual" | "dm_auto";
  createdAt: string;
};

export async function addContact(ownerUserId: string, contactUserId: string, source: "manual" | "dm_auto" = "manual"): Promise<void> {
  if (ownerUserId === contactUserId) {
    throw new Error("dm_contact_self");
  }

  await db.query(
    `INSERT INTO dm_contacts (owner_user_id, contact_user_id, source)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [ownerUserId, contactUserId, source]
  );
}

export async function removeContact(ownerUserId: string, contactUserId: string): Promise<void> {
  await db.query(
    `DELETE FROM dm_contacts WHERE owner_user_id = $1 AND contact_user_id = $2`,
    [ownerUserId, contactUserId]
  );
}

export async function getContacts(ownerUserId: string): Promise<DmContact[]> {
  const result = await db.query<DmContact>(
    `SELECT c.contact_user_id AS "userId", u.name, u.email, c.source, c.created_at AS "createdAt"
     FROM dm_contacts c
     JOIN users u ON u.id = c.contact_user_id
     WHERE c.owner_user_id = $1
     ORDER BY u.name ASC`,
    [ownerUserId]
  );
  return result.rows;
}

// ─── dm settings ────────────────────────────────────────

export type DmAllowPolicy = "contacts_only" | "mutual_servers" | "everyone";

export async function getDmSettings(userId: string): Promise<{ allowDmFrom: DmAllowPolicy }> {
  const result = await db.query<{ allow_dm_from: DmAllowPolicy }>(
    `SELECT allow_dm_from FROM dm_user_settings WHERE user_id = $1`,
    [userId]
  );
  return { allowDmFrom: result.rows[0]?.allow_dm_from || "everyone" };
}

export async function updateDmSettings(userId: string, allowDmFrom: DmAllowPolicy): Promise<void> {
  await db.query(
    `INSERT INTO dm_user_settings (user_id, allow_dm_from)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET allow_dm_from = $2, updated_at = now()`,
    [userId, allowDmFrom]
  );
}
