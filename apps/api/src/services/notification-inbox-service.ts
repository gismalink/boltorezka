import { db } from "../db.js";
import type { NotificationMode, NotificationScopeType } from "./notification-settings-service.js";
import { sendInboxPushEvent } from "./notification-push-service.js";
import { normalizeBoundedString } from "../validators.js";

type InboxEventType = "reply_to_me" | "mention_me" | "message_pinned" | "moderation_action";
type InboxPriority = "normal" | "critical";

type NotificationSettingsRow = {
  scope_type: NotificationScopeType;
  mode: NotificationMode;
  mute_until: string | null;
  allow_critical_mentions: boolean;
};

export type NotificationInboxItem = {
  id: string;
  userId: string;
  eventType: InboxEventType;
  priority: InboxPriority;
  serverId: string | null;
  roomId: string | null;
  topicId: string | null;
  messageId: string | null;
  actorUserId: string | null;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
};

export type NotificationInboxCursor = {
  beforeCreatedAt: string;
  beforeId: string;
};

export type TopicUnreadMentionItem = NotificationInboxItem;

const normId = (value: unknown) => normalizeBoundedString(value, 128) || "";
const normText = (value: unknown, maxLength: number) => normalizeBoundedString(value, maxLength) || "";

export async function listNotificationInbox(input: {
  userId: string;
  limit: number;
  unreadOnly?: boolean;
  beforeCreatedAt?: string | null;
  beforeId?: string | null;
}): Promise<{ items: NotificationInboxItem[]; hasMore: boolean; nextCursor: NotificationInboxCursor | null }> {
  const where: string[] = ["user_id = $1"];
  const params: unknown[] = [input.userId];

  const bind = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (input.unreadOnly) {
    where.push("read_at IS NULL");
  }

  if (input.beforeCreatedAt && input.beforeId) {
    where.push(`(created_at, id) < (${bind(input.beforeCreatedAt)}::timestamptz, ${bind(input.beforeId)})`);
  }

  const result = await db.query<{
    id: string;
    user_id: string;
    event_type: InboxEventType;
    priority: InboxPriority;
    server_id: string | null;
    room_id: string | null;
    topic_id: string | null;
    message_id: string | null;
    actor_user_id: string | null;
    title: string;
    body: string;
    payload: Record<string, unknown>;
    created_at: string;
    read_at: string | null;
  }>(
    `SELECT
       id,
       user_id,
       event_type,
       priority,
       server_id,
       room_id,
       topic_id,
       message_id,
       actor_user_id,
       title,
       body,
       payload,
       created_at,
       read_at
     FROM notification_inbox
     WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC, id DESC
     LIMIT ${bind(input.limit + 1)}`,
    params
  );

  const hasMore = result.rows.length > input.limit;
  const page = hasMore ? result.rows.slice(0, input.limit) : result.rows;
  const oldest = page[page.length - 1] || null;

  return {
    items: page.map((row) => ({
      id: row.id,
      userId: row.user_id,
      eventType: row.event_type,
      priority: row.priority,
      serverId: row.server_id,
      roomId: row.room_id,
      topicId: row.topic_id,
      messageId: row.message_id,
      actorUserId: row.actor_user_id,
      title: row.title,
      body: row.body,
      payload: row.payload || {},
      createdAt: row.created_at,
      readAt: row.read_at
    })),
    hasMore,
    nextCursor: hasMore && oldest
      ? {
          beforeCreatedAt: oldest.created_at,
          beforeId: oldest.id
        }
      : null
  };
}

export async function markNotificationInboxItemRead(userId: string, eventId: string): Promise<boolean> {
  const updated = await db.query(
    `UPDATE notification_inbox
     SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1
       AND user_id = $2`,
    [eventId, userId]
  );

  return (updated.rowCount || 0) > 0;
}

export async function markNotificationInboxReadAll(userId: string): Promise<number> {
  const updated = await db.query(
    `UPDATE notification_inbox
     SET read_at = NOW()
     WHERE user_id = $1
       AND read_at IS NULL`,
    [userId]
  );

  return updated.rowCount || 0;
}

