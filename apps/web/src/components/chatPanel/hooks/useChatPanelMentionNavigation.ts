/**
 * useChatPanelMentionNavigation.ts — навигация по непрочитанным упоминаниям.
 * Управляет очередью eventId/messageId, постраничной загрузкой и reconciliation счётчика.
 */
// Хук навигации по непрочитанным упоминаниям в теме.
// Управляет очередью eventId/messageId, пагинацией, reconciliation счётчика.
import { useCallback, useRef } from "react";
import { api } from "../../../api";

type TopicUnreadMentionNavItem = {
  eventId: string;
  messageId: string;
};

type UseChatPanelMentionNavigationParams = {
  authToken: string;
  roomId: string;
  roomSlug: string;
  activeTopicId: string | null;
  topicMentionsActionLoading: boolean;
  setTopicMentionsActionLoading: (loading: boolean) => void;
  onConsumeTopicMentionUnread: (topicId: string) => void;
  onSetTopicMentionUnreadLocal: (topicId: string, count: number) => void;
  setSearchJumpStatusText: (text: string) => void;
  setSearchJumpTarget: (target: {
    messageId: string;
    roomSlug: string;
    topicId: string;
    includeHistoryLoad: boolean;
  }) => void;
  t: (key: string) => string;
};

export function useChatPanelMentionNavigation({
  authToken,
  roomId,
  roomSlug,
  activeTopicId,
  topicMentionsActionLoading,
  setTopicMentionsActionLoading,
  onConsumeTopicMentionUnread,
  onSetTopicMentionUnreadLocal,
  setSearchJumpStatusText,
  setSearchJumpTarget,
  t
}: UseChatPanelMentionNavigationParams) {
  const topicUnreadMentionQueueRef = useRef<TopicUnreadMentionNavItem[]>([]);
  const topicUnreadMentionCursorRef = useRef<{ beforeCreatedAt: string; beforeId: string } | null>(null);
  const topicUnreadMentionHasMoreRef = useRef(true);
  const topicUnreadMentionTopicIdRef = useRef("");

  const resetForTopic = useCallback((topicId: string) => {
    topicUnreadMentionTopicIdRef.current = topicId;
    topicUnreadMentionQueueRef.current = [];
    topicUnreadMentionCursorRef.current = null;
    topicUnreadMentionHasMoreRef.current = Boolean(topicId);
  }, []);

  const loadTopicUnreadMentionsPage = useCallback(async () => {
    const topicId = String(activeTopicId || "").trim();
    if (!authToken || !topicId || !topicUnreadMentionHasMoreRef.current) {
      return;
    }

    const cursor = topicUnreadMentionCursorRef.current;
    const response = await api.topicUnreadMentions(authToken, topicId, {
      limit: 20,
      beforeCreatedAt: cursor?.beforeCreatedAt,
      beforeId: cursor?.beforeId
    });

    if (topicUnreadMentionTopicIdRef.current !== topicId) {
      return;
    }

    const existingEventIds = new Set(topicUnreadMentionQueueRef.current.map((item) => item.eventId));
    const nextItems = (Array.isArray(response.items) ? response.items : [])
      .map((item) => ({
        eventId: String(item.id || "").trim(),
        messageId: String(item.messageId || "").trim()
      }))
      .filter((item) => item.eventId && item.messageId && !existingEventIds.has(item.eventId));

    if (nextItems.length > 0) {
      topicUnreadMentionQueueRef.current = [...topicUnreadMentionQueueRef.current, ...nextItems];
    }

    const nextCursor = response.pagination?.nextCursor ?? null;
    topicUnreadMentionCursorRef.current = nextCursor;
    topicUnreadMentionHasMoreRef.current = Boolean(response.pagination?.hasMore && nextCursor);
  }, [activeTopicId, authToken]);

  const reconcileTopicMentionUnreadCount = useCallback(async (topicId: string) => {
    const normalizedTopicId = String(topicId || "").trim();
    if (!authToken || !roomId || !normalizedTopicId) {
      return;
    }

    try {
      const response = await api.roomTopics(authToken, roomId);
      if (topicUnreadMentionTopicIdRef.current !== normalizedTopicId) {
        return;
      }

      const matchingTopic = (Array.isArray(response.topics) ? response.topics : [])
        .find((topic) => String(topic.id || "").trim() === normalizedTopicId);
      const nextMentionUnreadCount = Math.max(0, Number(matchingTopic?.mentionUnreadCount || 0));

      onSetTopicMentionUnreadLocal(normalizedTopicId, nextMentionUnreadCount);
      if (nextMentionUnreadCount === 0) {
        topicUnreadMentionQueueRef.current = [];
        topicUnreadMentionCursorRef.current = null;
        topicUnreadMentionHasMoreRef.current = false;
      }
    } catch {
      // Keep mention navigation non-blocking on transient room-topics sync failures.
    }
  }, [authToken, onSetTopicMentionUnreadLocal, roomId]);

  const jumpToNextTopicUnreadMention = useCallback(async () => {
    const topicId = String(activeTopicId || "").trim();
    const normalizedRoomSlug = String(roomSlug || "").trim();
    if (!authToken || !topicId || !normalizedRoomSlug || topicMentionsActionLoading) {
      return;
    }

    setTopicMentionsActionLoading(true);
    try {
      let nextItem = topicUnreadMentionQueueRef.current.shift();
      let guard = 0;

      while (!nextItem && topicUnreadMentionHasMoreRef.current && guard < 4) {
        guard += 1;
        await loadTopicUnreadMentionsPage();
        nextItem = topicUnreadMentionQueueRef.current.shift();
      }

      if (!nextItem) {
        await reconcileTopicMentionUnreadCount(topicId);
        return;
      }

      await api.markNotificationInboxRead(authToken, nextItem.eventId);
      onConsumeTopicMentionUnread(topicId);

      setSearchJumpStatusText(t("chat.topicMentionsJumping"));
      setSearchJumpTarget({
        messageId: nextItem.messageId,
        roomSlug: normalizedRoomSlug,
        topicId,
        includeHistoryLoad: true
      });
    } catch {
      // Non-blocking: keep UI responsive even if mention-read acknowledgement fails.
    } finally {
      setTopicMentionsActionLoading(false);
    }
  }, [activeTopicId, authToken, loadTopicUnreadMentionsPage, onConsumeTopicMentionUnread, reconcileTopicMentionUnreadCount, roomSlug, setSearchJumpStatusText, setSearchJumpTarget, t, topicMentionsActionLoading, setTopicMentionsActionLoading]);

  return {
    resetForTopic,
    jumpToNextTopicUnreadMention
  };
}
