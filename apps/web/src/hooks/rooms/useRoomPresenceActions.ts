import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { RoomAdminController } from "../../services";

type SendWsEvent = (
  eventType: string,
  payload: Record<string, unknown>,
  options?: { withIdempotency?: boolean; trackAck?: boolean; maxRetries?: number }
) => string | null;

type UseRoomPresenceActionsArgs = {
  roomSlug: string;
  canCreateRooms: boolean;
  roomAdminController: RoomAdminController;
  disconnectRoom: () => void;
  sendWsEvent: SendWsEvent;
  pushToast: (message: string) => void;
  pushLog: (text: string) => void;
  t: (key: string) => string;
  setRoomSlug: Dispatch<SetStateAction<string>>;
  setChatRoomSlug: Dispatch<SetStateAction<string>>;
};

export function useRoomPresenceActions({
  roomSlug,
  canCreateRooms,
  roomAdminController,
  disconnectRoom,
  sendWsEvent,
  pushToast,
  pushLog,
  t,
  setRoomSlug,
  setChatRoomSlug
}: UseRoomPresenceActionsArgs) {
  const joinRoom = useCallback((slug: string) => {
    roomAdminController.joinRoom(slug);
    setChatRoomSlug(slug);
  }, [roomAdminController, setChatRoomSlug]);

  const leaveRoom = useCallback(() => {
    if (!roomSlug) {
      return;
    }

    disconnectRoom();
    void sendWsEvent("room.leave", {}, { maxRetries: 1 });
    setRoomSlug("");
  }, [
    disconnectRoom,
    roomSlug,
    sendWsEvent,
    setRoomSlug
  ]);

  const kickRoomMember = useCallback((targetRoomSlug: string, targetUserId: string, targetUserName: string) => {
    if (!targetRoomSlug || !targetUserId || !canCreateRooms) {
      return;
    }

    const requestId = sendWsEvent(
      "room.kick",
      {
        roomSlug: targetRoomSlug,
        targetUserId
      },
      { maxRetries: 1 }
    );

    if (!requestId) {
      pushToast(t("toast.serverError"));
      return;
    }

    pushLog(`kick requested: ${targetUserName || targetUserId} from #${targetRoomSlug}`);
  }, [canCreateRooms, pushLog, pushToast, sendWsEvent, t]);

  const moveRoomMember = useCallback((fromRoomSlug: string, toRoomSlug: string, targetUserId: string, targetUserName: string) => {
    if (!fromRoomSlug || !toRoomSlug || !targetUserId || fromRoomSlug === toRoomSlug || !canCreateRooms) {
      return;
    }

    const requestId = sendWsEvent(
      "room.move_member",
      {
        fromRoomSlug,
        toRoomSlug,
        targetUserId
      },
      { maxRetries: 1 }
    );

    if (!requestId) {
      pushToast(t("toast.serverError"));
      return;
    }

    pushLog(`move requested: ${targetUserName || targetUserId} #${fromRoomSlug} -> #${toRoomSlug}`);
  }, [canCreateRooms, pushLog, pushToast, sendWsEvent, t]);

  return {
    joinRoom,
    leaveRoom,
    kickRoomMember,
    moveRoomMember
  };
}
