import { db } from "../db.js";
import { redis } from "../redis.js";
import { resolveActiveServerMute } from "./server-mute-service.js";
import {
  canBypassRoomSendPolicy,
  hasHiddenRoomAccess,
  hasRoomMembership,
  isServerModerator,
  isGlobalModerator
} from "./room-access-service.js";
import type { RoomRow } from "../db.types.ts";
import { normalizeBoundedString } from "../validators.js";

const dbQuery = db.query.bind(db);

export type TopicWithRoomRow = {
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

export type MessageContextRow = TopicWithRoomRow & {
  message_id: string;
  message_user_id: string;
  message_user_name: string;
  message_body: string;
  message_created_at: string;
  message_updated_at: string | null;
};

export function mapRoom(topicRoom: TopicWithRoomRow): RoomRow {
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

export async function loadTopicWithRoom(topicId: string): Promise<TopicWithRoomRow> {
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

export async function ensureTopicReadAccess(topic: TopicWithRoomRow, userId: string): Promise<void> {
  if (topic.room_is_hidden) {
    const allowed = await hasHiddenRoomAccess(dbQuery, topic.room_id, userId);
    if (!allowed) {
      throw new Error("forbidden_room_access");
    }
  }

  if (!topic.room_is_public) {
    const isMember = await hasRoomMembership(dbQuery, topic.room_id, userId);
    if (!isMember) {
      throw new Error("forbidden_room_access");
    }
  }
}

export async function canModerateMessage(topic: TopicWithRoomRow, userId: string): Promise<boolean> {
  if (await isGlobalModerator(dbQuery, userId)) {
    return true;
  }

  const serverId = normalizeBoundedString(topic.room_server_id, 128) || "";
  if (!serverId) {
    return false;
  }

  return isServerModerator(dbQuery, serverId, userId);
}

export async function ensureTopicSendAllowed(topic: TopicWithRoomRow, userId: string): Promise<void> {
  const canBypass = await canBypassRoomSendPolicy(dbQuery, userId, topic.room_server_id);
  const serverId = normalizeBoundedString(topic.room_server_id, 128) || "";
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

export async function loadMessageContext(messageId: string): Promise<MessageContextRow> {
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

export function ensureOwnMessageWithinWindow(message: MessageContextRow, userId: string): void {
  if (message.message_user_id !== userId) {
    throw new Error("forbidden_message_owner");
  }

  const createdAtTs = Number(new Date(message.message_created_at));
  const withinWindow = Number.isFinite(createdAtTs) && Date.now() - createdAtTs <= 10 * 60 * 1000;
  if (!withinWindow) {
    throw new Error("message_edit_window_expired");
  }
}
