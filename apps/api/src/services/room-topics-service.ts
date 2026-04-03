import { db } from "../db.js";
import type { RoomTopicRow, UserRole } from "../db.types.ts";

export type TopicListItem = {
  id: string;
  roomId: string;
  createdBy: string | null;
  slug: string;
  title: string;
  position: number;
  isPinned: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
  mentionUnreadCount: number;
};

type CreateRoomTopicInput = {
  roomId: string;
  actorUserId: string;
  title: string;
  slug?: string;
  position?: number;
};

type UpdateRoomTopicInput = {
  topicId: string;
  actorUserId: string;
  title?: string;
  slug?: string;
  isPinned?: boolean;
  position?: number;
};

type ArchiveRoomTopicInput = {
  topicId: string;
  actorUserId: string;
  archived: boolean;
};

type DeleteRoomTopicInput = {
  topicId: string;
  actorUserId: string;
};

type RoomAccessRow = {
  id: string;
  server_id: string | null;
  is_public: boolean;
  is_hidden: boolean;
};

function toSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function getActorRole(userId: string): Promise<UserRole | null> {
  const result = await db.query<{ role: UserRole }>(
    `SELECT role
     FROM users
     WHERE id = $1
       AND access_state = 'active'
       AND is_banned = FALSE
     LIMIT 1`,
    [userId]
  );

  return result.rows[0]?.role || null;
}

async function loadRoom(roomId: string): Promise<RoomAccessRow> {
  const roomResult = await db.query<RoomAccessRow>(
    `SELECT id, server_id, is_public, is_hidden
     FROM rooms
     WHERE id = $1
       AND is_archived = FALSE
     LIMIT 1`,
    [roomId]
  );

  const room = roomResult.rows[0];
  if (!room) {
    throw new Error("room_not_found");
  }

  return room;
}

async function hasRoomMembership(roomId: string, userId: string): Promise<boolean> {
  const membership = await db.query(
    `SELECT 1
     FROM room_members
     WHERE room_id = $1
       AND user_id = $2
     LIMIT 1`,
    [roomId, userId]
  );

  return (membership.rowCount || 0) > 0;
}

async function hasHiddenRoomAccess(roomId: string, userId: string): Promise<boolean> {
  const grants = await db.query<{ has_access: boolean }>(
    `SELECT EXISTS(
        SELECT 1
        FROM room_visibility_grants
        WHERE room_id = $1
          AND user_id = $2
      ) OR EXISTS(
        SELECT 1
        FROM room_members
        WHERE room_id = $1
          AND user_id = $2
      ) AS has_access`,
    [roomId, userId]
  );

  return Boolean(grants.rows[0]?.has_access);
}

async function isServerModerator(serverId: string, userId: string): Promise<boolean> {
  const membership = await db.query<{ role: string }>(
    `SELECT role
     FROM server_members
     WHERE server_id = $1
       AND user_id = $2
       AND status = 'active'
     LIMIT 1`,
    [serverId, userId]
  );

  const role = membership.rows[0]?.role;
  return role === "owner" || role === "admin";
}

async function ensureReadAccess(roomId: string, userId: string): Promise<void> {
  const room = await loadRoom(roomId);

  if (room.is_hidden) {
    const allowed = await hasHiddenRoomAccess(room.id, userId);
    if (!allowed) {
      throw new Error("forbidden_room_access");
    }
  }

  if (!room.is_public) {
    const isMember = await hasRoomMembership(room.id, userId);
    if (!isMember) {
      throw new Error("forbidden_room_access");
    }
  }
}

async function ensureManageAccess(roomId: string, userId: string): Promise<void> {
  const actorRole = await getActorRole(userId);
  if (actorRole === "admin" || actorRole === "super_admin") {
    return;
  }

  const room = await loadRoom(roomId);
  if (!room.server_id) {
    throw new Error("forbidden_topic_manage");
  }

  const canManage = await isServerModerator(room.server_id, userId);
  if (!canManage) {
    throw new Error("forbidden_topic_manage");
  }
}

