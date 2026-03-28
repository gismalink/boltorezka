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
  onAgeVerificationRequired: (slug: string) => void;
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
  onAgeVerificationRequired,
  setRoomSlug,
  setChatRoomSlug
}: UseRoomPresenceActionsArgs) {
  const joinRoom = useCallback((slug: string) => {
    const targetSlug = String(slug || "").trim();
    if (!targetSlug) {
      return;
    }

    void (async () => {
      try {
        await roomAdminController.joinRoom(targetSlug);
        setChatRoomSlug(targetSlug);
      } catch (error) {
        const message = String((error as Error)?.message || "");
        pushLog(`join room failed: #${targetSlug} ${message}`);

        if (message.includes(":AgeVerificationRequired:")) {
          onAgeVerificationRequired(targetSlug);
          pushToast(t("rooms.ageGateOverlayHint"));
          return;
        }

        pushToast(t("toast.serverError"));
      }
    })();
  }, [onAgeVerificationRequired, pushLog, pushToast, roomAdminController, setChatRoomSlug, t]);

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
