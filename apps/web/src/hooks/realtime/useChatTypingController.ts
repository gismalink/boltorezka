import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ChatTypingEntry = {
  userName: string;
  expiresAt: number;
};

type ChatTypingByRoom = Record<string, Record<string, ChatTypingEntry>>;

type SendWsEventFn = (
  eventType: string,
  payload: Record<string, unknown>,
  options?: { maxRetries?: number }
) => unknown;

type UseChatTypingControllerParams = {
  chatRoomSlug: string;
  userId?: string;
  sendWsEvent: SendWsEventFn;
  setChatText: (value: string) => void;
  typingTtlMs: number;
  typingPingIntervalMs: number;
};

export function useChatTypingController({
  chatRoomSlug,
  userId,
  sendWsEvent,
  setChatText,
  typingTtlMs,
  typingPingIntervalMs
}: UseChatTypingControllerParams) {
  const [chatTypingByRoomSlug, setChatTypingByRoomSlug] = useState<ChatTypingByRoom>({});

  const chatTypingStopTimerRef = useRef<number | null>(null);
  const chatTypingLastSentAtRef = useRef(0);
  const chatTypingActiveRef = useRef(false);
  const chatTypingRoomSlugRef = useRef("");
  const previousChatRoomSlugRef = useRef(chatRoomSlug);

  const clearChatTypingStopTimer = useCallback(() => {
    if (chatTypingStopTimerRef.current !== null) {
      window.clearTimeout(chatTypingStopTimerRef.current);
      chatTypingStopTimerRef.current = null;
    }
  }, []);

  const sendChatTypingState = useCallback((targetRoomSlug: string, isTyping: boolean) => {
    const slug = String(targetRoomSlug || "").trim();
    if (!slug || !userId) {
      return;
    }

    void sendWsEvent("chat.typing", { roomSlug: slug, isTyping }, { maxRetries: 1 });
    chatTypingLastSentAtRef.current = Date.now();
    chatTypingActiveRef.current = isTyping;
    chatTypingRoomSlugRef.current = isTyping ? slug : "";

    if (!isTyping) {
      clearChatTypingStopTimer();
    }
  }, [clearChatTypingStopTimer, sendWsEvent, userId]);

  const scheduleChatTypingStop = useCallback((targetRoomSlug: string) => {
    clearChatTypingStopTimer();
    chatTypingStopTimerRef.current = window.setTimeout(() => {
      sendChatTypingState(targetRoomSlug, false);
    }, typingTtlMs);
  }, [clearChatTypingStopTimer, sendChatTypingState, typingTtlMs]);

  const handleSetChatText = useCallback((value: string) => {
    setChatText(value);

    if (!chatRoomSlug || !userId) {
      return;
    }

    const hasText = value.trim().length > 0;
    if (!hasText) {
      if (chatTypingActiveRef.current && chatTypingRoomSlugRef.current === chatRoomSlug) {
        sendChatTypingState(chatRoomSlug, false);
      }
      return;
    }

    const now = Date.now();
    if (
      !chatTypingActiveRef.current
      || chatTypingRoomSlugRef.current !== chatRoomSlug
      || now - chatTypingLastSentAtRef.current >= typingPingIntervalMs
    ) {
      sendChatTypingState(chatRoomSlug, true);
    }

    scheduleChatTypingStop(chatRoomSlug);
  }, [chatRoomSlug, scheduleChatTypingStop, sendChatTypingState, setChatText, typingPingIntervalMs, userId]);

  const applyRemoteTypingPayload = useCallback((payload: Record<string, unknown>) => {
    const typingRoomSlug = String(payload.roomSlug || "").trim();
    const typingUserId = String(payload.userId || "").trim();
    const typingUserName = String(payload.userName || "").trim();

    if (!typingRoomSlug || !typingUserId || !typingUserName || typingUserId === userId) {
      return;
    }

    const isTyping = payload.isTyping === true;
    setChatTypingByRoomSlug((prev) => {
      const roomTyping = prev[typingRoomSlug] || {};

      if (isTyping) {
        return {
          ...prev,
          [typingRoomSlug]: {
            ...roomTyping,
            [typingUserId]: {
              userName: typingUserName,
              expiresAt: Date.now() + typingTtlMs
            }
          }
        };
      }

      if (!(typingUserId in roomTyping)) {
        return prev;
      }

      const nextRoomTyping = { ...roomTyping };
      delete nextRoomTyping[typingUserId];

      if (Object.keys(nextRoomTyping).length === 0) {
        const next = { ...prev };
        delete next[typingRoomSlug];
        return next;
      }

      return {
        ...prev,
        [typingRoomSlug]: nextRoomTyping
      };
    });
  }, [typingTtlMs, userId]);

  const activeChatTypingUsers = useMemo(() => {
    const now = Date.now();
    const roomTyping = chatTypingByRoomSlug[chatRoomSlug] || {};

    return Object.values(roomTyping)
      .filter((entry) => entry.expiresAt > now)
      .map((entry) => entry.userName)
      .filter((name, index, all) => all.indexOf(name) === index);
  }, [chatRoomSlug, chatTypingByRoomSlug]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setChatTypingByRoomSlug((prev) => {
        let changed = false;
        const next: ChatTypingByRoom = {};

        Object.entries(prev).forEach(([slug, users]) => {
          const aliveEntries = Object.entries(users).filter(([, entry]) => entry.expiresAt > now);
          if (aliveEntries.length !== Object.keys(users).length) {
            changed = true;
          }
          if (aliveEntries.length > 0) {
            next[slug] = Object.fromEntries(aliveEntries);
          } else if (Object.keys(users).length > 0) {
            changed = true;
          }
        });

        return changed ? next : prev;
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const previousRoomSlug = previousChatRoomSlugRef.current;
    if (previousRoomSlug && previousRoomSlug !== chatRoomSlug && chatTypingActiveRef.current) {
      sendChatTypingState(previousRoomSlug, false);
    }
    previousChatRoomSlugRef.current = chatRoomSlug;
  }, [chatRoomSlug, sendChatTypingState]);

  useEffect(() => () => {
    if (chatTypingActiveRef.current && chatTypingRoomSlugRef.current) {
      void sendWsEvent("chat.typing", { roomSlug: chatTypingRoomSlugRef.current, isTyping: false }, { maxRetries: 1 });
    }
    clearChatTypingStopTimer();
  }, [clearChatTypingStopTimer, sendWsEvent]);

  return {
    chatTypingByRoomSlug,
    setChatTypingByRoomSlug,
    activeChatTypingUsers,
    handleSetChatText,
    sendChatTypingState,
    applyRemoteTypingPayload
  };
}
