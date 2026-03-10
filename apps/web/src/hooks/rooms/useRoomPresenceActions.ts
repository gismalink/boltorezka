import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Message, MessagesCursor } from "../../domain";
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
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setMessagesHasMore: Dispatch<SetStateAction<boolean>>;
  setMessagesNextCursor: Dispatch<SetStateAction<MessagesCursor | null>>;
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
  setMessages,
  setMessagesHasMore,
  setMessagesNextCursor
}: UseRoomPresenceActionsArgs) {
  const joinRoom = useCallback((slug: string) => {
    roomAdminController.joinRoom(slug);
  }, [roomAdminController]);

  const leaveRoom = useCallback(() => {
    if (!roomSlug) {
      return;
    }

    disconnectRoom();
    void sendWsEvent("room.leave", {}, { maxRetries: 1 });
    setRoomSlug("");
    setMessages([]);
    setMessagesHasMore(false);
    setMessagesNextCursor(null);
  }, [
    disconnectRoom,
    roomSlug,
    sendWsEvent,
    setMessages,
    setMessagesHasMore,
    setMessagesNextCursor,
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

  return {
    joinRoom,
    leaveRoom,
    kickRoomMember
  };
}
