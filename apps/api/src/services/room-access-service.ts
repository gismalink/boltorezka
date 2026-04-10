/**
 * Сервис доступа к комнатам.
 *
 * Извлечён из realtime-chat.ts — содержит всю логику проверки доступа к комнатам:
 * - resolveRoomById — получить комнату по ID (без проверки прав, для уже авторизованной сессии).
 * - resolveRoomBySlugWithAccessCheck — получить комнату по slug + полная проверка прав
 *   (NSFW/hidden/private membership).
 * - canBypassRoomSendPolicy — проверка обхода send-политик для admin/owner.
 * - resolveRoomRealtimeAudienceUserIds — определение аудитории для broadcast
 *   (hidden → grants+members, public → server members, private → room members).
 *
 * Переиспользуется в realtime-chat.ts, а в будущем — в DM и других модулях.
 */

// Lazy import: age-verification-service тянет db.js → config.ts,
// что ломает unit-тесты без DATABASE_URL. Импортируем только при вызове.
async function getIsServerAgeConfirmed(): Promise<(serverId: string, userId: string) => Promise<boolean>> {
  const { isServerAgeConfirmed } = await import("./age-verification-service.js");
  return isServerAgeConfirmed;
}

export type DbQuery = <T = unknown>(
  text: string,
  params?: unknown[]
) => Promise<{ rowCount: number | null; rows: T[] }>;

export type ResolvedChatRoom = {
  roomId: string;
  roomSlug: string;
  serverId: string | null;
  isReadonly: boolean;
  slowmodeSeconds: number;
};

export type RoomAccessError = {
  code: string;
  message: string;
};

export async function canBypassRoomSendPolicy(
  dbQuery: DbQuery,
  userId: string,
  serverId: string | null
): Promise<boolean> {
  const globalRoleResult = await dbQuery<{ role: string }>(
    `SELECT role
     FROM users
     WHERE id = $1
       AND is_banned = FALSE
     LIMIT 1`,
    [userId]
  );

  const globalRole = String(globalRoleResult.rows[0]?.role || "").trim();
  if (globalRole === "admin" || globalRole === "super_admin") {
    return true;
  }

  const normalizedServerId = String(serverId || "").trim();
  if (!normalizedServerId) {
    return false;
  }

  const membership = await dbQuery<{ role: string }>(
    `SELECT role
     FROM server_members
     WHERE server_id = $1
       AND user_id = $2
       AND status = 'active'
     LIMIT 1`,
    [normalizedServerId, userId]
  );

  const serverRole = String(membership.rows[0]?.role || "").trim();
  return serverRole === "owner" || serverRole === "admin";
}

export async function resolveRoomRealtimeAudienceUserIds(
  dbQuery: DbQuery,
  roomId: string
): Promise<string[]> {
  const roomMeta = await dbQuery<{
    id: string;
    server_id: string | null;
    is_public: boolean;
    is_hidden: boolean;
  }>(
    `SELECT id, server_id, is_public, is_hidden
     FROM rooms
     WHERE id = $1
       AND is_archived = FALSE
     LIMIT 1`,
    [roomId]
  );

  const room = roomMeta.rows[0];
  if (!room) {
    return [];
  }

  if (room.is_hidden) {
    const hiddenAudience = await dbQuery<{ user_id: string }>(
      `SELECT DISTINCT user_id
       FROM (
         SELECT user_id
         FROM room_members
         WHERE room_id = $1
         UNION
         SELECT user_id
         FROM room_visibility_grants
         WHERE room_id = $1
       ) audience`,
      [roomId]
    );

    return hiddenAudience.rows
      .map((entry) => String(entry.user_id || "").trim())
      .filter(Boolean);
  }

  if (room.is_public && room.server_id) {
    const serverAudience = await dbQuery<{ user_id: string }>(
      `SELECT user_id
       FROM server_members
       WHERE server_id = $1
         AND status = 'active'`,
      [room.server_id]
    );

    return serverAudience.rows
      .map((entry) => String(entry.user_id || "").trim())
      .filter(Boolean);
  }

  const privateAudience = await dbQuery<{ user_id: string }>(
    `SELECT user_id
     FROM room_members
     WHERE room_id = $1`,
    [roomId]
  );

  return privateAudience.rows
    .map((entry) => String(entry.user_id || "").trim())
    .filter(Boolean);
}

