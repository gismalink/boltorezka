// Хук производных данных панели комнат: строит агрегаты для рендера и бейджей.
import { useMemo } from "react";
import type { PresenceMember, Room, RoomsTreeResponse } from "../../domain";
import { buildRoomsPanelDerivedData } from "./roomsPanelDerivedDataUtils";

type UseRoomsPanelDerivedDataInput = {
  roomsTree: RoomsTreeResponse | null;
  uncategorizedRooms: Room[];
  archivedRooms: Room[];
  roomUnreadBySlug: Record<string, number>;
  liveRoomMembersBySlug: Record<string, string[]>;
  liveRoomMemberDetailsBySlug: Record<string, PresenceMember[]>;
};

export function useRoomsPanelDerivedData({
  roomsTree,
  uncategorizedRooms,
  archivedRooms,
  roomUnreadBySlug,
  liveRoomMembersBySlug,
  liveRoomMemberDetailsBySlug
}: UseRoomsPanelDerivedDataInput) {
  return useMemo(() => buildRoomsPanelDerivedData({
    roomsTree,
    uncategorizedRooms,
    archivedRooms,
    roomUnreadBySlug,
    liveRoomMembersBySlug,
    liveRoomMemberDetailsBySlug
  }), [
    roomsTree,
    uncategorizedRooms,
    archivedRooms,
    roomUnreadBySlug,
    liveRoomMembersBySlug,
    liveRoomMemberDetailsBySlug
  ]);
}
