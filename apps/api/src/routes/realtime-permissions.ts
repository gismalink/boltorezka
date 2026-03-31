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

  const isUserModerator = async (userId: string) => {
    const result = await db.query<{ role: string }>("SELECT role FROM users WHERE id = $1", [userId]);
    const role = String(result.rows[0]?.role || "").trim();
    return role === "admin" || role === "super_admin";
  };

  return {
    sendJoinDeniedNack,
    sendForbiddenNack,
    isUserModerator
  };
}