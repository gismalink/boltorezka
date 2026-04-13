import { mapChatDomainErrorToWsNack } from "../services/chat-error-mapper.js";
import { editRoomMessage, deleteRoomMessage } from "../services/room-messages-service.js";
import type { ChatCommonParams } from "../types/chat-handler.types.ts";
import { resolveChatRoomForEvent } from "./realtime-chat-room-resolver.js";

export async function handleRoomChatEdit(params: ChatCommonParams): Promise<void> {
  const {
    connection,
    state,
    payload,
    requestId,
    eventType,
    normalizeRequestId,
    getPayloadString,
    sendNoActiveRoomNack,
    sendValidationNack,
    dbQuery,
    sendNack,
    sendJson,
    broadcastRoom,
    buildChatEditedEnvelope,
    sendAckWithMetrics
  } = params;

  const targetRoom = await resolveChatRoomForEvent({
    state,
    payload,
    getPayloadString,
    dbQuery,
    connection,
    requestId,
    eventType,
    sendNoActiveRoomNack,
    sendNack
  });
  if (!targetRoom) {
    return;
  }

  const messageId = normalizeRequestId(getPayloadString(payload, "messageId", 128));
  const text = getPayloadString(payload, "text", 20000);
  if (!messageId || !text) {
    sendValidationNack(connection, requestId, eventType, "messageId and text are required");
    return;
  }

  try {
    const updatedMessage = await editRoomMessage(dbQuery, {
      messageId,
      roomId: targetRoom.roomId,
      userId: state.userId,
      text
    });

    broadcastRoom(
      targetRoom.roomId,
      buildChatEditedEnvelope({
        id: updatedMessage.id,
        roomId: updatedMessage.room_id,
        roomSlug: targetRoom.roomSlug,
        text: updatedMessage.body,
        editedAt: updatedMessage.updated_at,
        editedByUserId: state.userId
      })
    );

    if (targetRoom.roomId !== state.roomId) {
      sendJson(
        connection,
        buildChatEditedEnvelope({
          id: updatedMessage.id,
          roomId: updatedMessage.room_id,
          roomSlug: targetRoom.roomSlug,
          text: updatedMessage.body,
          editedAt: updatedMessage.updated_at,
          editedByUserId: state.userId
        })
      );
    }

    sendAckWithMetrics(connection, requestId, eventType, {
      messageId: updatedMessage.id
    });
  } catch (error) {
    if (mapChatDomainErrorToWsNack(error, connection, requestId, eventType, sendNack)) {
      return;
    }
    throw error;
  }
}

export async function handleRoomChatDelete(params: ChatCommonParams): Promise<void> {
  const {
    connection,
    state,
    payload,
    requestId,
    eventType,
    normalizeRequestId,
    getPayloadString,
    sendNoActiveRoomNack,
    sendValidationNack,
    dbQuery,
    sendNack,
    sendJson,
    broadcastRoom,
    buildChatDeletedEnvelope,
    sendAckWithMetrics
  } = params;

  const targetRoom = await resolveChatRoomForEvent({
    state,
    payload,
    getPayloadString,
    dbQuery,
    connection,
    requestId,
    eventType,
    sendNoActiveRoomNack,
    sendNack
  });
  if (!targetRoom) {
    return;
  }

  const messageId = normalizeRequestId(getPayloadString(payload, "messageId", 128));
  if (!messageId) {
    sendValidationNack(connection, requestId, eventType, "messageId is required");
    return;
  }

  try {
    const deletedMessage = await deleteRoomMessage(dbQuery, {
      messageId,
      roomId: targetRoom.roomId,
      userId: state.userId
    });

    broadcastRoom(
      targetRoom.roomId,
      buildChatDeletedEnvelope({
        id: deletedMessage.id,
        roomId: deletedMessage.room_id,
        roomSlug: targetRoom.roomSlug,
        deletedByUserId: state.userId,
        ts: new Date().toISOString()
      })
    );

    if (targetRoom.roomId !== state.roomId) {
      sendJson(
        connection,
        buildChatDeletedEnvelope({
          id: deletedMessage.id,
          roomId: deletedMessage.room_id,
          roomSlug: targetRoom.roomSlug,
          deletedByUserId: state.userId,
          ts: new Date().toISOString()
        })
      );
    }

    sendAckWithMetrics(connection, requestId, eventType, {
      messageId: deletedMessage.id
    });
  } catch (error) {
    if (mapChatDomainErrorToWsNack(error, connection, requestId, eventType, sendNack)) {
      return;
    }
    throw error;
  }
}

export async function handleRoomChatTyping(params: ChatCommonParams): Promise<void> {
  const {
    connection,
    state,
    payload,
    requestId,
    eventType,
    getPayloadString,
    sendNoActiveRoomNack,
    dbQuery,
    sendNack,
    sendValidationNack,
    broadcastRoom,
    buildChatTypingEnvelope,
    sendAckWithMetrics
  } = params;

  if (!buildChatTypingEnvelope) {
    sendNack(connection, requestId, eventType, "ServerError", "Typing envelope builder is unavailable");
    return;
  }

  const targetRoom = await resolveChatRoomForEvent({
    state,
    payload,
    getPayloadString,
    dbQuery,
    connection,
    requestId,
    eventType,
    sendNoActiveRoomNack,
    sendNack
  });
  if (!targetRoom) {
    return;
  }

  const isTypingRaw = (payload as Record<string, unknown> | undefined)?.isTyping;
  if (typeof isTypingRaw !== "boolean") {
    sendValidationNack(connection, requestId, eventType, "isTyping boolean is required");
    return;
  }

  const typingPayload = {
    roomId: targetRoom.roomId,
    roomSlug: targetRoom.roomSlug,
    userId: state.userId,
    userName: state.userName,
    isTyping: isTypingRaw,
    ts: new Date().toISOString()
  };

  broadcastRoom(targetRoom.roomId, buildChatTypingEnvelope(typingPayload), connection);
  sendAckWithMetrics(connection, requestId, eventType);
}
