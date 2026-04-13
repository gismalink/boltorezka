import type { WebSocket } from "ws";
import { db } from "../db.js";
import { resolveEffectiveServerPermissions } from "../services/server-permissions-service.js";
import { normalizeBoundedString } from "../validators.js";
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
    const normalizedRoomSlug = normalizeBoundedString(roomSlug, 128) || "";
    if (!normalizedRoomSlug) {
      return false;
    }

    const roomResult = await db.query<{ server_id: string | null }>(
      `SELECT server_id
       FROM rooms
       WHERE slug = $1
         AND is_archived = FALSE
       LIMIT 1`,
      [normalizedRoomSlug]
    );
    const serverId = normalizeBoundedString(roomResult.rows[0]?.server_id, 128) || "";
    if (!serverId) {
      return false;
    }

    const resolved = await resolveEffectiveServerPermissions({
      serverId,
      userId
    });

    return resolved.permissions.moderateMembers;
  };

  return {
    sendJoinDeniedNack,
    sendForbiddenNack,
    isUserModerator
  };
}