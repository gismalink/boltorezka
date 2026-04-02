import { db } from "../db.js";
import type { RoomRow } from "../db.types.ts";
import { isServerAgeConfirmed } from "../services/age-verification-service.js";

export type CanJoinRoomResult =
  | { ok: true; room: RoomRow }
  | { ok: false; reason: "RoomNotFound" | "Forbidden" | "AgeVerificationRequired" };

export async function canJoinRoom(roomSlug: string, userId: string): Promise<CanJoinRoomResult> {
  const room = await db.query<RoomRow>(
    `SELECT r.id, r.slug, r.title, r.kind, r.is_public, r.is_hidden, r.server_id, r.nsfw
     FROM rooms r
     LEFT JOIN servers s ON s.id = r.server_id
     WHERE r.slug = $1
       AND r.is_archived = FALSE
       AND (r.server_id IS NULL OR (s.is_archived = FALSE AND s.is_blocked = FALSE))`,
    [roomSlug]
  );

  if (room.rowCount === 0) {
    return { ok: false, reason: "RoomNotFound" };
  }

  const selectedRoom = room.rows[0];

  if (selectedRoom.nsfw === true) {
    const serverId = String(selectedRoom.server_id || "").trim();
    const confirmed = serverId ? await isServerAgeConfirmed(serverId, userId) : false;
    if (!confirmed) {
      return { ok: false, reason: "AgeVerificationRequired" };
    }
  }

  if (selectedRoom.is_hidden) {
    const visibilityGrant = await db.query(
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
      [selectedRoom.id, userId]
    );

    if ((visibilityGrant.rowCount || 0) === 0) {
      return { ok: false, reason: "Forbidden" };
    }
  }

  if (!selectedRoom.is_public) {
    const membership = await db.query(
      "SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2",
      [selectedRoom.id, userId]
    );

    if (membership.rowCount === 0) {
      return { ok: false, reason: "Forbidden" };
    }
  }

  await db.query(
    `INSERT INTO room_members (room_id, user_id, role)
     VALUES ($1, $2, 'member')
     ON CONFLICT (room_id, user_id) DO NOTHING`,
    [selectedRoom.id, userId]
  );

  return {
    ok: true,
    room: selectedRoom
  };
}