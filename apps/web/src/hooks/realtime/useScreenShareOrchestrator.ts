import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import type { RoomKind } from "../../domain";

type ScreenShareOwner = { userId: string | null; userName: string | null };

type SendWsEventAwaitAck = (
  eventType: string,
  payload: Record<string, unknown>,
  options?: { withIdempotency?: boolean; trackAck?: boolean; maxRetries?: number }
) => Promise<void>;

type IncomingScreenSharePayload = {
  roomSlug?: string;
  active?: boolean;
  ownerUserId?: string | null;
  ownerUserName?: string | null;
};

type UseScreenShareOrchestratorArgs = {
  hasSessionToken: boolean;
  roomSlug: string;
  currentRoomKind: RoomKind;
  currentRoomSupportsScreenShare: boolean;
  roomVoiceConnected: boolean;
  connectRoom: () => Promise<void>;
  userId: string;
  userName: string;
  t: (key: string) => string;
  pushToast: (message: string) => void;
  screenShareOwnerByRoomSlug: Record<string, ScreenShareOwner>;
  setScreenShareOwnerByRoomSlug: Dispatch<SetStateAction<Record<string, ScreenShareOwner>>>;
  isLocalScreenSharing: boolean;
  localScreenShareStream: MediaStream | null;
  remoteScreenShareStreamsByUserId: Record<string, MediaStream>;
  remoteVideoLabelsByUserId: Record<string, string>;
  startLocalScreenShare: () => Promise<void>;
  stopLocalScreenShare: () => Promise<void>;
  sendWsEventAwaitAck: SendWsEventAwaitAck;
};