export async function listTopicUnreadMentions(input: {
  userId: string;
  topicId: string;
  limit: number;
  beforeCreatedAt?: string | null;
  beforeId?: string | null;
}): Promise<{ items: TopicUnreadMentionItem[]; hasMore: boolean; nextCursor: NotificationInboxCursor | null }> {
  const where: string[] = [
    "user_id = $1",
    "topic_id = $2",
    "event_type = 'mention_me'",
    "read_at IS NULL"
  ];
  const params: unknown[] = [input.userId, input.topicId];

  const bind = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (input.beforeCreatedAt && input.beforeId) {
    where.push(`(created_at, id) < (${bind(input.beforeCreatedAt)}::timestamptz, ${bind(input.beforeId)})`);
  }

  const result = await db.query<{
    id: string;
    user_id: string;
    event_type: InboxEventType;
    priority: InboxPriority;
    server_id: string | null;
    room_id: string | null;
    topic_id: string | null;
    message_id: string | null;
    actor_user_id: string | null;
    title: string;
    body: string;
    payload: Record<string, unknown>;
    created_at: string;
    read_at: string | null;
  }>(
    `SELECT
       id,
       user_id,
       event_type,
       priority,
       server_id,
       room_id,
       topic_id,
       message_id,
       actor_user_id,
       title,
       body,
       payload,
       created_at,
       read_at
     FROM notification_inbox
     WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC, id DESC
     LIMIT ${bind(input.limit + 1)}`,
    params
  );

  const hasMore = result.rows.length > input.limit;
  const page = hasMore ? result.rows.slice(0, input.limit) : result.rows;
  const oldest = page[page.length - 1] || null;

  return {
    items: page.map((row) => ({
      id: row.id,
      userId: row.user_id,
      eventType: row.event_type,
      priority: row.priority,
      serverId: row.server_id,
      roomId: row.room_id,
      topicId: row.topic_id,
      messageId: row.message_id,
      actorUserId: row.actor_user_id,
      title: row.title,
      body: row.body,
      payload: row.payload || {},
      createdAt: row.created_at,
      readAt: row.read_at
    })),
    hasMore,
    nextCursor: hasMore && oldest
      ? {
          beforeCreatedAt: oldest.created_at,
          beforeId: oldest.id
        }
      : null
  };
}

export async function markTopicUnreadMentionsReadAll(input: {
  userId: string;
  topicId: string;
}): Promise<number> {
  const updated = await db.query(
    `UPDATE notification_inbox
     SET read_at = NOW()
     WHERE user_id = $1
       AND topic_id = $2
       AND event_type = 'mention_me'
       AND read_at IS NULL`,
    [input.userId, input.topicId]
  );

  return updated.rowCount || 0;
}

function parseMentionHandles(text: string): { mentionsAll: boolean; handles: Set<string> } {
  const normalized = String(text || "");
  const handles = new Set<string>();
  const mentionPattern = /@([\p{L}\p{N}._-]{2,32})/gu;

  let match: RegExpExecArray | null;
  while ((match = mentionPattern.exec(normalized)) !== null) {
    const handle = normText(match[1], 64).toLowerCase();
    if (handle) {
      handles.add(handle);
    }
  }

  const mentionsAll = handles.has("all") || handles.has("here");
  handles.delete("all");
  handles.delete("here");

  return { mentionsAll, handles };
}

