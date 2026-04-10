// Purpose: topic-scoped message lifecycle (list/create/edit/delete/reply/pin/reaction/read) with access control.
import { db } from "../db.js";
import { redis } from "../redis.js";
import { resolveActiveServerMute } from "./server-mute-service.js";
import { isReadPointerAdvance } from "./read-pointer.js";
import type { RoomMessageRow, RoomRow, RoomTopicRow } from "../db.types.ts";

type TopicWithRoomRow = {
  topic_id: string;
  topic_slug: string;
  topic_title: string;
  topic_archived_at: string | null;
  topic_created_at: string;
  topic_updated_at: string;
  room_id: string;
  room_slug: string;
  room_title: string;
  room_kind: RoomRow["kind"];
  room_audio_quality_override: RoomRow["audio_quality_override"];
  room_category_id: RoomRow["category_id"];
  room_server_id: string | null;
  room_nsfw: boolean | null;
  room_position: number;
  room_is_public: boolean;
  room_is_hidden: boolean;
  room_is_readonly: boolean;
  room_slowmode_seconds: number;
};

type MessageContextRow = TopicWithRoomRow & {
  message_id: string;
  message_user_id: string;
  message_user_name: string;
  message_body: string;
  message_created_at: string;
  message_updated_at: string | null;
};

export type TopicMessageCursor = {
  beforeCreatedAt: string;
  beforeId: string;
};

export type TopicMessagesPage = {
  room: RoomRow;
  topic: Pick<RoomTopicRow, "id" | "room_id" | "slug" | "title" | "archived_at" | "created_at" | "updated_at">;
  unreadDividerMessageId?: string | null;
  messages: RoomMessageRow[];
  pagination: {
    hasMore: boolean;
    nextCursor: TopicMessageCursor | null;
  };
};

const DEFAULT_AROUND_WINDOW_BEFORE = 25;
const DEFAULT_AROUND_WINDOW_AFTER = 25;
const MAX_AROUND_WINDOW = 100;

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

function mapRoom(topicRoom: TopicWithRoomRow): RoomRow {
  return {
    id: topicRoom.room_id,
    slug: topicRoom.room_slug,
    title: topicRoom.room_title,
    kind: topicRoom.room_kind,
    audio_quality_override: topicRoom.room_audio_quality_override,
    category_id: topicRoom.room_category_id,
    server_id: topicRoom.room_server_id || undefined,
    nsfw: topicRoom.room_nsfw || false,
    position: topicRoom.room_position,
    is_public: topicRoom.room_is_public,
    is_hidden: topicRoom.room_is_hidden,
    is_readonly: topicRoom.room_is_readonly,
    slowmode_seconds: topicRoom.room_slowmode_seconds
  };
}

async function loadTopicWithRoom(topicId: string): Promise<TopicWithRoomRow> {
  const topicResult = await db.query<TopicWithRoomRow>(
    `SELECT
       rt.id AS topic_id,
       rt.slug AS topic_slug,
       rt.title AS topic_title,
       rt.archived_at AS topic_archived_at,
      rt.created_at AS topic_created_at,
      rt.updated_at AS topic_updated_at,
       r.id AS room_id,
       r.slug AS room_slug,
       r.title AS room_title,
       r.kind AS room_kind,
       r.audio_quality_override AS room_audio_quality_override,
       r.category_id AS room_category_id,
       r.server_id AS room_server_id,
       r.nsfw AS room_nsfw,
       r.position AS room_position,
       r.is_public AS room_is_public,
       r.is_hidden AS room_is_hidden,
       r.is_readonly AS room_is_readonly,
       r.slowmode_seconds AS room_slowmode_seconds
     FROM room_topics rt
     JOIN rooms r ON r.id = rt.room_id
     WHERE rt.id = $1
       AND r.is_archived = FALSE
     LIMIT 1`,
    [topicId]
  );

  const topic = topicResult.rows[0];
  if (!topic) {
    throw new Error("topic_not_found");
  }

  return topic;
}

