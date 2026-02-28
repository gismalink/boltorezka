import { useMemo } from "react";
import type { Room, RoomsTreeResponse } from "../domain";

type UseRoomsDerivedArgs = {
  roomsTree: RoomsTreeResponse | null;
  rooms: Room[];
  roomSlug: string;
};

export function useRoomsDerived({ roomsTree, rooms, roomSlug }: UseRoomsDerivedArgs) {
  const categorizedRoomIds = useMemo(() => {
    const ids = new Set<string>();
    roomsTree?.categories.forEach((category) => {
      category.channels.forEach((channel) => ids.add(channel.id));
    });
    return ids;
  }, [roomsTree]);

  const uncategorizedRooms = useMemo(() => {
    if (roomsTree) {
      return roomsTree.uncategorized;
    }

    return rooms.filter((room) => !categorizedRoomIds.has(room.id));
  }, [roomsTree, rooms, categorizedRoomIds]);

  const allRooms = useMemo(() => {
    if (roomsTree) {
      const fromCategories = roomsTree.categories.flatMap((category) => category.channels);
      return [...fromCategories, ...roomsTree.uncategorized];
    }

    return rooms;
  }, [roomsTree, rooms]);

  const currentRoom = useMemo(
    () => allRooms.find((room) => room.slug === roomSlug) || null,
    [allRooms, roomSlug]
  );

  return {
    uncategorizedRooms,
    allRooms,
    currentRoom
  };
}