export async function resolveRoomById(
  dbQuery: DbQuery,
  roomId: string
): Promise<ResolvedChatRoom | null> {
  const roomById = await dbQuery<{
    id: string;
    slug: string;
    server_id: string | null;
    is_readonly: boolean;
    slowmode_seconds: number;
  }>(
    `SELECT id, slug, server_id, is_readonly, slowmode_seconds
     FROM rooms
     WHERE id = $1
       AND is_archived = FALSE
     LIMIT 1`,
    [roomId]
  );

  const room = roomById.rows[0];
  if (!room) {
    return null;
  }

  return {
    roomId: room.id,
    roomSlug: room.slug,
    serverId: room.server_id,
    isReadonly: Boolean(room.is_readonly),
    slowmodeSeconds: Number(room.slowmode_seconds || 0)
  };
}

export async function resolveRoomBySlugWithAccessCheck(
  dbQuery: DbQuery,
  slug: string,
  userId: string,
  opts?: { activeRoomId?: string | null; activeRoomSlug?: string | null }
): Promise<{ room: ResolvedChatRoom } | { error: RoomAccessError }> {
  const roomResult = await dbQuery<{
    id: string;
    slug: string;
    is_public: boolean;
    is_hidden: boolean;
    server_id: string | null;
    nsfw: boolean | null;
    is_readonly: boolean;
    slowmode_seconds: number;
  }>(
    `SELECT r.id, r.slug, r.is_public, r.is_hidden, r.server_id, r.nsfw, r.is_readonly, r.slowmode_seconds
     FROM rooms r
     LEFT JOIN servers s ON s.id = r.server_id
     WHERE r.slug = $1
       AND r.is_archived = FALSE
       AND (r.server_id IS NULL OR (s.is_archived = FALSE AND s.is_blocked = FALSE))
     LIMIT 1`,
    [slug]
  );

  if ((roomResult.rowCount || 0) === 0) {
    return { error: { code: "RoomNotFound", message: "Room does not exist" } };
  }

  const room = roomResult.rows[0];

  if (room.nsfw === true) {
    const serverId = String(room.server_id || "").trim();
    const isServerAgeConfirmed = await getIsServerAgeConfirmed();
    const confirmed = serverId ? await isServerAgeConfirmed(serverId, userId) : false;
    if (!confirmed) {
      return {
        error: {
          code: "AgeVerificationRequired",
          message: "Age verification is required for NSFW access"
        }
      };
    }
  }

  if (room.is_hidden) {
    const hiddenAccess = await dbQuery(
      `SELECT EXISTS(
         SELECT 1
         FROM room_visibility_grants
         WHERE room_id = $1 AND user_id = $2
       )
       OR EXISTS(
         SELECT 1
         FROM room_members
         WHERE room_id = $1 AND user_id = $2
       ) AS has_access`,
      [room.id, userId]
    );

    const hasHiddenAccess = Boolean(
      (hiddenAccess.rows[0] as { has_access?: boolean } | undefined)?.has_access
    );
    const isCurrentActiveRoom = opts?.activeRoomId === room.id && opts?.activeRoomSlug === room.slug;
    if (!hasHiddenAccess && !isCurrentActiveRoom) {
      return { error: { code: "Forbidden", message: "You cannot access this room" } };
    }
  }

  if (!room.is_public) {
    const membership = await dbQuery(
      `SELECT 1
       FROM room_members
       WHERE room_id = $1 AND user_id = $2
       LIMIT 1`,
      [room.id, userId]
    );

    if ((membership.rowCount || 0) === 0) {
      return { error: { code: "Forbidden", message: "You cannot access this room" } };
    }
  }

  return {
    room: {
      roomId: room.id,
      roomSlug: room.slug,
      serverId: room.server_id,
      isReadonly: Boolean(room.is_readonly),
      slowmodeSeconds: Number(room.slowmode_seconds || 0)
    }
  };
}
