import type { ChatCommonParams } from "../types/chat-handler.types.ts";
import {
  resolveRoomById,
  resolveRoomBySlugWithAccessCheck,
  type ResolvedChatRoom
} from "../services/room-access-service.js";

export async function resolveChatRoomForEvent(
  params: Pick<
    ChatCommonParams,
    "state" | "payload" | "getPayloadString" | "dbQuery" | "connection" | "requestId" | "eventType" | "sendNoActiveRoomNack" | "sendNack"
  >
): Promise<ResolvedChatRoom | null> {
  const {
    state,
    payload,
    getPayloadString,
    dbQuery,
    connection,
    requestId,
    eventType,
    sendNoActiveRoomNack,
    sendNack
  } = params;

  const targetRoomSlug = getPayloadString(payload as Record<string, unknown>, "roomSlug", 128)
    || (typeof state.roomSlug === "string" ? state.roomSlug.trim() : "");

  if (!targetRoomSlug) {
    if (!state.roomId || !state.roomSlug) {
      sendNoActiveRoomNack(connection, requestId, eventType);
      return null;
    }

    const room = await resolveRoomById(dbQuery, state.roomId);
    if (!room) {
      sendNack(connection, requestId, eventType, "RoomNotFound", "Room does not exist");
      return null;
    }
    return room;
  }

  const result = await resolveRoomBySlugWithAccessCheck(dbQuery, targetRoomSlug, state.userId, {
    activeRoomId: state.roomId,
    activeRoomSlug: state.roomSlug
  });
  if ("error" in result) {
    sendNack(connection, requestId, eventType, result.error.code, result.error.message);
    return null;
  }
  return result.room;
}
