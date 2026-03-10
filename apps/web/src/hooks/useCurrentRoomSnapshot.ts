import { useMemo } from "react";
import type { AudioQuality, Room, RoomKind, RoomsTreeResponse } from "../domain";

type UseCurrentRoomSnapshotArgs = {
  rooms: Room[];
  roomsTree: RoomsTreeResponse | null;
  roomSlug: string;
};

export function useCurrentRoomSnapshot({ rooms, roomsTree, roomSlug }: UseCurrentRoomSnapshotArgs) {
  const currentRoom = useMemo(() => {
    const roomFromList = rooms.find((room) => room.slug === roomSlug);
    if (roomFromList) {
      return roomFromList;
    }

    return (roomsTree?.categories || [])
      .flatMap((category) => category.channels || [])
      .find((room) => room.slug === roomSlug)
      ?? (roomsTree?.uncategorized || []).find((room) => room.slug === roomSlug)
      ?? null;
  }, [rooms, roomsTree, roomSlug]);

  const currentRoomKind: RoomKind = currentRoom?.kind || "text";
  const currentRoomAudioQualityOverride: AudioQuality | null = currentRoom?.audio_quality_override ?? null;

  return {
    currentRoom,
    currentRoomKind,
    currentRoomAudioQualityOverride
  };
}
