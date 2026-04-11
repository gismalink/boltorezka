import { useEffect, useMemo } from "react";
import type { Room, ServerListItem } from "../../../domain";

type UseAppRoomsAndServerDerivedInput = {
  servers: ServerListItem[];
  currentServerId: string;
  allRooms: Room[];
  dmModeActive?: boolean;
  chatRoomSlug: string;
  roomSlug: string;
  setChatRoomSlug: (slug: string) => void;
};

export function useAppRoomsAndServerDerived({
  servers,
  currentServerId,
  allRooms,
  dmModeActive,
  chatRoomSlug,
  roomSlug,
  setChatRoomSlug
}: UseAppRoomsAndServerDerivedInput) {
  const currentServer = useMemo(
    () => servers.find((item) => item.id === currentServerId) || null,
    [servers, currentServerId]
  );

  useEffect(() => {
    if (dmModeActive) {
      return;
    }

    if (!chatRoomSlug && roomSlug) {
      setChatRoomSlug(roomSlug);
    }
  }, [chatRoomSlug, roomSlug, setChatRoomSlug, dmModeActive]);

  const activeChatRoom = useMemo(
    () => allRooms.find((room) => room.slug === chatRoomSlug) || null,
    [allRooms, chatRoomSlug]
  );

  return {
    currentServer,
    activeChatRoom
  };
}