export function useScreenShareOrchestrator({
  hasSessionToken,
  roomSlug,
  currentRoomKind,
  currentRoomSupportsScreenShare,
  roomVoiceConnected,
  connectRoom,
  userId,
  userName,
  t,
  pushToast,
  screenShareOwnerByRoomSlug,
  setScreenShareOwnerByRoomSlug,
  isLocalScreenSharing,
  localScreenShareStream,
  remoteScreenShareStreamsByUserId,
  remoteVideoLabelsByUserId,
  startLocalScreenShare,
  stopLocalScreenShare,
  sendWsEventAwaitAck
}: UseScreenShareOrchestratorArgs) {
  const currentRoomScreenShareOwner = useMemo(() => {
    return screenShareOwnerByRoomSlug[roomSlug] || { userId: null, userName: null };
  }, [screenShareOwnerByRoomSlug, roomSlug]);

  const normalizedCurrentUserId = useMemo(() => String(userId || "").trim(), [userId]);
  const normalizedScreenShareOwnerUserId = useMemo(
    () => String(currentRoomScreenShareOwner.userId || "").trim(),
    [currentRoomScreenShareOwner.userId]
  );

  const isCurrentUserScreenShareOwner = Boolean(
    normalizedCurrentUserId
    && normalizedScreenShareOwnerUserId
    && normalizedCurrentUserId === normalizedScreenShareOwnerUserId
  );

  const canToggleScreenShare = Boolean(
    currentRoomSupportsScreenShare
    && (!normalizedScreenShareOwnerUserId || isCurrentUserScreenShareOwner)
  );

  const activeScreenShare = useMemo(() => {
    const localUserId = String(userId || "").trim();
    if (isLocalScreenSharing && localScreenShareStream) {
      return {
        stream: localScreenShareStream,
        ownerUserId: localUserId || "local",
        ownerLabel: userName || t("video.you"),
        local: true
      };
    }

    const ownerUserId = String(currentRoomScreenShareOwner.userId || "").trim();
    if (!ownerUserId) {
      return null;
    }

    const stream = remoteScreenShareStreamsByUserId[ownerUserId] || null;
    if (!stream) {
      return null;
    }

    return {
      stream,
      ownerUserId,
      ownerLabel: currentRoomScreenShareOwner.userName || remoteVideoLabelsByUserId[ownerUserId] || ownerUserId,
      local: false
    };
  }, [
    currentRoomScreenShareOwner.userId,
    currentRoomScreenShareOwner.userName,
    isLocalScreenSharing,
    localScreenShareStream,
    remoteScreenShareStreamsByUserId,
    remoteVideoLabelsByUserId,
    t,
    userId,
    userName
  ]);

  const handleIncomingScreenShareState = useCallback((payload: IncomingScreenSharePayload) => {
    const targetRoomSlug = String(payload.roomSlug || "").trim();
    if (!targetRoomSlug) {
      return;
    }

    setScreenShareOwnerByRoomSlug((prev) => ({
      ...prev,
      [targetRoomSlug]: {
        userId: payload.active ? (payload.ownerUserId ?? null) : null,
        userName: payload.active ? (payload.ownerUserName ?? null) : null
      }
    }));
  }, [setScreenShareOwnerByRoomSlug]);

  const handleToggleScreenShare = useCallback(async () => {
    if (!hasSessionToken || !roomSlug || currentRoomKind === "text") {
      pushToast(t("call.autoWaiting"));
      return;
    }

    const localUserId = String(userId || "").trim();
    const ownerUserId = String(currentRoomScreenShareOwner.userId || "").trim();

    if (isLocalScreenSharing) {
      try {
        await stopLocalScreenShare();
      } finally {
        if (!roomVoiceConnected) {
          return;
        }
        try {
          await sendWsEventAwaitAck("screen.share.stop", { roomSlug }, { maxRetries: 1 });
        } catch {
          return;
        }
      }
      return;
    }

    if (ownerUserId && ownerUserId !== localUserId) {
      const ownerName = currentRoomScreenShareOwner.userName || ownerUserId;
      pushToast(`Screen share is already active: ${ownerName}`);
      return;
    }

    try {
      if (!roomVoiceConnected) {
        await connectRoom();
      }

      await sendWsEventAwaitAck("screen.share.start", { roomSlug }, { maxRetries: 1 });
      await startLocalScreenShare();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error || "");
      if (text.includes("ScreenShareAlreadyActive")) {
        pushToast("Screen share is already active in this room");
      } else if (text.includes("NotAllowedError") || text.includes("Permission denied")) {
        pushToast("Screen share permission denied");
      } else {
        pushToast("Failed to start screen share");
      }

      if (!roomVoiceConnected || text.includes("NoActiveRoom")) {
        return;
      }

      try {
        await sendWsEventAwaitAck("screen.share.stop", { roomSlug }, { maxRetries: 1 });
      } catch {
        return;
      }
    }
  }, [
    currentRoomKind,
    currentRoomScreenShareOwner.userId,
    currentRoomScreenShareOwner.userName,
    hasSessionToken,
    isLocalScreenSharing,
    pushToast,
    roomSlug,
    roomVoiceConnected,
    connectRoom,
    sendWsEventAwaitAck,
    startLocalScreenShare,
    stopLocalScreenShare,
    t,
    userId
  ]);

  useEffect(() => {
    if (!isLocalScreenSharing || !localScreenShareStream || !roomSlug) {
      return;
    }

    const track = localScreenShareStream.getVideoTracks()[0];
    if (!track) {
      return;
    }

    const onEnded = () => {
      void stopLocalScreenShare();
      if (roomVoiceConnected) {
        void sendWsEventAwaitAck("screen.share.stop", { roomSlug }, { maxRetries: 1 }).catch(() => undefined);
      }
    };

    track.addEventListener("ended", onEnded);
    return () => {
      track.removeEventListener("ended", onEnded);
    };
  }, [isLocalScreenSharing, localScreenShareStream, roomSlug, sendWsEventAwaitAck, stopLocalScreenShare]);

  useEffect(() => {
    if (roomVoiceConnected || !isLocalScreenSharing || !roomSlug) {
      return;
    }

    void stopLocalScreenShare();
  }, [isLocalScreenSharing, roomSlug, roomVoiceConnected, sendWsEventAwaitAck, stopLocalScreenShare]);

  return {
    currentRoomScreenShareOwner,
    isCurrentUserScreenShareOwner,
    canToggleScreenShare,
    activeScreenShare,
    handleIncomingScreenShareState,
    handleToggleScreenShare
  };
}
