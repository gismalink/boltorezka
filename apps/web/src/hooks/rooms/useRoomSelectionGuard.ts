import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { Room } from "../../domain";

type UseRoomSelectionGuardArgs = {
  allRooms: Room[];
  dmModeActive?: boolean;
  roomSlug: string;
  chatRoomSlug: string;
  setRoomSlug: Dispatch<SetStateAction<string>>;
  setChatRoomSlug: Dispatch<SetStateAction<string>>;
};

export function useRoomSelectionGuard({
  allRooms,
  dmModeActive,
  roomSlug,
  chatRoomSlug,
  setRoomSlug,
  setChatRoomSlug
}: UseRoomSelectionGuardArgs) {
  useEffect(() => {
    if (allRooms.length === 0) {
      return;
    }

    if (roomSlug) {
      const joinedRoomExists = allRooms.some((room) => room.slug === roomSlug);
      if (!joinedRoomExists) {
        setRoomSlug("");
      }
    }

    if (chatRoomSlug) {
      const chatRoomExists = allRooms.some((room) => room.slug === chatRoomSlug);
      if (!chatRoomExists) {
        setChatRoomSlug("");
      }
    }
  }, [allRooms, roomSlug, chatRoomSlug, setRoomSlug, setChatRoomSlug]);

  useEffect(() => {
    if (dmModeActive) {
      return;
    }

    if (chatRoomSlug) {
      return;
    }

    if (roomSlug) {
      setChatRoomSlug(roomSlug);
      return;
    }

    const firstRoom = allRooms[0];
    if (firstRoom?.slug) {
      setChatRoomSlug(firstRoom.slug);
    }
  }, [allRooms, chatRoomSlug, roomSlug, setChatRoomSlug, dmModeActive]);
}
