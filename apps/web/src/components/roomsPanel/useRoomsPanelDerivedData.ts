/**
 * useRoomsPanelDerivedData.ts — хук производных данных панели комнат.
 * Строит агрегаты для рендера (категории, внекатегорийные, online/offline) и бейджей непрочитанного.
 */
// Хук производных данных панели комнат: строит агрегаты для рендера и бейджей.
import { useMemo } from "react";
import type { PresenceMember, Room, RoomsTreeResponse } from "../../domain";
import { buildRoomsPanelDerivedData } from "./roomsPanelDerivedDataUtils";

type UseRoomsPanelDerivedDataInput = {
  roomsTree: RoomsTreeResponse | null;
  uncategorizedRooms: Room[];
  archivedRooms: Room[];
  roomUnreadBySlug: Record<string, number>;
  roomMentionUnreadBySlug: Record<string, number>;
  roomMutePresetByRoomId: Record<string, "1h" | "8h" | "24h" | "forever" | "off">;
  liveRoomMembersBySlug: Record<string, string[]>;
  liveRoomMemberDetailsBySlug: Record<string, PresenceMember[]>;
};

export function useRoomsPanelDerivedData({
  roomsTree,
  uncategorizedRooms,
  archivedRooms,
  roomUnreadBySlug,
  roomMentionUnreadBySlug,
  roomMutePresetByRoomId,
  liveRoomMembersBySlug,
  liveRoomMemberDetailsBySlug
}: UseRoomsPanelDerivedDataInput) {
  return useMemo(() => buildRoomsPanelDerivedData({
    roomsTree,
    uncategorizedRooms,
    archivedRooms,
    roomUnreadBySlug,
    roomMentionUnreadBySlug,
    roomMutePresetByRoomId,
    liveRoomMembersBySlug,
    liveRoomMemberDetailsBySlug
  }), [
    roomsTree,
    uncategorizedRooms,
    archivedRooms,
    roomUnreadBySlug,
    roomMentionUnreadBySlug,
    roomMutePresetByRoomId,
    liveRoomMembersBySlug,
    liveRoomMemberDetailsBySlug
  ]);
}
