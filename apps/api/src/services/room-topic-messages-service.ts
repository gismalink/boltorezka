import { db } from "../db.js";
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
};

export type TopicMessageCursor = {
  beforeCreatedAt: string;
  beforeId: string;
};

export type TopicMessagesPage = {
  room: RoomRow;
  topic: Pick<RoomTopicRow, "id" | "room_id" | "slug" | "title" | "archived_at" | "created_at" | "updated_at">;
  messages: RoomMessageRow[];
  pagination: {
    hasMore: boolean;
    nextCursor: TopicMessageCursor | null;
  };
};

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
    is_hidden: topicRoom.room_is_hidden
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
       r.is_hidden AS room_is_hidden
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

export async function listTopicMessages(input: {
  topicId: string;
  userId: string;
  limit: number;
  beforeCreatedAt?: string | null;
  beforeId?: string | null;
}): Promise<TopicMessagesPage> {
  const topic = await loadTopicWithRoom(input.topicId);
  await ensureTopicReadAccess(topic, input.userId);

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
         FROM messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.topic_id = $1
           AND (m.created_at, m.id) < ($2::timestamptz, $3)
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT $4`,
        [input.topicId, input.beforeCreatedAt, input.beforeId, input.limit + 1]
      )
    : await db.query<RoomMessageRow>(
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
         FROM messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.topic_id = $1
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT $2`,
        [input.topicId, input.limit + 1]
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