function normalizeMentionUserIds(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set<string>();
  const ids: string[] = [];

  input.forEach((value) => {
    const normalized = normId(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    ids.push(normalized);
  });

  return ids;
}

async function resolveRoomAudience(roomId: string, actorUserId: string): Promise<Array<{ userId: string; name: string; username: string | null }>> {
  const result = await db.query<{ user_id: string; name: string; username: string | null }>(
    `SELECT DISTINCT rm.user_id, u.name, u.username
     FROM room_members rm
     JOIN users u ON u.id = rm.user_id
     WHERE rm.room_id = $1
       AND rm.user_id <> $2
       AND u.is_banned = FALSE`,
    [roomId, actorUserId]
  );

  return result.rows.map((row) => ({
    userId: row.user_id,
    name: String(row.name || ""),
    username: row.username
  }));
}

async function resolveRoomServerId(roomId: string): Promise<string | null> {
  const result = await db.query<{ server_id: string | null }>(
    `SELECT server_id FROM rooms WHERE id = $1 LIMIT 1`,
    [roomId]
  );

  return normalizeBoundedString(result.rows[0]?.server_id, 128);
}

async function loadEffectiveNotificationSettings(userId: string, scope: {
  serverId: string | null;
  roomId: string;
  topicId: string | null;
}): Promise<{
  mode: NotificationMode;
  muteUntil: string | null;
  allowCriticalMentions: boolean;
}> {
  const result = await db.query<NotificationSettingsRow>(
    `SELECT scope_type, mode, mute_until, allow_critical_mentions
     FROM room_notification_settings
     WHERE user_id = $1
       AND (
         (scope_type = 'topic' AND topic_id = $2)
         OR (scope_type = 'room' AND room_id = $3)
         OR (scope_type = 'server' AND server_id = $4)
       )`,
    [userId, scope.topicId, scope.roomId, scope.serverId]
  );

  const byScope = new Map<NotificationScopeType, NotificationSettingsRow>();
  result.rows.forEach((row) => byScope.set(row.scope_type, row));
  const effective = byScope.get("topic") || byScope.get("room") || byScope.get("server");

  return {
    mode: effective?.mode || "all",
    muteUntil: effective?.mute_until || null,
    allowCriticalMentions: effective?.allow_critical_mentions !== false
  };
}

function isMutedNow(muteUntil: string | null): boolean {
  if (!muteUntil) {
    return false;
  }

  const ts = new Date(muteUntil).getTime();
  return Number.isFinite(ts) && ts > Date.now();
}

async function insertInboxEvent(input: {
  userId: string;
  eventType: InboxEventType;
  priority: InboxPriority;
  serverId: string | null;
  roomId: string | null;
  topicId: string | null;
  messageId: string | null;
  actorUserId: string | null;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  dedupeKey?: string;
}) {
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO notification_inbox (
       user_id, event_type, priority, server_id, room_id, topic_id, message_id, actor_user_id,
       title, body, payload, dedupe_key
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      input.userId,
      input.eventType,
      input.priority,
      input.serverId,
      input.roomId,
      input.topicId,
      input.messageId,
      input.actorUserId,
      input.title,
      input.body,
      JSON.stringify(input.payload || {}),
      input.dedupeKey || null
    ]
  );

  const eventId = normId(inserted.rows[0]?.id);
  if (!eventId) {
    return;
  }

  void sendInboxPushEvent({
    userId: input.userId,
    eventId,
    title: input.title,
    body: input.body,
    priority: input.priority,
    roomSlug: typeof input.payload.roomSlug === "string" ? input.payload.roomSlug : null,
    topicId: input.topicId,
    messageId: input.messageId
  });
}

export async function emitReplyInboxEvent(input: {
  actorUserId: string;
  actorUserName: string;
  targetUserId: string | null;
  roomId: string;
  roomSlug: string;
  topicId: string | null;
  topicSlug: string | null;
  messageId: string;
  text: string;
}) {
  const targetUserId = normId(input.targetUserId);
  if (!targetUserId || targetUserId === input.actorUserId) {
    return;
  }

  const serverId = await resolveRoomServerId(input.roomId);
  const settings = await loadEffectiveNotificationSettings(targetUserId, {
    serverId,
    roomId: input.roomId,
    topicId: input.topicId
  });

  if (settings.mode === "none") {
    return;
  }

  if (isMutedNow(settings.muteUntil)) {
    return;
  }

  const body = normText(input.text, 240) || "Reply";
  await insertInboxEvent({
    userId: targetUserId,
    eventType: "reply_to_me",
    priority: "normal",
    serverId,
    roomId: input.roomId,
    topicId: input.topicId,
    messageId: input.messageId,
    actorUserId: input.actorUserId,
    title: `Reply from ${input.actorUserName}`,
    body,
    payload: {
      roomSlug: input.roomSlug,
      topicSlug: input.topicSlug,
      topicId: input.topicId,
      messageId: input.messageId
    },
    dedupeKey: `reply:${input.messageId}:${targetUserId}`
  });
}

