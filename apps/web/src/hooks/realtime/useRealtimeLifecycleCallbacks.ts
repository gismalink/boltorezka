import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Message, PresenceMember } from "../../domain";
import type { RealtimeClient } from "../../services";

type UseRealtimeLifecycleCallbacksArgs = {
  chatRoomSlug: string;
  roomSlugRef: MutableRefObject<string>;
  realtimeClientRef: MutableRefObject<RealtimeClient | null>;
  disconnectRoom: () => void;
  playServerSound: (event: "self_disconnected") => Promise<void>;
  setRoomsPresenceBySlug: Dispatch<SetStateAction<Record<string, string[]>>>;
  setRoomsPresenceDetailsBySlug: Dispatch<SetStateAction<Record<string, PresenceMember[]>>>;
  setRoomSlug: (slug: string) => void;
  setChatTypingByRoomSlug: Dispatch<SetStateAction<Record<string, Record<string, string>>>>;
  setSessionMovedOverlayMessage: (value: string) => void;
  pushLog: (text: string) => void;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setMessagesHasMore: (value: boolean) => void;
  setMessagesNextCursor: (value: { createdAt: string; id: string } | null) => void;
  applyRemoteTypingPayload: (payload: {
    roomId?: string;
    roomSlug?: string;
    userId?: string;
    userName?: string;
    isTyping?: boolean;
    ts?: string;
  }) => void;
};

export function useRealtimeLifecycleCallbacks({
  chatRoomSlug,
  roomSlugRef,
  realtimeClientRef,
  disconnectRoom,
  playServerSound,
  setRoomsPresenceBySlug,
  setRoomsPresenceDetailsBySlug,
  setRoomSlug,
  setChatTypingByRoomSlug,
  setSessionMovedOverlayMessage,
  pushLog,
  setMessages,
  setMessagesHasMore,
  setMessagesNextCursor,
  applyRemoteTypingPayload
}: UseRealtimeLifecycleCallbacksArgs) {
  const handleSessionMoved = useCallback(({ code, message }: { code: string; message: string }) => {
    const activeSlug = String(roomSlugRef.current || "").trim();
    if (activeSlug) {
      void playServerSound("self_disconnected");
      setRoomsPresenceBySlug((prev) => {
        if (!(activeSlug in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[activeSlug];
        return next;
      });
      setRoomsPresenceDetailsBySlug((prev) => {
        if (!(activeSlug in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[activeSlug];
        return next;
      });
    }

    disconnectRoom();
    realtimeClientRef.current?.dispose();
    realtimeClientRef.current = null;
    setRoomSlug("");
    setChatTypingByRoomSlug({});
    setSessionMovedOverlayMessage(`${code}: ${message}`);
    pushLog(`session moved: ${code} ${message}`);
  }, [
    roomSlugRef,
    playServerSound,
    setRoomsPresenceBySlug,
    setRoomsPresenceDetailsBySlug,
    disconnectRoom,
    realtimeClientRef,
    setRoomSlug,
    setChatTypingByRoomSlug,
    setSessionMovedOverlayMessage,
    pushLog
  ]);

  const handleChatCleared = useCallback((payload: { roomSlug?: string; deletedCount?: number }) => {
    const targetRoomSlug = String(payload.roomSlug || "").trim();
    if (!targetRoomSlug || targetRoomSlug !== chatRoomSlug) {
      return;
    }

    setMessages([]);
    setMessagesHasMore(false);
    setMessagesNextCursor(null);

    const deletedCount = Number(payload.deletedCount || 0);
    pushLog(`channel chat cleared by admin (${Number.isFinite(deletedCount) ? deletedCount : 0})`);
  }, [chatRoomSlug, setMessages, setMessagesHasMore, setMessagesNextCursor, pushLog]);

  const handleChatTyping = useCallback((payload: {
    roomId?: string;
    roomSlug?: string;
    userId?: string;
    userName?: string;
    isTyping?: boolean;
    ts?: string;
  }) => {
    applyRemoteTypingPayload(payload);
  }, [applyRemoteTypingPayload]);

  return {
    handleSessionMoved,
    handleChatCleared,
    handleChatTyping
  };
}