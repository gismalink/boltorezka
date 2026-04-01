import { useAppRoomsRuntime } from "./useAppRoomsRuntime";

type AppRoomsRuntimeInput = Parameters<typeof useAppRoomsRuntime>[0];

export function useAppRoomsRuntimeInput(params: Record<string, unknown>): AppRoomsRuntimeInput {
  const p = params as any;

  return {
    roomsDerived: {
      roomsTree: p.roomsTree,
      rooms: p.rooms,
      roomSlug: p.roomSlug
    },
    roomsAndServerDerived: {
      servers: p.servers,
      currentServerId: p.currentServerId,
      chatRoomSlug: p.chatRoomSlug,
      roomSlug: p.roomSlug,
      setChatRoomSlug: p.setChatRoomSlug
    },
    roomSelectionGuard: {
      roomSlug: p.roomSlug,
      setRoomSlug: p.setRoomSlug,
      chatRoomSlug: p.chatRoomSlug,
      setChatRoomSlug: p.setChatRoomSlug
    }
  };
}