async function ensureUniqueTopicSlug(roomId: string, rawSlug: string): Promise<string> {
  const base = toSlug(rawSlug) || "topic";
  let candidate = base;

  for (let i = 0; i < 100; i += 1) {
    const existing = await db.query<{ id: string }>(
      `SELECT id
       FROM room_topics
       WHERE room_id = $1
         AND slug = $2
       LIMIT 1`,
      [roomId, candidate]
    );

    if ((existing.rowCount || 0) === 0) {
      return candidate;
    }

    candidate = `${base}-${i + 2}`.slice(0, 64);
  }

  return `${base}-${Date.now().toString(36)}`.slice(0, 64);
}

function mapTopic(row: RoomTopicRow & { unread_count?: string | number | null; mention_unread_count?: string | number | null }): TopicListItem {
  return {
    id: row.id,
    roomId: row.room_id,
    createdBy: row.created_by,
    slug: row.slug,
    title: row.title,
    position: row.position,
    isPinned: row.is_pinned,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    unreadCount: Number(row.unread_count || 0),
    mentionUnreadCount: Number(row.mention_unread_count || 0)
  };
}

export async function listRoomTopics(roomId: string, userId: string): Promise<TopicListItem[]> {
  await ensureReadAccess(roomId, userId);

  const result = await db.query<RoomTopicRow & { unread_count: string; mention_unread_count: string }>(
    `SELECT
       rt.id,
       rt.room_id,
       rt.slug,
       rt.title,
       rt.created_by,
       rt.position,
       rt.is_pinned,
       rt.archived_at,
       rt.created_at,
       rt.updated_at,
       GREATEST(
         0,
         (
           SELECT COUNT(*)::int
           FROM messages m
           WHERE m.topic_id = rt.id
             AND m.created_at > COALESCE(rr.last_read_at, to_timestamp(0))
         )
       ) AS unread_count,
       GREATEST(
         0,
         (
           SELECT COUNT(*)::int
           FROM messages m
           WHERE m.topic_id = rt.id
             AND m.user_id <> $2
             AND m.created_at > COALESCE(rr.last_read_at, to_timestamp(0))
             AND (
               (NULLIF(BTRIM(au.name), '') IS NOT NULL AND POSITION(LOWER(CONCAT('@', au.name)) IN LOWER(m.body)) > 0)
               OR (NULLIF(BTRIM(au.username), '') IS NOT NULL AND POSITION(LOWER(CONCAT('@', au.username)) IN LOWER(m.body)) > 0)
             )
         )
       ) AS mention_unread_count
     FROM room_topics rt
     LEFT JOIN room_reads rr ON rr.topic_id = rt.id AND rr.user_id = $2
     LEFT JOIN users au ON au.id = $2
     WHERE rt.room_id = $1
     ORDER BY rt.is_pinned DESC, rt.position ASC, rt.created_at DESC`,
    [roomId, userId]
  );

  return result.rows.map(mapTopic);
}

export async function createRoomTopic(input: CreateRoomTopicInput): Promise<TopicListItem> {
  await ensureManageAccess(input.roomId, input.actorUserId);

  const slug = await ensureUniqueTopicSlug(input.roomId, input.slug || input.title);
  const topicResult = await db.query<RoomTopicRow>(
    `INSERT INTO room_topics (room_id, slug, title, position, created_by)
     VALUES ($1, $2, $3, COALESCE($4, 0), $5)
     RETURNING id, room_id, slug, title, created_by, position, is_pinned, archived_at, created_at, updated_at`,
    [input.roomId, slug, input.title.trim(), input.position ?? null, input.actorUserId]
  );

  const topic = topicResult.rows[0];
  if (!topic) {
    throw new Error("topic_create_failed");
  }

  return mapTopic(topic);
}

