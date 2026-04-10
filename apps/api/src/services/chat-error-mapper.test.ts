/**
 * Тесты для chat-error-mapper.
 *
 * Проверяют маппинг всех доменных ошибок чата → WS NACK ответы:
 * - Каждый код ошибки маппится на правильный (code, message).
 * - Неизвестные ошибки не обрабатываются (возврат false).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mapChatDomainErrorToWsNack } from "./chat-error-mapper.js";

/** Хелпер: создаёт запись вызова sendNack и возвращает результат маппинга */
function callMapper(errorMessage: string) {
  let captured: { code: string; message: string; meta?: Record<string, unknown> } | null = null;
  const sendNack = (
    _socket: unknown,
    _requestId: string | null,
    _eventType: string,
    code: string,
    msg: string,
    meta?: Record<string, unknown>
  ) => {
    captured = { code, message: msg, meta };
  };

  const handled = mapChatDomainErrorToWsNack(
    new Error(errorMessage),
    {} as never,     // фиктивный socket
    "req-1",
    "chat.send",
    sendNack as never
  );

  return { handled, captured };
}

// --- Обработанные ошибки ---

test("error-mapper: topic_not_found → MessageNotFound", () => {
  const { handled, captured } = callMapper("topic_not_found");
  assert.equal(handled, true);
  assert.equal(captured!.code, "MessageNotFound");
});

test("error-mapper: message_not_found → MessageNotFound", () => {
  const { handled, captured } = callMapper("message_not_found");
  assert.equal(handled, true);
  assert.equal(captured!.code, "MessageNotFound");
});

test("error-mapper: room_not_found → MessageNotFound", () => {
  const { handled, captured } = callMapper("room_not_found");
  assert.equal(handled, true);
  assert.equal(captured!.code, "MessageNotFound");
});

test("error-mapper: forbidden_room_access → Forbidden", () => {
  const { handled, captured } = callMapper("forbidden_room_access");
  assert.equal(handled, true);
  assert.equal(captured!.code, "Forbidden");
  assert.match(captured!.message, /access/);
});

test("error-mapper: forbidden_topic_manage → Forbidden", () => {
  const { handled, captured } = callMapper("forbidden_topic_manage");
  assert.equal(handled, true);
  assert.equal(captured!.code, "Forbidden");
});

test("error-mapper: topic_archived → TopicArchived", () => {
  const { handled, captured } = callMapper("topic_archived");
  assert.equal(handled, true);
  assert.equal(captured!.code, "TopicArchived");
});

test("error-mapper: room_readonly → RoomReadOnly", () => {
  const { handled, captured } = callMapper("room_readonly");
  assert.equal(handled, true);
  assert.equal(captured!.code, "RoomReadOnly");
});

test("error-mapper: server_member_muted → ServerMemberMuted", () => {
  const { handled, captured } = callMapper("server_member_muted");
  assert.equal(handled, true);
  assert.equal(captured!.code, "ServerMemberMuted");
});

test("error-mapper: room_slowmode_active:5 → SlowmodeActive with retryAfterSec=5", () => {
  const { handled, captured } = callMapper("room_slowmode_active:5");
  assert.equal(handled, true);
  assert.equal(captured!.code, "SlowmodeActive");
  assert.equal(captured!.meta!.retryAfterSec, 5);
});

test("error-mapper: room_slowmode_active:0 → SlowmodeActive with retryAfterSec=1 (min clamp)", () => {
  const { handled, captured } = callMapper("room_slowmode_active:0");
  assert.equal(handled, true);
  assert.equal(captured!.meta!.retryAfterSec, 1);
});

test("error-mapper: validation_error → ValidationError", () => {
  const { handled, captured } = callMapper("validation_error");
  assert.equal(handled, true);
  assert.equal(captured!.code, "ValidationError");
});

test("error-mapper: user_not_found → UserNotFound", () => {
  const { handled, captured } = callMapper("user_not_found");
  assert.equal(handled, true);
  assert.equal(captured!.code, "UserNotFound");
});

test("error-mapper: cannot_report_own_message → Forbidden", () => {
  const { handled, captured } = callMapper("cannot_report_own_message");
  assert.equal(handled, true);
  assert.equal(captured!.code, "Forbidden");
  assert.match(captured!.message, /report/);
});

test("error-mapper: message_report_exists → MessageAlreadyReported", () => {
  const { handled, captured } = callMapper("message_report_exists");
  assert.equal(handled, true);
  assert.equal(captured!.code, "MessageAlreadyReported");
});

test("error-mapper: forbidden_edit → Forbidden (own messages)", () => {
  const { handled, captured } = callMapper("forbidden_edit");
  assert.equal(handled, true);
  assert.equal(captured!.code, "Forbidden");
  assert.match(captured!.message, /own messages/);
});

test("error-mapper: forbidden_delete → Forbidden (own messages)", () => {
  const { handled, captured } = callMapper("forbidden_delete");
  assert.equal(handled, true);
  assert.equal(captured!.code, "Forbidden");
  assert.match(captured!.message, /own messages/);
});

test("error-mapper: edit_window_expired → EditWindowExpired", () => {
  const { handled, captured } = callMapper("edit_window_expired");
  assert.equal(handled, true);
  assert.equal(captured!.code, "EditWindowExpired");
});

test("error-mapper: delete_window_expired → DeleteWindowExpired", () => {
  const { handled, captured } = callMapper("delete_window_expired");
  assert.equal(handled, true);
  assert.equal(captured!.code, "DeleteWindowExpired");
});

// --- Необработанные ошибки ---

test("error-mapper: unknown error returns false and does not call sendNack", () => {
  const { handled, captured } = callMapper("some_random_error");
  assert.equal(handled, false);
  assert.equal(captured, null);
});

test("error-mapper: empty error message returns false", () => {
  const { handled, captured } = callMapper("");
  assert.equal(handled, false);
  assert.equal(captured, null);
});
