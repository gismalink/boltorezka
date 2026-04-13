/**
 * Утилиты для chat handlers.
 *
 * Вынесены из realtime-chat.ts: нормализация mention payload,
 * broadcast в room audience (сокеты вне текущей комнаты).
 */
import type { WebSocket } from "ws";
import { normalizeOptionalString } from "../validators.js";

/**
 * Извлекает и дедуплицирует mentionUserIds из WS payload.
 * Поддерживает массив строк или CSV-строку. Лимит 100 уникальных.
 */
export function normalizeMentionUserIdsFromPayload(payload: Record<string, unknown>): string[] {
  const candidates = payload.mentionUserIds ?? payload.mention_user_ids;
  const rawValues: string[] = [];

  if (Array.isArray(candidates)) {
    candidates.forEach((value) => {
      if (typeof value === "string") {
        rawValues.push(value);
      }
    });
  } else if (typeof candidates === "string") {
    candidates
      .split(",")
      .forEach((part) => rawValues.push(part));
  }

  const dedup = new Set<string>();
  rawValues
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .forEach((value) => {
      if (!dedup.has(value) && dedup.size < 100) {
        dedup.add(value);
      }
    });

  return Array.from(dedup);
}

/**
 * Рассылает payload всем сокетам аудитории комнаты, которые находятся в ДРУГИХ комнатах.
 * (Для получения уведомлений о новых сообщениях без активного присутствия в канале.)
 */
export function broadcastToRoomAudienceAcrossOtherRooms(params: {
  roomId: string;
  payload: unknown;
  audienceUserIds: string[];
  excludedSocket: WebSocket;
  getUserSocketsByUserId: (userId: string) => WebSocket[];
  getSocketRoomId: (socket: WebSocket) => string | null;
  sendJson: (socket: WebSocket, payload: unknown) => void;
}) {
  const {
    roomId,
    payload,
    audienceUserIds,
    excludedSocket,
    getUserSocketsByUserId,
    getSocketRoomId,
    sendJson
  } = params;

  const seenSockets = new Set<WebSocket>();
  for (const userId of audienceUserIds) {
    for (const socket of getUserSocketsByUserId(userId)) {
      if (socket === excludedSocket || seenSockets.has(socket)) {
        continue;
      }

      const socketRoomId = normalizeOptionalString(getSocketRoomId(socket)) || "";
      if (socketRoomId === roomId) {
        continue;
      }

      seenSockets.add(socket);
      sendJson(socket, payload);
    }
  }
}
