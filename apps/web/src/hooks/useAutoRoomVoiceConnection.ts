import { useEffect, useRef } from "react";

type UseAutoRoomVoiceConnectionArgs = {
  currentRoomSupportsRtc: boolean;
  roomVoiceTargetsCount: number;
  roomVoiceConnected: boolean;
  connectRoom: () => Promise<void>;
  disconnectRoom: () => void;
  disconnectGraceMs?: number;
};

const DEFAULT_DISCONNECT_GRACE_MS = 8000;

export function useAutoRoomVoiceConnection({
  currentRoomSupportsRtc,
  roomVoiceTargetsCount,
  roomVoiceConnected,
  connectRoom,
  disconnectRoom,
  disconnectGraceMs = DEFAULT_DISCONNECT_GRACE_MS
}: UseAutoRoomVoiceConnectionArgs) {
  const autoRoomDisconnectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!currentRoomSupportsRtc) {
      if (autoRoomDisconnectTimerRef.current !== null) {
        window.clearTimeout(autoRoomDisconnectTimerRef.current);
        autoRoomDisconnectTimerRef.current = null;
      }
      if (roomVoiceConnected) {
        disconnectRoom();
      }
      return;
    }

    const hasOtherParticipants = roomVoiceTargetsCount > 0;

    if (hasOtherParticipants) {
      if (autoRoomDisconnectTimerRef.current !== null) {
        window.clearTimeout(autoRoomDisconnectTimerRef.current);
        autoRoomDisconnectTimerRef.current = null;
      }
      if (!roomVoiceConnected) {
        void connectRoom();
      }
      return;
    }

    if (!roomVoiceConnected) {
      if (autoRoomDisconnectTimerRef.current !== null) {
        window.clearTimeout(autoRoomDisconnectTimerRef.current);
        autoRoomDisconnectTimerRef.current = null;
      }
      return;
    }

    if (autoRoomDisconnectTimerRef.current !== null) {
      return;
    }

    autoRoomDisconnectTimerRef.current = window.setTimeout(() => {
      autoRoomDisconnectTimerRef.current = null;
      disconnectRoom();
    }, disconnectGraceMs);

    return () => {
      if (autoRoomDisconnectTimerRef.current !== null) {
        window.clearTimeout(autoRoomDisconnectTimerRef.current);
        autoRoomDisconnectTimerRef.current = null;
      }
    };
  }, [
    currentRoomSupportsRtc,
    roomVoiceTargetsCount,
    roomVoiceConnected,
    connectRoom,
    disconnectRoom,
    disconnectGraceMs
  ]);

  useEffect(() => {
    return () => {
      if (autoRoomDisconnectTimerRef.current !== null) {
        window.clearTimeout(autoRoomDisconnectTimerRef.current);
        autoRoomDisconnectTimerRef.current = null;
      }
    };
  }, []);
}
