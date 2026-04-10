/**
 * Единый маппер доменных ошибок чата → WS NACK ответы.
 *
 * Объединяет ранее дублировавшиеся mapTopicSendDomainErrorToWsNack и mapTopicDomainErrorToNack
 * из realtime-chat.ts в один переиспользуемый модуль.
 *
 * Правила:
 * - Каждая доменная ошибка (message сервиса) маппится на (code, humanMessage) для клиента.
 * - Возвращает true, если ошибка обработана (sendNack отправлен); false — если неизвестная.
 * - Вызывающий код при false должен сам обработать или перебросить ошибку.
 */
import type { WebSocket } from "ws";

type SendNackFn = (
  socket: WebSocket,
  requestId: string | null,
  eventType: string,
  code: string,
  message: string,
  meta?: Record<string, unknown>
) => void;

export function mapChatDomainErrorToWsNack(
  error: unknown,
  connection: WebSocket,
  requestId: string | null,
  eventType: string,
  sendNack: SendNackFn
): boolean {
  const message = String((error as Error)?.message || "").trim();

  if (message === "topic_not_found" || message === "message_not_found" || message === "room_not_found") {
    sendNack(connection, requestId, eventType, "MessageNotFound", "Message not found");
    return true;
  }

  if (message === "forbidden_room_access" || message === "forbidden_topic_manage") {
    sendNack(connection, requestId, eventType, "Forbidden", "You do not have access to this resource");
    return true;
  }

  if (message === "topic_archived") {
    sendNack(connection, requestId, eventType, "TopicArchived", "Topic is archived");
    return true;
  }

  if (message === "room_readonly") {
    sendNack(connection, requestId, eventType, "RoomReadOnly", "Room is read-only");
    return true;
  }

  if (message === "server_member_muted") {
    sendNack(connection, requestId, eventType, "ServerMemberMuted", "You are muted in this server");
    return true;
  }

  if (message.startsWith("room_slowmode_active:")) {
    const retryAfterSec = Math.max(1, Number.parseInt(message.split(":")[1] || "1", 10) || 1);
    sendNack(connection, requestId, eventType, "SlowmodeActive", "Slowmode is active", {
      retryAfterSec
    });
    return true;
  }

  if (message === "validation_error") {
    sendNack(connection, requestId, eventType, "ValidationError", "Validation failed");
    return true;
  }

  if (message === "user_not_found") {
    sendNack(connection, requestId, eventType, "UserNotFound", "User does not exist");
    return true;
  }

  if (message === "cannot_report_own_message") {
    sendNack(connection, requestId, eventType, "Forbidden", "You cannot report your own message");
    return true;
  }

  if (message === "message_report_exists") {
    sendNack(connection, requestId, eventType, "MessageAlreadyReported", "Message is already reported by this user");
    return true;
  }

  if (message === "forbidden_edit" || message === "forbidden_delete") {
    sendNack(connection, requestId, eventType, "Forbidden", "You can only modify your own messages");
    return true;
  }

  if (message === "edit_window_expired") {
    sendNack(connection, requestId, eventType, "EditWindowExpired", "Message edit window has expired");
    return true;
  }

  if (message === "delete_window_expired") {
    sendNack(connection, requestId, eventType, "DeleteWindowExpired", "Message delete window has expired");
    return true;
  }

  return false;
}
