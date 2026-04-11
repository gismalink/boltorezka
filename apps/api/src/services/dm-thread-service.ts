// DM-сервис: управление threads и проверка доступа к DM.
import { db } from "../db.js";

// ─── types ──────────────────────────────────────────────

export type DmThread = {
  id: string;
  userLowId: string;
  userHighId: string;
  createdAt: string;
  updatedAt: string;
};

export type DmThreadWithPeer = DmThread & {
  peerUserId: string;
  peerName: string;
  peerEmail: string;
};

// ─── helpers ────────────────────────────────────────────

function normalizeThreadPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

// ─── thread CRUD ────────────────────────────────────────

export async function findOrCreateThread(currentUserId: string, peerUserId: string): Promise<DmThread> {
  if (currentUserId === peerUserId) {
    throw new Error("dm_self_thread");
  }

  const [low, high] = normalizeThreadPair(currentUserId, peerUserId);

  // Upsert: вставить если нет, вернуть если есть.
  const result = await db.query<DmThread>(
    `INSERT INTO dm_threads (user_low_id, user_high_id)
     VALUES ($1, $2)
     ON CONFLICT (user_low_id, user_high_id) DO UPDATE SET updated_at = now()
     RETURNING id, user_low_id AS "userLowId", user_high_id AS "userHighId",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [low, high]
  );

  return result.rows[0];
}

export async function getThreadById(threadId: string): Promise<DmThread | null> {
  const result = await db.query<DmThread>(
    `SELECT id, user_low_id AS "userLowId", user_high_id AS "userHighId",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM dm_threads WHERE id = $1`,
    [threadId]
  );
  return result.rows[0] || null;
}

export async function getThreadsForUser(userId: string): Promise<DmThreadWithPeer[]> {
  const result = await db.query<DmThreadWithPeer>(
    `SELECT t.id, t.user_low_id AS "userLowId", t.user_high_id AS "userHighId",
            t.created_at AS "createdAt", t.updated_at AS "updatedAt",
            CASE WHEN t.user_low_id = $1 THEN t.user_high_id ELSE t.user_low_id END AS "peerUserId",
            u.name AS "peerName", u.email AS "peerEmail"
     FROM dm_threads t
     JOIN users u ON u.id = CASE WHEN t.user_low_id = $1 THEN t.user_high_id ELSE t.user_low_id END
     WHERE t.user_low_id = $1 OR t.user_high_id = $1
     ORDER BY t.updated_at DESC`,
    [userId]
  );
  return result.rows;
}

export function isThreadMember(thread: DmThread, userId: string): boolean {
  return thread.userLowId === userId || thread.userHighId === userId;
}

export function getThreadPeerUserId(thread: DmThread, currentUserId: string): string {
  return thread.userLowId === currentUserId ? thread.userHighId : thread.userLowId;
}

// ─── access policy ──────────────────────────────────────

export async function canSendDm(fromUserId: string, toUserId: string): Promise<{ allowed: boolean; reason?: string }> {
  // Block list check
  const blocked = await db.query(
    `SELECT 1 FROM dm_block_list WHERE owner_user_id = $1 AND blocked_user_id = $2`,
    [toUserId, fromUserId]
  );
  if (blocked.rowCount && blocked.rowCount > 0) {
    return { allowed: false, reason: "dm_blocked" };
  }

  // DM settings check
  const settings = await db.query<{ allow_dm_from: string }>(
    `SELECT allow_dm_from FROM dm_user_settings WHERE user_id = $1`,
    [toUserId]
  );
  const policy = settings.rows[0]?.allow_dm_from || "everyone";

  if (policy === "everyone") {
    return { allowed: true };
  }

  if (policy === "contacts_only") {
    const contact = await db.query(
      `SELECT 1 FROM dm_contacts WHERE owner_user_id = $1 AND contact_user_id = $2`,
      [toUserId, fromUserId]
    );
    if (contact.rowCount && contact.rowCount > 0) {
      return { allowed: true };
    }
    return { allowed: false, reason: "dm_policy_restricted" };
  }

  if (policy === "mutual_servers") {
    const mutual = await db.query(
      `SELECT 1 FROM server_members sm1
       JOIN server_members sm2 ON sm1.server_id = sm2.server_id
       WHERE sm1.user_id = $1 AND sm2.user_id = $2 LIMIT 1`,
      [fromUserId, toUserId]
    );
    if (mutual.rowCount && mutual.rowCount > 0) {
      return { allowed: true };
    }
    return { allowed: false, reason: "dm_policy_restricted" };
  }

  return { allowed: true };
}

// ─── read cursors ───────────────────────────────────────

export async function markThreadRead(threadId: string, userId: string, lastReadMessageId: string): Promise<void> {
  await db.query(
    `INSERT INTO dm_read_cursors (thread_id, user_id, last_read_message_id, last_read_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (thread_id, user_id) DO UPDATE
       SET last_read_message_id = EXCLUDED.last_read_message_id,
           last_read_at = now()`,
    [threadId, userId, lastReadMessageId]
  );
}

export async function getUnreadCountsForUser(userId: string): Promise<Record<string, number>> {
  const result = await db.query<{ thread_id: string; unread: string }>(
    `SELECT t.id AS thread_id,
            COUNT(m.id)::int AS unread
     FROM dm_threads t
     LEFT JOIN dm_read_cursors rc ON rc.thread_id = t.id AND rc.user_id = $1
     LEFT JOIN dm_messages m ON m.thread_id = t.id
       AND m.sender_user_id <> $1
       AND m.deleted_at IS NULL
       AND (rc.last_read_message_id IS NULL OR m.created_at > (
         SELECT created_at FROM dm_messages WHERE id = rc.last_read_message_id
       ))
     WHERE t.user_low_id = $1 OR t.user_high_id = $1
     GROUP BY t.id
     HAVING COUNT(m.id) > 0`,
    [userId]
  );

  const counts: Record<string, number> = {};
  for (const row of result.rows) {
    counts[row.thread_id] = Number(row.unread);
  }
  return counts;
}
