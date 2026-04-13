import { db } from "../db.js";
import type { RoomMessageRow, RoomRow, RoomTopicRow } from "../db.types.ts";
import { ensureTopicReadAccess, loadTopicWithRoom, mapRoom, type TopicWithRoomRow } from "./room-topic-messages-core.js";
import { normalizeBoundedString } from "../validators.js";

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

type ListTopicMessagesInput = {
  topicId: string;
  userId: string;
  limit: number;
  aroundUnreadWindow?: boolean;
  anchorMessageId?: string | null;
  aroundWindowBefore?: number;
  aroundWindowAfter?: number;
  beforeCreatedAt?: string | null;
  beforeId?: string | null;
};

const DEFAULT_AROUND_WINDOW_BEFORE = 25;
const DEFAULT_AROUND_WINDOW_AFTER = 25;
const MAX_AROUND_WINDOW = 500;

function mapTopicSummary(topic: TopicWithRoomRow): TopicMessagesPage["topic"] {
  return {
    id: topic.topic_id,
    room_id: topic.room_id,
    slug: topic.topic_slug,
    title: topic.topic_title,
    archived_at: topic.topic_archived_at,
    created_at: topic.topic_created_at,
    updated_at: topic.topic_updated_at
  };
}

function buildNextCursor(oldestInPage: RoomMessageRow | null, hasMore: boolean): TopicMessageCursor | null {
  if (!hasMore || !oldestInPage) {
    return null;
  }

  return {
    beforeCreatedAt: oldestInPage.created_at,
    beforeId: oldestInPage.id
  };
}

async function resolveUnreadDividerMessageId(input: ListTopicMessagesInput): Promise<string | null> {
  if (!input.aroundUnreadWindow || input.beforeCreatedAt || input.beforeId) {
    return null;
  }

  const lastReadResult = await db.query<{ last_read_message_id: string | null }>(
    `SELECT last_read_message_id
     FROM room_reads
     WHERE topic_id = $1
       AND user_id = $2
     LIMIT 1`,
    [input.topicId, input.userId]
  );

  const lastReadMessageId = normalizeBoundedString(lastReadResult.rows[0]?.last_read_message_id, 128) || "";
  if (!lastReadMessageId) {
    return null;
  }

  const firstUnreadResult = await db.query<{ id: string }>(
    `SELECT m.id
     FROM messages m
     JOIN messages lr ON lr.id = $3
     WHERE m.topic_id = $1
       AND m.user_id <> $2
       AND (m.created_at, m.id) > (lr.created_at, lr.id)
     ORDER BY m.created_at ASC, m.id ASC
     LIMIT 1`,
    [input.topicId, input.userId, lastReadMessageId]
  );

  return normalizeBoundedString(firstUnreadResult.rows[0]?.id, 128);
}

function normalizeAroundWindow(value: number | undefined, fallback: number): number {
  return Math.max(0, Math.min(MAX_AROUND_WINDOW, Math.trunc(Number(value ?? fallback) || 0)));
}

async function loadAroundMessageIds(input: {
  topicId: string;
  anchorMessageId: string;
  aroundWindowBefore: number;
  aroundWindowAfter: number;
}): Promise<string[]> {
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
    [input.topicId, input.anchorMessageId, input.aroundWindowBefore, input.aroundWindowAfter]
  );

  return aroundIdsResult.rows.map((row) => row.id).filter(Boolean);
}

async function loadMessagesAroundAnchor(topicId: string, aroundIds: string[], userId: string): Promise<RoomMessageRow[]> {
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
    [topicId, aroundIds, userId]
  );

  return messagesAroundResult.rows;
}

async function hasOlderMessages(topicId: string, oldestInPage: RoomMessageRow | null): Promise<boolean> {
  if (!oldestInPage) {
    return false;
  }

  const olderExistsResult = await db.query<{ has_more: boolean }>(
    `SELECT EXISTS(
       SELECT 1
       FROM messages m
       WHERE m.topic_id = $1
         AND (m.created_at, m.id) < ($2::timestamptz, $3)
     ) AS has_more`,
    [topicId, oldestInPage.created_at, oldestInPage.id]
  );

  return Boolean(olderExistsResult.rows[0]?.has_more);
}

async function loadPagedTopicMessages(input: ListTopicMessagesInput): Promise<RoomMessageRow[]> {
  if (input.beforeCreatedAt && input.beforeId) {
    const messagesResult = await db.query<RoomMessageRow>(
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
    );

    return messagesResult.rows;
  }

  const messagesResult = await db.query<RoomMessageRow>(
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

  return messagesResult.rows;
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
  const unreadDividerMessageId = await resolveUnreadDividerMessageId(input);

  const normalizedAnchorMessageId = normalizeBoundedString(input.anchorMessageId, 128);
  const aroundAnchorMessageId = normalizedAnchorMessageId || unreadDividerMessageId;

  const aroundWindowBefore = normalizeAroundWindow(input.aroundWindowBefore, DEFAULT_AROUND_WINDOW_BEFORE);
  const aroundWindowAfter = normalizeAroundWindow(input.aroundWindowAfter, DEFAULT_AROUND_WINDOW_AFTER);

  if (aroundAnchorMessageId && !input.beforeCreatedAt && !input.beforeId) {
    const aroundIds = await loadAroundMessageIds({
      topicId: input.topicId,
      anchorMessageId: aroundAnchorMessageId,
      aroundWindowBefore,
      aroundWindowAfter
    });

    if (aroundIds.length > 0) {
      const aroundMessages = await loadMessagesAroundAnchor(input.topicId, aroundIds, input.userId);
      const oldestInPage = aroundMessages[0] || null;
      const hasMore = await hasOlderMessages(input.topicId, oldestInPage);

      return {
        room: mapRoom(topic),
        topic: mapTopicSummary(topic),
        unreadDividerMessageId,
        messages: aroundMessages,
        pagination: {
          hasMore,
          nextCursor: buildNextCursor(oldestInPage, hasMore)
        }
      };
    }
  }

  const messagesResultRows = await loadPagedTopicMessages(input);

  const hasMore = messagesResultRows.length > input.limit;
  const pageDesc = hasMore ? messagesResultRows.slice(0, input.limit) : messagesResultRows;
  const oldestInPage = pageDesc[pageDesc.length - 1] || null;

  return {
    room: mapRoom(topic),
    topic: mapTopicSummary(topic),
    unreadDividerMessageId,
    messages: pageDesc.reverse(),
    pagination: {
      hasMore,
      nextCursor: buildNextCursor(oldestInPage, hasMore)
    }
  };
}
