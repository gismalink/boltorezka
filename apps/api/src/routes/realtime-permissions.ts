import type { WebSocket } from "ws";
import { db } from "../db.js";
import { sendNack } from "./realtime-io.js";

type IncrementMetricFn = (name: string) => Promise<unknown>;

export function createRealtimePermissionHelpers(incrementMetric: IncrementMetricFn) {
  const sendJoinDeniedNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    reason: "RoomNotFound" | "Forbidden" | "AgeVerificationRequired"
  ) => {
    sendNack(socket, requestId, eventType, reason, "Cannot join room");
    void incrementMetric("nack_sent");
  };

  const sendForbiddenNack = (
    socket: WebSocket,
    requestId: string | null,
    eventType: string,
    message = "Insufficient permissions"
  ) => {
    sendNack(socket, requestId, eventType, "Forbidden", message);
    void incrementMetric("nack_sent");
  };

  const isUserModerator = async (userId: string, roomSlug?: string | null) => {
    const normalizedRoomSlug = String(roomSlug || "").trim();
    const globalResult = await db.query<{ role: string }>("SELECT role FROM users WHERE id = $1", [userId]);
    const globalRole = String(globalResult.rows[0]?.role || "").trim();
    if (globalRole === "admin" || globalRole === "super_admin") {
      return true;
    }

    if (!normalizedRoomSlug) {
      return false;
    }

    const roomModeratorResult = await db.query<{ is_moderator: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM rooms r
         JOIN server_members sm ON sm.server_id = r.server_id
         WHERE r.slug = $2
           AND r.is_archived = FALSE
           AND sm.user_id = $1
           AND sm.status = 'active'
           AND sm.role IN ('owner', 'admin')
       ) AS is_moderator`,
      [userId, normalizedRoomSlug]
    );

    return Boolean(roomModeratorResult.rows[0]?.is_moderator);
  };

  return {
    sendJoinDeniedNack,
    sendForbiddenNack,
    isUserModerator
  };
}