import { db } from "../db.js";

export type NotificationScopeType = "server" | "room" | "topic";
export type NotificationMode = "all" | "mentions" | "none";

export type UpsertNotificationSettingsInput = {
  userId: string;
  scopeType: NotificationScopeType;
  serverId?: string;
  roomId?: string;
  topicId?: string;
  mode: NotificationMode;
  muteUntil?: string | null;
  allowCriticalMentions?: boolean;
};

export type NotificationSettingsItem = {
  id: string;
  userId: string;
  scopeType: NotificationScopeType;
  serverId: string | null;
  roomId: string | null;
  topicId: string | null;
  mode: NotificationMode;
  muteUntil: string | null;
  allowCriticalMentions: boolean;
  createdAt: string;
  updatedAt: string;
};

async function canAccessServer(userId: string, serverId: string): Promise<boolean> {
  const membership = await db.query(
    `SELECT 1
     FROM server_members
     WHERE server_id = $1
       AND user_id = $2
       AND status = 'active'
     LIMIT 1`,
    [serverId, userId]
  );

  return (membership.rowCount || 0) > 0;
}

async function canAccessRoom(userId: string, roomId: string): Promise<boolean> {
  const room = await db.query<{ id: string; server_id: string | null; is_public: boolean; is_hidden: boolean }>(
    `SELECT id, server_id, is_public, is_hidden
     FROM rooms
     WHERE id = $1
       AND is_archived = FALSE
     LIMIT 1`,
    [roomId]
  );

  const row = room.rows[0];
  if (!row) {
    return false;
  }

  if (row.server_id) {
    const serverAllowed = await canAccessServer(userId, row.server_id);
    if (!serverAllowed) {
      return false;
    }
  }

  if (row.is_hidden) {
    const hiddenAccess = await db.query(
      `SELECT 1
       WHERE EXISTS (
         SELECT 1
         FROM room_visibility_grants
         WHERE room_id = $1 AND user_id = $2
       )
       OR EXISTS (
         SELECT 1
         FROM room_members
         WHERE room_id = $1 AND user_id = $2
       )
       LIMIT 1`,
      [roomId, userId]
    );

    if ((hiddenAccess.rowCount || 0) === 0) {
      return false;
    }
  }

  if (!row.is_public) {
    const privateMembership = await db.query(
      `SELECT 1
       FROM room_members
       WHERE room_id = $1
         AND user_id = $2
       LIMIT 1`,
      [roomId, userId]
    );

    if ((privateMembership.rowCount || 0) === 0) {
      return false;
    }
  }

  return true;
}

async function resolveTopicRoom(topicId: string): Promise<string | null> {
  const result = await db.query<{ room_id: string }>(
    `SELECT room_id
     FROM room_topics
     WHERE id = $1
     LIMIT 1`,
    [topicId]
  );

  return String(result.rows[0]?.room_id || "").trim() || null;
}

export async function upsertNotificationSettings(input: UpsertNotificationSettingsInput): Promise<NotificationSettingsItem> {
  if (input.scopeType === "server") {
    if (!input.serverId) {
      throw new Error("validation_error");
    }

    const allowed = await canAccessServer(input.userId, input.serverId);
    if (!allowed) {
      throw new Error("forbidden_scope");
    }

    const upserted = await db.query<NotificationSettingsItem>(
      `INSERT INTO room_notification_settings (user_id, scope_type, server_id, mode, mute_until, allow_critical_mentions)
       VALUES ($1, 'server', $2, $3, $4, $5)
       ON CONFLICT (user_id, server_id) WHERE scope_type = 'server'
       DO UPDATE SET
         mode = EXCLUDED.mode,
         mute_until = EXCLUDED.mute_until,
         allow_critical_mentions = EXCLUDED.allow_critical_mentions,
         updated_at = NOW()
       RETURNING
         id,
         user_id AS "userId",
         scope_type AS "scopeType",
         server_id AS "serverId",
         room_id AS "roomId",
         topic_id AS "topicId",
         mode,
         mute_until AS "muteUntil",
        allow_critical_mentions AS "allowCriticalMentions",
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [input.userId, input.serverId, input.mode, input.muteUntil || null, input.allowCriticalMentions !== false]
    );

    return upserted.rows[0];
  }

  if (input.scopeType === "room") {
    if (!input.roomId) {
      throw new Error("validation_error");
    }

    const allowed = await canAccessRoom(input.userId, input.roomId);
    if (!allowed) {
      throw new Error("forbidden_scope");
    }

    const upserted = await db.query<NotificationSettingsItem>(
      `INSERT INTO room_notification_settings (user_id, scope_type, room_id, mode, mute_until, allow_critical_mentions)
       VALUES ($1, 'room', $2, $3, $4, $5)
       ON CONFLICT (user_id, room_id) WHERE scope_type = 'room'
       DO UPDATE SET
         mode = EXCLUDED.mode,
         mute_until = EXCLUDED.mute_until,
         allow_critical_mentions = EXCLUDED.allow_critical_mentions,
         updated_at = NOW()
       RETURNING
         id,
         user_id AS "userId",
         scope_type AS "scopeType",
         server_id AS "serverId",
         room_id AS "roomId",
         topic_id AS "topicId",
         mode,
         mute_until AS "muteUntil",
        allow_critical_mentions AS "allowCriticalMentions",
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [input.userId, input.roomId, input.mode, input.muteUntil || null, input.allowCriticalMentions !== false]
    );

    return upserted.rows[0];
  }

  if (!input.topicId) {
    throw new Error("validation_error");
  }

  const roomId = await resolveTopicRoom(input.topicId);
  if (!roomId) {
    throw new Error("scope_not_found");
  }

  const allowed = await canAccessRoom(input.userId, roomId);
  if (!allowed) {
    throw new Error("forbidden_scope");
  }

  const upserted = await db.query<NotificationSettingsItem>(
    `INSERT INTO room_notification_settings (user_id, scope_type, topic_id, mode, mute_until, allow_critical_mentions)
     VALUES ($1, 'topic', $2, $3, $4, $5)
     ON CONFLICT (user_id, topic_id) WHERE scope_type = 'topic'
     DO UPDATE SET
       mode = EXCLUDED.mode,
       mute_until = EXCLUDED.mute_until,
       allow_critical_mentions = EXCLUDED.allow_critical_mentions,
       updated_at = NOW()
     RETURNING
       id,
       user_id AS "userId",
       scope_type AS "scopeType",
       server_id AS "serverId",
       room_id AS "roomId",
       topic_id AS "topicId",
       mode,
       mute_until AS "muteUntil",
       allow_critical_mentions AS "allowCriticalMentions",
       created_at AS "createdAt",
       updated_at AS "updatedAt"`,
     [input.userId, input.topicId, input.mode, input.muteUntil || null, input.allowCriticalMentions !== false]
  );

  return upserted.rows[0];
}