export async function updateRoomTopic(input: UpdateRoomTopicInput): Promise<TopicListItem> {
  const topicResult = await db.query<RoomTopicRow>(
    `SELECT id, room_id, slug, title, created_by, position, is_pinned, archived_at, created_at, updated_at
     FROM room_topics
     WHERE id = $1
     LIMIT 1`,
    [input.topicId]
  );

  const current = topicResult.rows[0];
  if (!current) {
    throw new Error("topic_not_found");
  }

  await ensureManageAccess(current.room_id, input.actorUserId);

  const nextSlug = typeof input.slug === "string" && input.slug.trim().length > 0
    ? await ensureUniqueTopicSlug(current.room_id, input.slug)
    : current.slug;

  const nextTitle = typeof input.title === "string" && input.title.trim().length > 0
    ? input.title.trim().slice(0, 160)
    : current.title;

  const updateResult = await db.query<RoomTopicRow>(
    `UPDATE room_topics
     SET
       slug = $2,
       title = $3,
       is_pinned = COALESCE($4, is_pinned),
       position = COALESCE($5, position),
       updated_at = NOW()
     WHERE id = $1
     RETURNING id, room_id, slug, title, created_by, position, is_pinned, archived_at, created_at, updated_at`,
    [input.topicId, nextSlug, nextTitle, input.isPinned ?? null, input.position ?? null]
  );

  const updated = updateResult.rows[0];
  if (!updated) {
    throw new Error("topic_update_failed");
  }

  return mapTopic(updated);
}

export async function setRoomTopicArchived(input: ArchiveRoomTopicInput): Promise<TopicListItem> {
  const topicResult = await db.query<RoomTopicRow>(
    `SELECT id, room_id, slug, title, created_by, position, is_pinned, archived_at, created_at, updated_at
     FROM room_topics
     WHERE id = $1
     LIMIT 1`,
    [input.topicId]
  );

  const topic = topicResult.rows[0];
  if (!topic) {
    throw new Error("topic_not_found");
  }

  await ensureManageAccess(topic.room_id, input.actorUserId);

  const result = await db.query<RoomTopicRow>(
    `UPDATE room_topics
     SET archived_at = CASE WHEN $2::boolean THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, room_id, slug, title, created_by, position, is_pinned, archived_at, created_at, updated_at`,
    [input.topicId, input.archived]
  );

  const updated = result.rows[0];
  if (!updated) {
    throw new Error("topic_archive_failed");
  }

  return mapTopic(updated);
}

export async function deleteRoomTopicWithMessages(input: DeleteRoomTopicInput): Promise<{ topic: TopicListItem; deletedMessagesCount: number }> {
  const topicResult = await db.query<RoomTopicRow>(
    `SELECT id, room_id, slug, title, created_by, position, is_pinned, archived_at, created_at, updated_at
     FROM room_topics
     WHERE id = $1
     LIMIT 1`,
    [input.topicId]
  );

  const topic = topicResult.rows[0];
  if (!topic) {
    throw new Error("topic_not_found");
  }

  await ensureManageAccess(topic.room_id, input.actorUserId);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const deletedMessages = await client.query<{ deleted_count: string }>(
      `WITH deleted AS (
         DELETE FROM messages
         WHERE topic_id = $1
         RETURNING 1
       )
       SELECT COUNT(*)::text AS deleted_count FROM deleted`,
      [input.topicId]
    );

    const deletedTopic = await client.query<RoomTopicRow>(
      `DELETE FROM room_topics
       WHERE id = $1
       RETURNING id, room_id, slug, title, created_by, position, is_pinned, archived_at, created_at, updated_at`,
      [input.topicId]
    );

    const removedTopic = deletedTopic.rows[0];
    if (!removedTopic) {
      throw new Error("topic_delete_failed");
    }

    await client.query("COMMIT");

    return {
      topic: mapTopic(removedTopic),
      deletedMessagesCount: Number(deletedMessages.rows[0]?.deleted_count || 0)
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