export async function emitMentionInboxEvents(input: {
  actorUserId: string;
  actorUserName: string;
  roomId: string;
  roomSlug: string;
  topicId: string | null;
  topicSlug: string | null;
  messageId: string;
  text: string;
  mentionUserIds?: string[];
}): Promise<string[]> {
  const explicitMentionUserIds = normalizeMentionUserIds(input.mentionUserIds);
  const parsed = parseMentionHandles(input.text);
  if (explicitMentionUserIds.length === 0 && !parsed.mentionsAll) {
    return [];
  }

  const audience = await resolveRoomAudience(input.roomId, input.actorUserId);
  if (audience.length === 0) {
    return [];
  }

  const audienceByUserId = new Map<string, { userId: string; name: string; username: string | null }>();
  audience.forEach((entry) => {
    audienceByUserId.set(entry.userId, entry);
  });

  const targetedMentionUserIds = new Set<string>();
  explicitMentionUserIds.forEach((userId) => {
    if (audienceByUserId.has(userId)) {
      targetedMentionUserIds.add(userId);
    }
  });

  const serverId = await resolveRoomServerId(input.roomId);
  const body = normText(input.text, 240) || "Mention";
  const resolvedMentionTargets = new Set<string>();

  for (const user of audience) {
    const directMentioned = targetedMentionUserIds.has(user.userId);
    const isCritical = parsed.mentionsAll;
    if (!directMentioned && !isCritical) {
      continue;
    }

    resolvedMentionTargets.add(user.userId);

    const settings = await loadEffectiveNotificationSettings(user.userId, {
      serverId,
      roomId: input.roomId,
      topicId: input.topicId
    });

    if (settings.mode === "none") {
      continue;
    }

    if (settings.mode === "mentions" || settings.mode === "all") {
      await insertInboxEvent({
        userId: user.userId,
        eventType: "mention_me",
        priority: isCritical ? "critical" : "normal",
        serverId,
        roomId: input.roomId,
        topicId: input.topicId,
        messageId: input.messageId,
        actorUserId: input.actorUserId,
        title: isCritical ? `Critical mention from ${input.actorUserName}` : `Mention from ${input.actorUserName}`,
        body,
        payload: {
          roomSlug: input.roomSlug,
          topicSlug: input.topicSlug,
          topicId: input.topicId,
          messageId: input.messageId,
          critical: isCritical
        },
        dedupeKey: `mention:${input.messageId}:${user.userId}`
      });
    }
  }

  return Array.from(resolvedMentionTargets);
}

export async function emitPinnedInboxEvent(input: {
  actorUserId: string;
  actorUserName: string;
  targetMessageAuthorUserId: string | null;
  roomId: string;
  roomSlug: string;
  topicId: string | null;
  topicSlug: string | null;
  messageId: string;
}) {
  const targetUserId = normId(input.targetMessageAuthorUserId);
  if (!targetUserId || targetUserId === input.actorUserId) {
    return;
  }

  const serverId = await resolveRoomServerId(input.roomId);
  const settings = await loadEffectiveNotificationSettings(targetUserId, {
    serverId,
    roomId: input.roomId,
    topicId: input.topicId
  });

  if (settings.mode !== "all") {
    return;
  }

  if (isMutedNow(settings.muteUntil)) {
    return;
  }

  await insertInboxEvent({
    userId: targetUserId,
    eventType: "message_pinned",
    priority: "normal",
    serverId,
    roomId: input.roomId,
    topicId: input.topicId,
    messageId: input.messageId,
    actorUserId: input.actorUserId,
    title: `Message pinned by ${input.actorUserName}`,
    body: "Your message was pinned",
    payload: {
      roomSlug: input.roomSlug,
      topicSlug: input.topicSlug,
      topicId: input.topicId,
      messageId: input.messageId
    },
    dedupeKey: `pin:${input.messageId}:${targetUserId}:${input.actorUserId}`
  });
}

export async function emitModerationInboxEvent(input: {
  actorUserId: string | null;
  actorUserName: string;
  targetUserId: string | null;
  action: string;
  title: string;
  body: string;
  serverId?: string | null;
  roomId?: string | null;
  roomSlug?: string | null;
  topicId?: string | null;
  topicSlug?: string | null;
  messageId?: string | null;
}) {
  const targetUserId = normId(input.targetUserId);
  if (!targetUserId) {
    return;
  }

  const actorUserId = normalizeBoundedString(input.actorUserId, 128);
  if (actorUserId && actorUserId === targetUserId) {
    return;
  }

  const roomId = normalizeBoundedString(input.roomId, 128);
  const messageId = normalizeBoundedString(input.messageId, 128);

  await insertInboxEvent({
    userId: targetUserId,
    eventType: "moderation_action",
    priority: "critical",
    serverId: normalizeBoundedString(input.serverId, 128),
    roomId,
    topicId: normalizeBoundedString(input.topicId, 128),
    messageId,
    actorUserId,
    title: String(input.title || "Moderation action").slice(0, 160),
    body: String(input.body || "A moderation action affected your account").slice(0, 300),
    payload: {
      action: String(input.action || "moderation.action"),
      actorUserName: normalizeBoundedString(input.actorUserName, 160),
      roomSlug: normalizeBoundedString(input.roomSlug, 160),
      topicSlug: normalizeBoundedString(input.topicSlug, 160),
      topicId: normalizeBoundedString(input.topicId, 128),
      messageId
    }
  });
}
