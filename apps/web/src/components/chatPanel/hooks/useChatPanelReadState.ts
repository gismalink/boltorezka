// Хук управления статусом прочтения: mark-read, разделитель непрочитанных,
// автодогрузка истории и защита от рассинхрона при переключении комнаты/темы.
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { api } from "../../../api";
import { executeWsFirstWithHttpFallbackAwaitAck } from "../../../services/chatOperationExecutor";
import type { Message, RoomTopic } from "../../../domain";
import {
  subtractTrailingOwnMessagesFromUnread
} from "./unreadUtils";

type UseChatPanelReadStateArgs = {
  t: (key: string) => string;
  authToken: string;
  sendWsEventAwaitAck?: (
    eventType: string,
    payload: Record<string, unknown>,
    options?: { withIdempotency?: boolean; maxRetries?: number }
  ) => Promise<void>;
  currentUserId: string | null;
  activeTopicId: string | null;
  roomId: string;
  topics: RoomTopic[];
  onApplyTopicReadLocal: (topicId: string) => void;
  messages: Message[];
  messagesHasMore: boolean;
  chatLogRef: RefObject<HTMLDivElement>;
};

export function useChatPanelReadState({
  t,
  authToken,
  sendWsEventAwaitAck,
  currentUserId,
  activeTopicId,
  roomId,
  topics,
  onApplyTopicReadLocal,
  messages,
  messagesHasMore,
  chatLogRef
}: UseChatPanelReadStateArgs) {
  const [markReadSaving, setMarkReadSaving] = useState(false);
  const [markReadStatusText, setMarkReadStatusText] = useState("");
  const [entryUnreadDivider, setEntryUnreadDivider] = useState<{
    topicId: string;
    messageId: string;
  } | null>(null);

  const autoMarkReadInFlightRef = useRef<Record<string, string>>({});
  const lastAutoMarkedMessageIdByTopicRef = useRef<Record<string, string>>({});
  const autoMarkReadRafRef = useRef<number | null>(null);
  const oversizedMessageBoundaryProgressRef = useRef<Record<string, {
    seenTop: boolean;
    seenBottom: boolean;
    lastEdge: "top" | "bottom" | null;
  }>>({});
  const entryUnreadRoomIdRef = useRef<string>("");
  const unreadEntryTopicRef = useRef<string>("");
  const unreadDividerScrolledTopicRef = useRef<string>("");

  const normalizedCurrentUserId = String(currentUserId || "").trim();

  // Keep unread UX consistent with product rule: own messages are never considered unread.
  // We only trim a contiguous own-message tail because unread boundary is derived from the tail.
  const toEffectiveUnreadCount = useCallback((sourceUnreadCount: number, messageList: Message[]): number => {
    return subtractTrailingOwnMessagesFromUnread(sourceUnreadCount, messageList, normalizedCurrentUserId);
  }, [normalizedCurrentUserId]);

  const markTopicReadWsFirst = useCallback(async (topicId: string, lastReadMessageId?: string) => {
    const normalizedToken = String(authToken || "").trim();
    const normalizedTopicId = String(topicId || "").trim();
    const normalizedLastReadMessageId = String(lastReadMessageId || "").trim();

    if (!normalizedToken || !normalizedTopicId) {
      return { kind: "failed" as const };
    }

    const httpFallback = async () => api.markTopicRead(
      normalizedToken,
      normalizedTopicId,
      normalizedLastReadMessageId ? { lastReadMessageId: normalizedLastReadMessageId } : {}
    );

    if (!sendWsEventAwaitAck) {
      try {
        await httpFallback();
        return { kind: "http" as const };
      } catch {
        return { kind: "failed" as const };
      }
    }

    return executeWsFirstWithHttpFallbackAwaitAck({
      sendWsEventAwaitAck,
      eventType: "chat.topic.read",
      payload: {
        topicId: normalizedTopicId,
        ...(normalizedLastReadMessageId ? { lastReadMessageId: normalizedLastReadMessageId } : {})
      },
      withIdempotency: true,
      maxRetries: 1,
      httpFallback
    });
  }, [authToken, sendWsEventAwaitAck]);

  const isMessageSetAlignedWithActiveContext = useCallback(() => {
    if (messages.length === 0) {
      return true;
    }

    const normalizedRoomId = String(roomId || "").trim();
    if (!normalizedRoomId) {
      return false;
    }

    const normalizedTopicId = String(activeTopicId || "").trim();
    return messages.every((message) => {
      const messageRoomId = String(message.room_id || "").trim();
      if (!messageRoomId || messageRoomId !== normalizedRoomId) {
        return false;
      }

      if (!normalizedTopicId) {
        return true;
      }

      const messageTopicId = String(message.topic_id || "").trim();
      return messageTopicId === normalizedTopicId;
    });
  }, [activeTopicId, messages, roomId]);

  const getTopicUnreadCount = useCallback((topic: RoomTopic): number => {
    const sourceUnreadCount = Math.max(0, Number(topic.unreadCount || 0));

    const normalizedTopicId = String(topic.id || "").trim();
    const normalizedActiveTopicId = String(activeTopicId || "").trim();

    const isActiveTopic = Boolean(normalizedTopicId && normalizedActiveTopicId && normalizedTopicId === normalizedActiveTopicId);
    if (!isActiveTopic || !isMessageSetAlignedWithActiveContext()) {
      return sourceUnreadCount;
    }

    return toEffectiveUnreadCount(sourceUnreadCount, messages);
  }, [activeTopicId, isMessageSetAlignedWithActiveContext, messages, toEffectiveUnreadCount]);

  const markTopicRead = useCallback(async (topicId: string, lastReadMessageId?: string) => {
    if (!authToken || markReadSaving || !topicId) {
      return;
    }

    const selectedTopic = topics.find((topic) => topic.id === topicId);
    const sourceUnreadCount = Math.max(0, Number(selectedTopic?.unreadCount || 0));
    if (!selectedTopic || sourceUnreadCount === 0) {
      return;
    }

    setMarkReadSaving(true);
    setMarkReadStatusText("");
    try {
      const result = await markTopicReadWsFirst(topicId, lastReadMessageId);
      if (result.kind === "failed") {
        throw new Error("mark_topic_read_failed");
      }
      onApplyTopicReadLocal(topicId);
      setMarkReadStatusText(t("chat.markReadSuccess"));
    } catch {
      setMarkReadStatusText(t("chat.markReadError"));
    } finally {
      setMarkReadSaving(false);
    }
  }, [authToken, markReadSaving, onApplyTopicReadLocal, t, topics, markTopicReadWsFirst]);

  const markRoomRead = useCallback(async () => {
    if (!authToken || markReadSaving || topics.length === 0) {
      return;
    }

    const unreadTopics = topics.filter((topic) => getTopicUnreadCount(topic) > 0);
    if (unreadTopics.length === 0) {
      return;
    }

    setMarkReadSaving(true);
    setMarkReadStatusText("");
    try {
      const results = await Promise.all(unreadTopics.map((topic) => markTopicReadWsFirst(topic.id)));
      if (results.some((result) => result.kind === "failed")) {
        throw new Error("mark_room_read_failed");
      }
      unreadTopics.forEach((topic) => onApplyTopicReadLocal(topic.id));
      setMarkReadStatusText(t("chat.markRoomReadSuccess"));
    } catch {
      setMarkReadStatusText(t("chat.markReadError"));
    } finally {
      setMarkReadSaving(false);
    }
  }, [authToken, getTopicUnreadCount, markReadSaving, onApplyTopicReadLocal, t, topics]);

  const markTopicUnreadFromMessage = useCallback(async (messageId: string) => {
    const topicId = String(activeTopicId || "").trim();
    const normalizedMessageId = String(messageId || "").trim();
    if (!authToken || !topicId || !normalizedMessageId || markReadSaving) {
      return;
    }

    const selectedIndex = messages.findIndex((item) => item.id === normalizedMessageId);
    if (selectedIndex <= 0) {
      setMarkReadStatusText(t("chat.markUnreadUnavailable"));
      return;
    }

    const selectedMessage = messages[selectedIndex];
    const selectedMessageUserId = String(selectedMessage?.user_id || "").trim();
    if (normalizedCurrentUserId && selectedMessageUserId && selectedMessageUserId === normalizedCurrentUserId) {
      setMarkReadStatusText(t("chat.markUnreadUnavailable"));
      return;
    }

    const previousMessageId = String(messages[selectedIndex - 1]?.id || "").trim();
    if (!previousMessageId) {
      setMarkReadStatusText(t("chat.markUnreadUnavailable"));
      return;
    }

    const selectedTopic = topics.find((topic) => topic.id === topicId);
    const sourceUnreadCount = Math.max(0, Number(selectedTopic?.unreadCount || 0));
    if (sourceUnreadCount <= 0) {
      setMarkReadStatusText(t("chat.markUnreadUnavailable"));
      return;
    }

    setMarkReadSaving(true);
    setMarkReadStatusText("");
    try {
      const result = await markTopicReadWsFirst(topicId, previousMessageId);
      if (result.kind === "failed") {
        throw new Error("mark_topic_unread_failed");
      }
      setMarkReadStatusText(t("chat.markUnreadSuccess"));
    } catch {
      setMarkReadStatusText(t("chat.markReadError"));
    } finally {
      setMarkReadSaving(false);
    }
  }, [activeTopicId, authToken, markReadSaving, messages, normalizedCurrentUserId, t, topics, markTopicReadWsFirst]);

  useEffect(() => {
    setMarkReadStatusText("");
  }, [activeTopicId]);

  useEffect(() => {
    const normalizedRoomId = String(roomId || "").trim();
    if (!normalizedRoomId) {
      // Ignore transient room-id gaps during reconnect/rejoin to avoid flicker.
      return;
    }

    if (!entryUnreadRoomIdRef.current) {
      entryUnreadRoomIdRef.current = normalizedRoomId;
      return;
    }

    if (entryUnreadRoomIdRef.current === normalizedRoomId) {
      return;
    }

    entryUnreadRoomIdRef.current = normalizedRoomId;
    unreadEntryTopicRef.current = "";
    unreadDividerScrolledTopicRef.current = "";
    oversizedMessageBoundaryProgressRef.current = {};
    setEntryUnreadDivider(null);
  }, [roomId]);

  useEffect(() => {
    const normalizedTopicId = String(activeTopicId || "").trim();
    if (!normalizedTopicId) {
      unreadEntryTopicRef.current = "";
      return;
    }

    if (unreadEntryTopicRef.current === normalizedTopicId) {
      return;
    }

    unreadEntryTopicRef.current = normalizedTopicId;
    unreadDividerScrolledTopicRef.current = "";
    oversizedMessageBoundaryProgressRef.current = {};
    setEntryUnreadDivider(null);
  }, [activeTopicId, topics, getTopicUnreadCount]);

  useEffect(() => {
    const normalizedTopicId = String(activeTopicId || "").trim();
    if (!normalizedTopicId) {
      return;
    }

    // Never compute divider against stale room/topic message buffers during chat switch.
    if (!isMessageSetAlignedWithActiveContext()) {
      setEntryUnreadDivider(null);
      unreadDividerScrolledTopicRef.current = "";
      return;
    }

    if (entryUnreadDivider?.topicId === normalizedTopicId && entryUnreadDivider.messageId) {
      return;
    }

    const serverAnchorMessageId = String(
      messages.find((message) => message.unread_divider_anchor)?.id || ""
    ).trim();
    if (serverAnchorMessageId) {
      setEntryUnreadDivider({
        topicId: normalizedTopicId,
        messageId: serverAnchorMessageId
      });
      unreadDividerScrolledTopicRef.current = "";
      return;
    }
    // Keep divider strictly server-driven to avoid client-side positional heuristics.
    setEntryUnreadDivider(null);
    unreadDividerScrolledTopicRef.current = "";
  }, [activeTopicId, entryUnreadDivider?.messageId, entryUnreadDivider?.topicId, isMessageSetAlignedWithActiveContext, messages]);

  useEffect(() => {
    if (!entryUnreadDivider?.messageId) {
      return;
    }

    const normalizedTopicId = String(activeTopicId || "").trim();
    if (!normalizedTopicId || entryUnreadDivider.topicId !== normalizedTopicId) {
      return;
    }

    if (unreadDividerScrolledTopicRef.current === normalizedTopicId) {
      return;
    }

    const container = chatLogRef.current;
    if (!container) {
      return;
    }

    const selectorMessageId = (typeof CSS !== "undefined" && typeof CSS.escape === "function")
      ? CSS.escape(entryUnreadDivider.messageId)
      : entryUnreadDivider.messageId;
    const target = container.querySelector<HTMLElement>(`[data-message-id="${selectorMessageId}"]`);
    if (!target) {
      return;
    }

    unreadDividerScrolledTopicRef.current = normalizedTopicId;
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [activeTopicId, chatLogRef, entryUnreadDivider]);

  useEffect(() => {
    const container = chatLogRef.current;
    if (!container) {
      return;
    }

    const normalizedTopicId = String(activeTopicId || "").trim();
    const lockAutoScroll = Boolean(
      entryUnreadDivider?.messageId
      && normalizedTopicId
      && entryUnreadDivider.topicId === normalizedTopicId
      && unreadDividerScrolledTopicRef.current !== normalizedTopicId
    );

    if (lockAutoScroll) {
      container.dataset.unreadDividerVisible = "1";
    } else {
      delete container.dataset.unreadDividerVisible;
    }

    return () => {
      delete container.dataset.unreadDividerVisible;
    };
  }, [activeTopicId, chatLogRef, entryUnreadDivider?.topicId, entryUnreadDivider?.messageId]);

  useEffect(() => {
    return () => {
      unreadEntryTopicRef.current = "";
      unreadDividerScrolledTopicRef.current = "";
      oversizedMessageBoundaryProgressRef.current = {};
      if (autoMarkReadRafRef.current !== null) {
        window.cancelAnimationFrame(autoMarkReadRafRef.current);
        autoMarkReadRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const normalizedToken = String(authToken || "").trim();
    const normalizedTopicId = String(activeTopicId || "").trim();
    const normalizedRoomId = String(roomId || "").trim();
    if (!normalizedToken || !normalizedTopicId || !normalizedRoomId) {
      return;
    }

    const topic = topics.find((item) => String(item.id || "").trim() === normalizedTopicId);
    if (!topic) {
      return;
    }

    const dividerForActiveTopicReady = Boolean(
      entryUnreadDivider?.topicId === normalizedTopicId && String(entryUnreadDivider.messageId || "").trim()
    );
    const shouldDelayAutoReadUntilDivider = Math.max(0, Number(topic.unreadCount || 0)) > 0
      && !dividerForActiveTopicReady
      && messagesHasMore;
    if (shouldDelayAutoReadUntilDivider) {
      return;
    }

    const topicRoomId = String(topic.roomId || "").trim();
    if (!topicRoomId || topicRoomId !== normalizedRoomId) {
      return;
    }

    const effectiveTopicUnread = Math.max(0, Number(getTopicUnreadCount(topic) || 0));
    if (effectiveTopicUnread <= 0) {
      return;
    }

    if (!isMessageSetAlignedWithActiveContext()) {
      return;
    }

    const chatContainer = chatLogRef.current;
    if (!chatContainer) {
      return;
    }

    const markFullyVisibleUnreadMessages = () => {
      const latestTopic = topics.find((item) => String(item.id || "").trim() === normalizedTopicId);
      if (!latestTopic) {
        return;
      }

      const latestUnreadCount = Math.max(0, Number(getTopicUnreadCount(latestTopic) || 0));
      if (latestUnreadCount <= 0) {
        return;
      }

      const firstUnreadIndex = Math.max(0, messages.length - latestUnreadCount);
      if (firstUnreadIndex >= messages.length) {
        return;
      }

      const containerRect = chatContainer.getBoundingClientRect();
      let candidateMessageId = "";
      let candidateMessageIndex = -1;

      const boundaryStateKey = (messageId: string) => `${normalizedTopicId}:${messageId}`;

      for (let index = firstUnreadIndex; index < messages.length; index += 1) {
        const message = messages[index];
        const messageId = String(message.id || "").trim();
        if (!messageId) {
          break;
        }

        const selectorMessageId = (typeof CSS !== "undefined" && typeof CSS.escape === "function")
          ? CSS.escape(messageId)
          : messageId;
        const element = chatContainer.querySelector<HTMLElement>(`[data-message-id="${selectorMessageId}"]`);
        if (!element) {
          break;
        }

        const messageRect = element.getBoundingClientRect();
        const fullyVisible = messageRect.top >= containerRect.top && messageRect.bottom <= containerRect.bottom;

        let qualifiesAsRead = fullyVisible;
        if (!qualifiesAsRead && messageRect.height > containerRect.height) {
          const progressKey = boundaryStateKey(messageId);
          const progress = oversizedMessageBoundaryProgressRef.current[progressKey] || {
            seenTop: false,
            seenBottom: false,
            lastEdge: null
          };

          const topEdgeVisible = messageRect.top >= containerRect.top && messageRect.top <= containerRect.bottom;
          const bottomEdgeVisible = messageRect.bottom >= containerRect.top && messageRect.bottom <= containerRect.bottom;

          if (topEdgeVisible && progress.lastEdge !== "top") {
            progress.seenTop = true;
            progress.lastEdge = "top";
          }

          if (bottomEdgeVisible && progress.lastEdge !== "bottom") {
            progress.seenBottom = true;
            progress.lastEdge = "bottom";
          }

          oversizedMessageBoundaryProgressRef.current[progressKey] = progress;
          qualifiesAsRead = progress.seenTop && progress.seenBottom;
        }

        if (!qualifiesAsRead) {
          break;
        }

        candidateMessageId = messageId;
        candidateMessageIndex = index;
      }

      if (!candidateMessageId || candidateMessageIndex < 0) {
        return;
      }

      if (lastAutoMarkedMessageIdByTopicRef.current[normalizedTopicId] === candidateMessageId) {
        return;
      }

      if (autoMarkReadInFlightRef.current[normalizedTopicId]) {
        return;
      }

      lastAutoMarkedMessageIdByTopicRef.current[normalizedTopicId] = candidateMessageId;

      autoMarkReadInFlightRef.current[normalizedTopicId] = candidateMessageId;

      void markTopicReadWsFirst(normalizedTopicId, candidateMessageId)
        .catch(() => {
          // Optimistic unread decay keeps UI responsive; server truth will reconcile.
        })
        .finally(() => {
          if (autoMarkReadInFlightRef.current[normalizedTopicId] === candidateMessageId) {
            delete autoMarkReadInFlightRef.current[normalizedTopicId];
          }
        });
    };

    const scheduleViewportReadCheck = () => {
      if (autoMarkReadRafRef.current !== null) {
        return;
      }

      autoMarkReadRafRef.current = window.requestAnimationFrame(() => {
        autoMarkReadRafRef.current = null;
        markFullyVisibleUnreadMessages();
      });
    };

    scheduleViewportReadCheck();
    chatContainer.addEventListener("scroll", scheduleViewportReadCheck, { passive: true });
    window.addEventListener("resize", scheduleViewportReadCheck);

    return () => {
      chatContainer.removeEventListener("scroll", scheduleViewportReadCheck);
      window.removeEventListener("resize", scheduleViewportReadCheck);
      if (autoMarkReadRafRef.current !== null) {
        window.cancelAnimationFrame(autoMarkReadRafRef.current);
        autoMarkReadRafRef.current = null;
      }
    };
  }, [activeTopicId, authToken, chatLogRef, entryUnreadDivider?.messageId, entryUnreadDivider?.topicId, getTopicUnreadCount, isMessageSetAlignedWithActiveContext, markTopicReadWsFirst, messages, messagesHasMore, roomId, topics]);

  useEffect(() => {
    const normalizedTopicId = String(activeTopicId || "").trim();
    if (!normalizedTopicId) {
      return;
    }

    const topic = topics.find((item) => String(item.id || "").trim() === normalizedTopicId);
    if (!topic || Math.max(0, Number(getTopicUnreadCount(topic) || 0)) === 0) {
      delete lastAutoMarkedMessageIdByTopicRef.current[normalizedTopicId];
    }
  }, [activeTopicId, getTopicUnreadCount, topics]);

  return {
    getTopicUnreadCount,
    markReadSaving,
    markReadStatusText,
    setMarkReadStatusText,
    markTopicRead,
    markRoomRead,
    markTopicUnreadFromMessage,
    entryUnreadDivider
  };
}