async function ensureTopicReadAccess(topic: TopicWithRoomRow, userId: string): Promise<void> {
  if (topic.room_is_hidden) {
    const allowed = await hasHiddenRoomAccess(topic.room_id, userId);
    if (!allowed) {
      throw new Error("forbidden_room_access");
    }
  }

  if (!topic.room_is_public) {
    const isMember = await hasRoomMembership(topic.room_id, userId);
    if (!isMember) {
      throw new Error("forbidden_room_access");
    }
  }
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

async function isGlobalModerator(userId: string): Promise<boolean> {
  const userResult = await db.query<{ role: string }>(
    `SELECT role
     FROM users
     WHERE id = $1
       AND is_banned = FALSE
     LIMIT 1`,
    [userId]
  );

  const role = userResult.rows[0]?.role;
  return role === "admin" || role === "super_admin";
}

async function canModerateMessage(topic: TopicWithRoomRow, userId: string): Promise<boolean> {
  if (await isGlobalModerator(userId)) {
    return true;
  }

  const serverId = String(topic.room_server_id || "").trim();
  if (!serverId) {
    return false;
  }

  return isServerModerator(serverId, userId);
}

async function canBypassRoomSendPolicy(topic: TopicWithRoomRow, userId: string): Promise<boolean> {
  if (await isGlobalModerator(userId)) {
    return true;
  }

  const serverId = String(topic.room_server_id || "").trim();
  if (!serverId) {
    return false;
  }

  return isServerModerator(serverId, userId);
}

async function ensureTopicSendAllowed(topic: TopicWithRoomRow, userId: string): Promise<void> {
  const canBypass = await canBypassRoomSendPolicy(topic, userId);
  const serverId = String(topic.room_server_id || "").trim();
  if (serverId && !canBypass) {
    const muteState = await resolveActiveServerMute(serverId, userId);
    if (muteState.isMuted) {
      throw new Error("server_member_muted");
    }
  }
  if (topic.room_is_readonly && !canBypass) {
    throw new Error("room_readonly");
  }

  const slowmodeSeconds = Number(topic.room_slowmode_seconds || 0);
  if (slowmodeSeconds <= 0 || canBypass) {
    return;
  }

  const key = `room:slowmode:${topic.room_id}:${userId}`;
  const cooldownRaw = await redis.get(key);
  if (cooldownRaw) {
    const retryAfterSec = Math.max(1, Number.parseInt(cooldownRaw, 10) || slowmodeSeconds);
    throw new Error(`room_slowmode_active:${retryAfterSec}`);
  }

  await redis.setEx(key, slowmodeSeconds, String(slowmodeSeconds));
}

async function loadMessageContext(messageId: string): Promise<MessageContextRow> {
  const messageResult = await db.query<MessageContextRow>(
    `SELECT
       m.id AS message_id,
       m.user_id AS message_user_id,
      um.name AS message_user_name,
       m.body AS message_body,
       m.created_at AS message_created_at,
       m.updated_at AS message_updated_at,
       rt.id AS topic_id,
       rt.slug AS topic_slug,
       rt.title AS topic_title,
       rt.archived_at AS topic_archived_at,
       rt.created_at AS topic_created_at,
       rt.updated_at AS topic_updated_at,
       r.id AS room_id,
       r.slug AS room_slug,
       r.title AS room_title,
       r.kind AS room_kind,
       r.audio_quality_override AS room_audio_quality_override,
       r.category_id AS room_category_id,
       r.server_id AS room_server_id,
       r.nsfw AS room_nsfw,
       r.position AS room_position,
       r.is_public AS room_is_public,
       r.is_hidden AS room_is_hidden,
       r.is_readonly AS room_is_readonly,
       r.slowmode_seconds AS room_slowmode_seconds
     FROM messages m
    JOIN users um ON um.id = m.user_id
     JOIN room_topics rt ON rt.id = m.topic_id
     JOIN rooms r ON r.id = m.room_id
     WHERE m.id = $1
       AND r.is_archived = FALSE
     LIMIT 1`,
    [messageId]
  );

  const row = messageResult.rows[0];
  if (!row) {
    throw new Error("message_not_found");
  }

  return row;
}

function ensureOwnMessageWithinWindow(message: MessageContextRow, userId: string): void {
  if (message.message_user_id !== userId) {
    throw new Error("forbidden_message_owner");
  }

  const createdAtTs = Number(new Date(message.message_created_at));
  const withinWindow = Number.isFinite(createdAtTs) && Date.now() - createdAtTs <= 10 * 60 * 1000;
  if (!withinWindow) {
    throw new Error("message_edit_window_expired");
  }
}

export async function listTopicMessages(input: {
  topicId: string;
  userId: string;
  limit: number;
  aroundUnreadWindow?: boolean;
  anchorMessageId?: string | null;
  aroundWindowBefore?: number;
  aroundWindowAfter?: number;
  beforeCreatedAt?: string | null;
  beforeId?: string | null;
}): Promise<TopicMessagesPage> {
  const topic = await loadTopicWithRoom(input.topicId);
  await ensureTopicReadAccess(topic, input.userId);

  let unreadDividerMessageId: string | null = null;

  if (input.aroundUnreadWindow && !input.beforeCreatedAt && !input.beforeId) {
    const lastReadResult = await db.query<{ last_read_message_id: string | null }>(
      `SELECT last_read_message_id
       FROM room_reads
       WHERE topic_id = $1
         AND user_id = $2
       LIMIT 1`,
      [input.topicId, input.userId]
    );

    const lastReadMessageId = String(lastReadResult.rows[0]?.last_read_message_id || "").trim();
    if (lastReadMessageId) {
      const firstUnreadResult = await db.query<{ id: string; created_at: string }>(
        `SELECT m.id, m.created_at
         FROM messages m
         JOIN messages lr ON lr.id = $3
         WHERE m.topic_id = $1
           AND m.user_id <> $2
           AND (m.created_at, m.id) > (lr.created_at, lr.id)
         ORDER BY m.created_at ASC, m.id ASC
         LIMIT 1`,
        [input.topicId, input.userId, lastReadMessageId]
      );

      unreadDividerMessageId = String(firstUnreadResult.rows[0]?.id || "").trim() || null;
    }
  }

  const normalizedAnchorMessageId = String(input.anchorMessageId || "").trim() || null;
  const aroundAnchorMessageId = normalizedAnchorMessageId || unreadDividerMessageId;

  const aroundWindowBefore = Math.max(
    0,
    Math.min(MAX_AROUND_WINDOW, Math.trunc(Number(input.aroundWindowBefore ?? DEFAULT_AROUND_WINDOW_BEFORE) || 0))
  );
  const aroundWindowAfter = Math.max(
    0,
    Math.min(MAX_AROUND_WINDOW, Math.trunc(Number(input.aroundWindowAfter ?? DEFAULT_AROUND_WINDOW_AFTER) || 0))
  );

  if (aroundAnchorMessageId && !input.beforeCreatedAt && !input.beforeId) {
    const aroundIdsResult = await db.query<{ id: string }>(
      `WITH ordered AS (
         SELECT
           m.id,
           m.created_at,
           ROW_NUMBER() OVER (ORDER BY m.created_at ASC, m.id ASC) AS rn
         FROM messages m
         WHERE m.topic_id = $1
       ),
       anchor AS (
         SELECT rn
         FROM ordered
         WHERE id = $2
         LIMIT 1
       )
       SELECT o.id
       FROM ordered o
       JOIN anchor a ON TRUE
       WHERE o.rn BETWEEN GREATEST(1, a.rn - $3) AND (a.rn + $4)
       ORDER BY o.rn ASC`,
      [input.topicId, aroundAnchorMessageId, aroundWindowBefore, aroundWindowAfter]
    );

    const aroundIds = aroundIdsResult.rows.map((row) => row.id).filter(Boolean);
    if (aroundIds.length > 0) {
      const messagesAroundResult = await db.query<RoomMessageRow>(
        `SELECT
           m.id,
           m.room_id,
           m.topic_id,
           rmr.parent_message_id AS reply_to_message_id,
           pm.user_id AS reply_to_user_id,
           pu.name AS reply_to_user_name,
           pm.body AS reply_to_text,
           m.user_id,
           m.body AS text,
           m.created_at,
           m.updated_at AS edited_at,
           u.name AS user_name,
           COALESCE((
             SELECT json_agg(
               json_build_object(
                 'id', ma.id,
                 'message_id', ma.message_id,
                 'type', ma.type,
                 'storage_key', ma.storage_key,
                 'download_url', ma.download_url,
                 'mime_type', ma.mime_type,
                 'size_bytes', ma.size_bytes,
                 'width', ma.width,
                 'height', ma.height,
                 'checksum', ma.checksum,
                 'created_at', ma.created_at
               )
               ORDER BY ma.created_at ASC
             )
             FROM message_attachments ma
             WHERE ma.message_id = m.id
           ), '[]'::json) AS attachments
           ,COALESCE((
             SELECT json_agg(
               json_build_object(
                 'emoji', mr.emoji,
                 'count', mr.count,
                 'reacted', mr.reacted
               )
               ORDER BY mr.count DESC, mr.emoji ASC
             )
             FROM (
               SELECT
                 r.emoji,
                 COUNT(*)::int AS count,
                 BOOL_OR(r.user_id = $3) AS reacted
               FROM room_message_reactions r
               WHERE r.message_id = m.id
               GROUP BY r.emoji
             ) mr
           ), '[]'::json) AS reactions
         FROM messages m
         LEFT JOIN room_message_replies rmr ON rmr.message_id = m.id
         LEFT JOIN messages pm ON pm.id = rmr.parent_message_id
         LEFT JOIN users pu ON pu.id = pm.user_id
         JOIN users u ON u.id = m.user_id
         WHERE m.topic_id = $1
           AND m.id = ANY($2::uuid[])
         ORDER BY m.created_at ASC, m.id ASC`,
        [input.topicId, aroundIds, input.userId]
      );

      const oldestInPage = messagesAroundResult.rows[0] || null;
      let hasMore = false;
      if (oldestInPage) {
        const olderExistsResult = await db.query<{ has_more: boolean }>(
          `SELECT EXISTS(
             SELECT 1
             FROM messages m
             WHERE m.topic_id = $1
               AND (m.created_at, m.id) < ($2::timestamptz, $3)
           ) AS has_more`,
          [input.topicId, oldestInPage.created_at, oldestInPage.id]
        );
        hasMore = Boolean(olderExistsResult.rows[0]?.has_more);
      }

      return {
        room: mapRoom(topic),
        topic: {
          id: topic.topic_id,
          room_id: topic.room_id,
          slug: topic.topic_slug,
          title: topic.topic_title,
          archived_at: topic.topic_archived_at,
          created_at: topic.topic_created_at,
          updated_at: topic.topic_updated_at
        },
        unreadDividerMessageId,
        messages: messagesAroundResult.rows,
        pagination: {
          hasMore,
          nextCursor: hasMore && oldestInPage
            ? {
                beforeCreatedAt: oldestInPage.created_at,
                beforeId: oldestInPage.id
              }
            : null
        }
      };
    }
  }

  const messagesResult = input.beforeCreatedAt && input.beforeId
    ? await db.query<RoomMessageRow>(
        `SELECT
           m.id,
           m.room_id,
           m.topic_id,
           m.user_id,
           m.body AS text,
           m.created_at,
           m.updated_at AS edited_at,
           u.name AS user_name,
           COALESCE((
             SELECT json_agg(
               json_build_object(
                 'id', ma.id,
                 'message_id', ma.message_id,
                 'type', ma.type,
                 'storage_key', ma.storage_key,
                 'download_url', ma.download_url,
                 'mime_type', ma.mime_type,
                 'size_bytes', ma.size_bytes,
                 'width', ma.width,
                 'height', ma.height,
                 'checksum', ma.checksum,
                 'created_at', ma.created_at
               )
               ORDER BY ma.created_at ASC
             )
             FROM message_attachments ma
             WHERE ma.message_id = m.id
           ), '[]'::json) AS attachments
           ,COALESCE((
             SELECT json_agg(
               json_build_object(
                 'emoji', mr.emoji,
                 'count', mr.count,
                 'reacted', mr.reacted
               )
               ORDER BY mr.count DESC, mr.emoji ASC
             )
             FROM (
               SELECT
                 r.emoji,
                 COUNT(*)::int AS count,
                 BOOL_OR(r.user_id = $5) AS reacted
               FROM room_message_reactions r
               WHERE r.message_id = m.id
               GROUP BY r.emoji
             ) mr
           ), '[]'::json) AS reactions
         FROM messages m
         LEFT JOIN room_message_replies rmr ON rmr.message_id = m.id
         LEFT JOIN messages pm ON pm.id = rmr.parent_message_id
         LEFT JOIN users pu ON pu.id = pm.user_id
         JOIN users u ON u.id = m.user_id
         WHERE m.topic_id = $1
           AND (m.created_at, m.id) < ($2::timestamptz, $3)
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT $4`,
        [input.topicId, input.beforeCreatedAt, input.beforeId, input.limit + 1, input.userId]
      )
    : await db.query<RoomMessageRow>(
        `SELECT
           m.id,
           m.room_id,
           m.topic_id,
           rmr.parent_message_id AS reply_to_message_id,
           pm.user_id AS reply_to_user_id,
           pu.name AS reply_to_user_name,
           pm.body AS reply_to_text,
           m.user_id,
           m.body AS text,
           m.created_at,
           m.updated_at AS edited_at,
           u.name AS user_name,
           COALESCE((
             SELECT json_agg(
               json_build_object(
                 'id', ma.id,
                 'message_id', ma.message_id,
                 'type', ma.type,
                 'storage_key', ma.storage_key,
                 'download_url', ma.download_url,
                 'mime_type', ma.mime_type,
                 'size_bytes', ma.size_bytes,
                 'width', ma.width,
                 'height', ma.height,
                 'checksum', ma.checksum,
                 'created_at', ma.created_at
               )
               ORDER BY ma.created_at ASC
             )
             FROM message_attachments ma
             WHERE ma.message_id = m.id
           ), '[]'::json) AS attachments
           ,COALESCE((
             SELECT json_agg(
               json_build_object(
                 'emoji', mr.emoji,
                 'count', mr.count,
                 'reacted', mr.reacted
               )
               ORDER BY mr.count DESC, mr.emoji ASC
             )
             FROM (
               SELECT
                 r.emoji,
                 COUNT(*)::int AS count,
                 BOOL_OR(r.user_id = $3) AS reacted
               FROM room_message_reactions r
               WHERE r.message_id = m.id
               GROUP BY r.emoji
             ) mr
           ), '[]'::json) AS reactions
         FROM messages m
         LEFT JOIN room_message_replies rmr ON rmr.message_id = m.id
         LEFT JOIN messages pm ON pm.id = rmr.parent_message_id
         LEFT JOIN users pu ON pu.id = pm.user_id
         JOIN users u ON u.id = m.user_id
         WHERE m.topic_id = $1
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT $2`,
        [input.topicId, input.limit + 1, input.userId]
      );

  const hasMore = messagesResult.rows.length > input.limit;
  const pageDesc = hasMore ? messagesResult.rows.slice(0, input.limit) : messagesResult.rows;
  const oldestInPage = pageDesc[pageDesc.length - 1] || null;

  return {
    room: mapRoom(topic),
    topic: {
      id: topic.topic_id,
      room_id: topic.room_id,
      slug: topic.topic_slug,
      title: topic.topic_title,
      archived_at: topic.topic_archived_at,
      created_at: topic.topic_created_at,
      updated_at: topic.topic_updated_at
    },
    unreadDividerMessageId,
    messages: pageDesc.reverse(),
    pagination: {
      hasMore,
      nextCursor: hasMore && oldestInPage
        ? {
            beforeCreatedAt: oldestInPage.created_at,
            beforeId: oldestInPage.id
          }
        : null
    }
  };
}

export async function createTopicMessage(input: {
  topicId: string;
  userId: string;
  text: string;
}): Promise<{
  room: RoomRow;
  topic: Pick<RoomTopicRow, "id" | "room_id" | "slug" | "title" | "archived_at">;
  message: RoomMessageRow;
}> {
  const topic = await loadTopicWithRoom(input.topicId);
  await ensureTopicReadAccess(topic, input.userId);
  await ensureTopicSendAllowed(topic, input.userId);

  if (topic.topic_archived_at) {
    throw new Error("topic_archived");
  }

  const userResult = await db.query<{ id: string; name: string }>(
    `SELECT id, name
     FROM users
     WHERE id = $1
       AND is_banned = FALSE
     LIMIT 1`,
    [input.userId]
  );

  const user = userResult.rows[0];
  if (!user) {
    throw new Error("user_not_found");
  }

  const inserted = await db.query<{ id: string; room_id: string; topic_id: string; user_id: string; body: string; created_at: string }>(
    `INSERT INTO messages (room_id, topic_id, user_id, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id, room_id, topic_id, user_id, body, created_at`,
    [topic.room_id, topic.topic_id, input.userId, input.text]
  );

  const row = inserted.rows[0];
  if (!row) {
    throw new Error("message_create_failed");
  }

  return {
    room: mapRoom(topic),
    topic: {
      id: topic.topic_id,
      room_id: topic.room_id,
      slug: topic.topic_slug,
      title: topic.topic_title,
      archived_at: topic.topic_archived_at
    },
    message: {
      id: row.id,
      room_id: row.room_id,
      topic_id: row.topic_id,
      user_id: row.user_id,
      text: row.body,
      created_at: row.created_at,
      edited_at: null,
      user_name: user.name,
      attachments: []
    }
  };
}

export async function editTopicMessage(input: {
  messageId: string;
  userId: string;
  text: string;
}): Promise<{
  room: RoomRow;
  topic: { id: string; slug: string };
  message: RoomMessageRow;
}> {
  const context = await loadMessageContext(input.messageId);
  await ensureTopicReadAccess(context, input.userId);

  const canModerate = await canModerateMessage(context, input.userId);
  if (!canModerate) {
    ensureOwnMessageWithinWindow(context, input.userId);
  }

  const updated = await db.query<{ id: string; room_id: string; topic_id: string; user_id: string; body: string; created_at: string; updated_at: string }>(
    `UPDATE messages
     SET body = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, room_id, topic_id, user_id, body, created_at, updated_at`,
    [input.messageId, input.text]
  );

  const updatedRow = updated.rows[0];
  if (!updatedRow) {
    throw new Error("message_not_found");
  }

  const userResult = await db.query<{ name: string }>(
    `SELECT name FROM users WHERE id = $1 LIMIT 1`,
    [updatedRow.user_id]
  );

  return {
    room: mapRoom(context),
    topic: {
      id: context.topic_id,
      slug: context.topic_slug
    },
    message: {
      id: updatedRow.id,
      room_id: updatedRow.room_id,
      topic_id: updatedRow.topic_id,
      user_id: updatedRow.user_id,
      text: updatedRow.body,
      created_at: updatedRow.created_at,
      edited_at: updatedRow.updated_at,
      user_name: String(userResult.rows[0]?.name || "Unknown"),
      attachments: []
    }
  };
}

export async function deleteTopicMessage(input: {
  messageId: string;
  userId: string;
}): Promise<{
  room: RoomRow;
  topic: { id: string; slug: string };
  messageId: string;
  deletedAt: string;
}> {
  const context = await loadMessageContext(input.messageId);
  await ensureTopicReadAccess(context, input.userId);

  const canModerate = await canModerateMessage(context, input.userId);
  if (!canModerate) {
    ensureOwnMessageWithinWindow(context, input.userId);
  }

  const deleted = await db.query<{ id: string }>(
    `DELETE FROM messages
     WHERE id = $1
     RETURNING id`,
    [input.messageId]
  );

  if ((deleted.rowCount || 0) === 0) {
    throw new Error("message_not_found");
  }

  return {
    room: mapRoom(context),
    topic: {
      id: context.topic_id,
      slug: context.topic_slug
    },
    messageId: input.messageId,
    deletedAt: new Date().toISOString()
  };
}

export async function replyTopicMessage(input: {
  messageId: string;
  userId: string;
  text: string;
}): Promise<{
  room: RoomRow;
  topic: { id: string; slug: string; title: string; archivedAt: string | null };
  message: RoomMessageRow;
  parentMessageId: string;
}> {
  const context = await loadMessageContext(input.messageId);
  await ensureTopicReadAccess(context, input.userId);
  await ensureTopicSendAllowed(context, input.userId);

  if (context.topic_archived_at) {
    throw new Error("topic_archived");
  }

  const userResult = await db.query<{ id: string; name: string }>(
    `SELECT id, name FROM users WHERE id = $1 AND is_banned = FALSE LIMIT 1`,
    [input.userId]
  );
  const user = userResult.rows[0];
  if (!user) {
    throw new Error("user_not_found");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const inserted = await client.query<{ id: string; room_id: string; topic_id: string; user_id: string; body: string; created_at: string }>(
      `INSERT INTO messages (room_id, topic_id, user_id, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, room_id, topic_id, user_id, body, created_at`,
      [context.room_id, context.topic_id, input.userId, input.text]
    );

    const row = inserted.rows[0];
    if (!row) {
      throw new Error("message_create_failed");
    }

    await client.query(
      `INSERT INTO room_message_replies (message_id, parent_message_id)
       VALUES ($1, $2)
       ON CONFLICT (message_id) DO UPDATE SET parent_message_id = EXCLUDED.parent_message_id`,
      [row.id, input.messageId]
    );

    await client.query("COMMIT");

    return {
      room: mapRoom(context),
      topic: {
        id: context.topic_id,
        slug: context.topic_slug,
        title: context.topic_title,
        archivedAt: context.topic_archived_at
      },
      message: {
        id: row.id,
        room_id: row.room_id,
        topic_id: row.topic_id,
        reply_to_message_id: input.messageId,
        reply_to_user_id: context.message_user_id,
        reply_to_user_name: context.message_user_name,
        reply_to_text: context.message_body,
        user_id: row.user_id,
        text: row.body,
        created_at: row.created_at,
        edited_at: null,
        user_name: user.name,
        attachments: []
      },
      parentMessageId: input.messageId
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setTopicMessagePinned(input: {
  messageId: string;
  userId: string;
  pinned: boolean;
}): Promise<{
  room: RoomRow;
  topic: { id: string; slug: string };
  messageId: string;
  messageAuthorUserId: string;
  pinned: boolean;
}> {
  const context = await loadMessageContext(input.messageId);
  await ensureTopicReadAccess(context, input.userId);

  const canModerate = await canModerateMessage(context, input.userId);
  if (!canModerate) {
    throw new Error("forbidden_topic_manage");
  }

  if (input.pinned) {
    await db.query(
      `INSERT INTO room_message_pins (message_id, pinned_by)
       VALUES ($1, $2)
       ON CONFLICT (message_id) DO UPDATE SET pinned_by = EXCLUDED.pinned_by, pinned_at = NOW()`,
      [input.messageId, input.userId]
    );
  } else {
    await db.query(
      `DELETE FROM room_message_pins WHERE message_id = $1`,
      [input.messageId]
    );
  }

  return {
    room: mapRoom(context),
    topic: {
      id: context.topic_id,
      slug: context.topic_slug
    },
    messageId: input.messageId,
    messageAuthorUserId: context.message_user_id,
    pinned: input.pinned
  };
}

export async function setTopicMessageReaction(input: {
  messageId: string;
  userId: string;
  emoji: string;
  active: boolean;
}): Promise<{
  room: RoomRow;
  topic: { id: string; slug: string };
  messageId: string;
  emoji: string;
  userId: string;
  active: boolean;
}> {
  const context = await loadMessageContext(input.messageId);
  await ensureTopicReadAccess(context, input.userId);

  const normalizedEmoji = input.emoji.trim().slice(0, 32);
  if (!normalizedEmoji) {
    throw new Error("validation_error");
  }

  if (input.active) {
    await db.query(
      `INSERT INTO room_message_reactions (message_id, user_id, emoji)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
      [input.messageId, input.userId, normalizedEmoji]
    );
  } else {
    await db.query(
      `DELETE FROM room_message_reactions
       WHERE message_id = $1
         AND user_id = $2
         AND emoji = $3`,
      [input.messageId, input.userId, normalizedEmoji]
    );
  }

  return {
    room: mapRoom(context),
    topic: {
      id: context.topic_id,
      slug: context.topic_slug
    },
    messageId: input.messageId,
    emoji: normalizedEmoji,
    userId: input.userId,
    active: input.active
  };
}

export async function createTopicMessageReport(input: {
  messageId: string;
  userId: string;
  reason: string;
  details?: string;
}): Promise<{
  reportId: string;
  messageId: string;
}> {
  const context = await loadMessageContext(input.messageId);
  await ensureTopicReadAccess(context, input.userId);

  if (context.message_user_id === input.userId) {
    throw new Error("cannot_report_own_message");
  }

  const normalizedReason = input.reason.trim().slice(0, 160);
  const normalizedDetails = typeof input.details === "string"
    ? input.details.trim().slice(0, 2000)
    : "";

  try {
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO room_message_reports (
         message_id,
         topic_id,
         room_id,
         server_id,
         reporter_user_id,
         reason,
         details
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        input.messageId,
        context.topic_id,
        context.room_id,
        context.room_server_id,
        input.userId,
        normalizedReason,
        normalizedDetails || null
      ]
    );

    await db.query(
      `INSERT INTO moderation_audit_log (
         action,
         actor_user_id,
         target_user_id,
         server_id,
         room_id,
         topic_id,
         message_id,
         meta
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        "message_reported",
        input.userId,
        context.message_user_id,
        context.room_server_id,
        context.room_id,
        context.topic_id,
        input.messageId,
        JSON.stringify({
          reason: normalizedReason,
          details: normalizedDetails || null
        })
      ]
    );

    return {
      reportId: String(inserted.rows[0]?.id || "").trim(),
      messageId: input.messageId
    };
  } catch (error) {
    const code = String((error as { code?: string } | null)?.code || "").trim();
    if (code === "23505") {
      throw new Error("message_report_exists");
    }

    throw error;
  }
}

export async function markTopicRead(input: {
  topicId: string;
  userId: string;
  lastReadMessageId?: string | null;
}): Promise<{
  roomId: string;
  topicId: string;
  lastReadMessageId: string | null;
  lastReadAt: string;
  unreadDelta: number;
  mentionDelta: number;
}> {
  type ReadPointerPosition = {
    messageId: string;
    createdAtIso: string;
  };

  const topic = await loadTopicWithRoom(input.topicId);
  await ensureTopicReadAccess(topic, input.userId);

  const currentReadResult = await db.query<{
    last_read_message_id: string | null;
    last_read_at: string | null;
    last_read_message_created_at: string | null;
  }>(
    `SELECT
       rr.last_read_message_id,
       rr.last_read_at,
       m.created_at AS last_read_message_created_at
     FROM room_reads rr
     LEFT JOIN messages m ON m.id = rr.last_read_message_id
     WHERE rr.user_id = $1
       AND rr.topic_id = $2
     LIMIT 1`,
    [input.userId, input.topicId]
  );

  const currentReadRow = currentReadResult.rows[0] || null;
  const currentPointer: ReadPointerPosition | null = currentReadRow
    && currentReadRow.last_read_message_id
    && currentReadRow.last_read_message_created_at
    ? {
        messageId: String(currentReadRow.last_read_message_id || "").trim(),
        createdAtIso: String(currentReadRow.last_read_message_created_at || "").trim()
      }
    : null;

  let requestedPointer: ReadPointerPosition | null = null;

  if (input.lastReadMessageId) {
    const messageCheck = await db.query<{ id: string; created_at: string }>(
      `SELECT id, created_at
       FROM messages
       WHERE id = $1
         AND topic_id = $2
       LIMIT 1`,
      [input.lastReadMessageId, input.topicId]
    );

    if ((messageCheck.rowCount || 0) === 0) {
      throw new Error("message_not_found");
    }

    requestedPointer = {
      messageId: String(messageCheck.rows[0]?.id || "").trim(),
      createdAtIso: String(messageCheck.rows[0]?.created_at || "").trim()
    };

    if (currentPointer && requestedPointer && !isReadPointerAdvance(currentPointer, requestedPointer)) {
      return {
        roomId: topic.room_id,
        topicId: input.topicId,
        lastReadMessageId: currentReadRow?.last_read_message_id || null,
        lastReadAt: String(currentReadRow?.last_read_at || new Date().toISOString()),
        unreadDelta: 0,
        mentionDelta: 0
      };
    }
  }

  const unreadSnapshot = await db.query<{ unread_count: string; mention_unread_count: string }>(
    `SELECT
       GREATEST(
         0,
         (
           SELECT COUNT(*)::int
           FROM messages m
           WHERE m.topic_id = $1
             AND m.user_id <> $2
             AND m.created_at > COALESCE(rr.last_read_at, to_timestamp(0))
         )
       ) AS unread_count,
       GREATEST(
         0,
         (
           SELECT COUNT(*)::int
           FROM notification_inbox ni
           WHERE ni.user_id = $2
             AND ni.event_type = 'mention_me'
             AND ni.room_id = $3
             AND ni.topic_id = $1
             AND ni.read_at IS NULL
             AND ni.created_at > COALESCE(rr.last_read_at, to_timestamp(0))
         )
       ) AS mention_unread_count
     FROM (SELECT 1) AS _
     LEFT JOIN room_reads rr ON rr.user_id = $2 AND rr.topic_id = $1`,
    [input.topicId, input.userId, topic.room_id]
  );

  const unreadDelta = Math.max(0, Number(unreadSnapshot.rows[0]?.unread_count || 0));
  const mentionDelta = Math.max(0, Number(unreadSnapshot.rows[0]?.mention_unread_count || 0));

  let persistedLastReadMessageId = input.lastReadMessageId || null;
  if (!persistedLastReadMessageId) {
    const latestMessage = await db.query<{ id: string }>(
      `SELECT id
       FROM messages
       WHERE topic_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [input.topicId]
    );
    persistedLastReadMessageId = String(latestMessage.rows[0]?.id || "").trim() || null;
  }

  const upserted = await db.query<{ last_read_message_id: string | null; last_read_at: string }>(
    `INSERT INTO room_reads (user_id, room_id, topic_id, last_read_message_id, last_read_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, topic_id)
     DO UPDATE SET
       room_id = EXCLUDED.room_id,
       last_read_message_id = EXCLUDED.last_read_message_id,
       last_read_at = NOW()
     RETURNING last_read_message_id, last_read_at`,
    [input.userId, topic.room_id, input.topicId, persistedLastReadMessageId]
  );

  return {
    roomId: topic.room_id,
    topicId: input.topicId,
    lastReadMessageId: upserted.rows[0]?.last_read_message_id || null,
    lastReadAt: String(upserted.rows[0]?.last_read_at || new Date().toISOString()),
    unreadDelta,
    mentionDelta
  };
}

