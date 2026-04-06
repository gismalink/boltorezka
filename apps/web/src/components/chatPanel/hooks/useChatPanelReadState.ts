import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { api } from "../../../api";
import type { Message, RoomTopic } from "../../../domain";

type UseChatPanelReadStateArgs = {
  t: (key: string) => string;
  authToken: string;
  activeTopicId: string | null;
  roomId: string;
  topics: RoomTopic[];
  messages: Message[];
  loadingOlderMessages: boolean;
  messagesHasMore: boolean;
  onLoadOlderMessages: () => void;
  chatLogRef: RefObject<HTMLDivElement>;
};

export function useChatPanelReadState({
  t,
  authToken,
  activeTopicId,
  roomId,
  topics,
  messages,
  loadingOlderMessages,
  messagesHasMore,
  onLoadOlderMessages,
  chatLogRef
}: UseChatPanelReadStateArgs) {
  const [topicUnreadOverrideById, setTopicUnreadOverrideById] = useState<Record<string, { unreadCount: number; sourceUnreadCount: number }>>({});
  const [markReadSaving, setMarkReadSaving] = useState(false);
  const [markReadStatusText, setMarkReadStatusText] = useState("");
  const [entryUnreadDivider, setEntryUnreadDivider] = useState<{
    topicId: string;
    messageId: string;
  } | null>(null);

  const autoMarkReadInFlightRef = useRef<Record<string, number>>({});
  const entryUnreadCountByTopicRef = useRef<Record<string, number>>({});
  const entryUnreadRoomIdRef = useRef<string>("");
  const unreadEntryTopicRef = useRef<string>("");
  const unreadBackfillAttemptsByTopicRef = useRef<Record<string, number>>({});
  const unreadDividerScrolledTopicRef = useRef<string>("");

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
    const override = topicUnreadOverrideById[topic.id];
    if (override && topic.unreadCount === override.sourceUnreadCount) {
      return Math.max(0, override.unreadCount);
    }

    return Math.max(0, Number(topic.unreadCount || 0));
  }, [topicUnreadOverrideById]);

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
      await api.markTopicRead(authToken, topicId, lastReadMessageId ? { lastReadMessageId } : {});
      setTopicUnreadOverrideById((prev) => ({
        ...prev,
        [topicId]: {
          unreadCount: 0,
          sourceUnreadCount
        }
      }));
      setMarkReadStatusText(t("chat.markReadSuccess"));
    } catch {
      setMarkReadStatusText(t("chat.markReadError"));
    } finally {
      setMarkReadSaving(false);
    }
  }, [authToken, markReadSaving, t, topics]);

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
      await Promise.all(unreadTopics.map((topic) => api.markTopicRead(authToken, topic.id)));
      setTopicUnreadOverrideById((prev) => {
        const next = { ...prev };
        unreadTopics.forEach((topic) => {
          next[topic.id] = {
            unreadCount: 0,
            sourceUnreadCount: Math.max(0, Number(topic.unreadCount || 0))
          };
        });
        return next;
      });
      setMarkReadStatusText(t("chat.markRoomReadSuccess"));
    } catch {
      setMarkReadStatusText(t("chat.markReadError"));
    } finally {
      setMarkReadSaving(false);
    }
  }, [authToken, getTopicUnreadCount, markReadSaving, t, topics]);

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

    const previousMessageId = String(messages[selectedIndex - 1]?.id || "").trim();
    if (!previousMessageId) {
      setMarkReadStatusText(t("chat.markUnreadUnavailable"));
      return;
    }

    const selectedTopic = topics.find((topic) => topic.id === topicId);
    const sourceUnreadCount = Math.max(0, Number(selectedTopic?.unreadCount || 0));
    const estimatedUnreadCount = Math.max(0, messages.length - selectedIndex);

    setMarkReadSaving(true);
    setMarkReadStatusText("");
    try {
      await api.markTopicRead(authToken, topicId, { lastReadMessageId: previousMessageId });
      setTopicUnreadOverrideById((prev) => ({
        ...prev,
        [topicId]: {
          unreadCount: estimatedUnreadCount,
          sourceUnreadCount
        }
      }));
      setMarkReadStatusText(t("chat.markUnreadSuccess"));
    } catch {
      setMarkReadStatusText(t("chat.markReadError"));
    } finally {
      setMarkReadSaving(false);
    }
  }, [activeTopicId, authToken, markReadSaving, messages, t, topics]);

  useEffect(() => {
    setMarkReadStatusText("");
  }, [activeTopicId]);

  useEffect(() => {
    const topicIds = new Set(topics.map((topic) => topic.id));
    const unreadCountById = new Map(topics.map((topic) => [topic.id, topic.unreadCount]));

    setTopicUnreadOverrideById((prev) => {
      let changed = false;
      const next: Record<string, { unreadCount: number; sourceUnreadCount: number }> = {};

      Object.entries(prev).forEach(([topicId, override]) => {
        if (!topicIds.has(topicId)) {
          changed = true;
          return;
        }

        if (unreadCountById.get(topicId) !== override.sourceUnreadCount) {
          changed = true;
          return;
        }

        next[topicId] = override;
      });

      return changed ? next : prev;
    });
  }, [topics]);

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
    unreadBackfillAttemptsByTopicRef.current[normalizedTopicId] = 0;
    setEntryUnreadDivider(null);

    const activeTopic = topics.find((topic) => String(topic.id || "").trim() === normalizedTopicId);
    entryUnreadCountByTopicRef.current[normalizedTopicId] = activeTopic ? getTopicUnreadCount(activeTopic) : 0;
  }, [activeTopicId, topics, getTopicUnreadCount]);

  useEffect(() => {
    const normalizedTopicId = String(activeTopicId || "").trim();
    if (!normalizedTopicId || loadingOlderMessages || !messagesHasMore) {
      return;
    }

    if (!isMessageSetAlignedWithActiveContext()) {
      return;
    }

    const entryUnreadCount = Math.max(0, Number(entryUnreadCountByTopicRef.current[normalizedTopicId] || 0));
    if (entryUnreadCount <= 0 || messages.length > entryUnreadCount) {
      return;
    }

    const attempts = Math.max(0, Number(unreadBackfillAttemptsByTopicRef.current[normalizedTopicId] || 0));
    if (attempts >= 12) {
      return;
    }

    unreadBackfillAttemptsByTopicRef.current[normalizedTopicId] = attempts + 1;
    onLoadOlderMessages();
  }, [activeTopicId, isMessageSetAlignedWithActiveContext, loadingOlderMessages, messages.length, messagesHasMore, onLoadOlderMessages]);

  useEffect(() => {
    const normalizedTopicId = String(activeTopicId || "").trim();
    if (!normalizedTopicId) {
      return;
    }

    if (!isMessageSetAlignedWithActiveContext()) {
      setEntryUnreadDivider(null);
      unreadDividerScrolledTopicRef.current = "";
      return;
    }

    if (entryUnreadDivider?.topicId === normalizedTopicId && entryUnreadDivider.messageId) {
      return;
    }

    const entryUnreadCount = Math.max(0, Number(entryUnreadCountByTopicRef.current[normalizedTopicId] || 0));
    if (entryUnreadCount <= 0 || messages.length === 0) {
      return;
    }

    const hasEnoughMessagesForExactDivider = messages.length > entryUnreadCount;
    const noMoreHistoryToLoad = !messagesHasMore;
    if (!hasEnoughMessagesForExactDivider && !noMoreHistoryToLoad) {
      return;
    }

    const dividerIndex = Math.max(0, Math.min(messages.length - 1, messages.length - entryUnreadCount));
    const dividerMessageId = String(messages[dividerIndex]?.id || "").trim();
    if (!dividerMessageId) {
      setEntryUnreadDivider(null);
      unreadDividerScrolledTopicRef.current = "";
      return;
    }

    setEntryUnreadDivider({
      topicId: normalizedTopicId,
      messageId: dividerMessageId
    });
    unreadDividerScrolledTopicRef.current = "";
  }, [activeTopicId, entryUnreadDivider?.messageId, entryUnreadDivider?.topicId, isMessageSetAlignedWithActiveContext, messages, messagesHasMore]);

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

    const topicRoomId = String(topic.roomId || "").trim();
    if (!topicRoomId || topicRoomId !== normalizedRoomId) {
      return;
    }

    const topicUnread = Math.max(0, Number(topic.unreadCount || 0));
    if (topicUnread === 0) {
      return;
    }

    const inflightUnread = autoMarkReadInFlightRef.current[normalizedTopicId] || 0;
    if (inflightUnread >= topicUnread) {
      return;
    }

    autoMarkReadInFlightRef.current[normalizedTopicId] = topicUnread;
    let disposed = false;

    void api.markTopicRead(normalizedToken, normalizedTopicId)
      .then(() => {
        if (disposed) {
          return;
        }

        setTopicUnreadOverrideById((prev) => ({
          ...prev,
          [normalizedTopicId]: {
            unreadCount: 0,
            sourceUnreadCount: topicUnread
          }
        }));
      })
      .finally(() => {
        if (autoMarkReadInFlightRef.current[normalizedTopicId] === topicUnread) {
          delete autoMarkReadInFlightRef.current[normalizedTopicId];
        }
      });

    return () => {
      disposed = true;
    };
  }, [activeTopicId, authToken, roomId, topics]);

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
