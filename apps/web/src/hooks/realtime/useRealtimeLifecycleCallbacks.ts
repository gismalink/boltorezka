import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Message, MessagesCursor, PresenceMember } from "../../domain";
import type { RoomTopic } from "../../domain";
import type { RealtimeClient } from "../../services";
import type { ChatTypingByRoom } from "./useChatTypingController";
import { decrementUnreadValue, getTopicReadDeltas } from "./realtimeUnreadUtils";

type UseRealtimeLifecycleCallbacksArgs = {
  chatRoomSlug: string;
  roomSlugRef: MutableRefObject<string>;
  realtimeClientRef: MutableRefObject<RealtimeClient | null>;
  disconnectRoom: () => void;
  playServerSound: (event: "self_disconnected") => Promise<void>;
  setRoomsPresenceBySlug: Dispatch<SetStateAction<Record<string, string[]>>>;
  setRoomsPresenceDetailsBySlug: Dispatch<SetStateAction<Record<string, PresenceMember[]>>>;
  setRoomSlug: (slug: string) => void;
  setChatTypingByRoomSlug: Dispatch<SetStateAction<ChatTypingByRoom>>;
  setSessionMovedOverlayMessage: (value: string) => void;
  pushLog: (text: string) => void;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setMessagesHasMore: (value: boolean) => void;
  setMessagesNextCursor: Dispatch<SetStateAction<MessagesCursor | null>>;
  chatTopics: RoomTopic[];
  setChatTopics: Dispatch<SetStateAction<RoomTopic[]>>;
  setRoomUnreadBySlug: Dispatch<SetStateAction<Record<string, number>>>;
  setRoomMentionUnreadBySlug: Dispatch<SetStateAction<Record<string, number>>>;
  roomSlugById: Record<string, string>;
  activeTopicId: string | null;
  currentUserId: string;
  applyRemoteTypingPayload: (payload: {
    roomId?: string;
    roomSlug?: string;
    userId?: string;
    userName?: string;
    isTyping?: boolean;
    ts?: string;
  }) => void;
  applyRemotePinState: (messageId: string, pinned: boolean) => void;
  applyRemoteMessageReactionState: (messageId: string, emoji: string, active: boolean, actorUserId?: string) => void;
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
  chatTopics,
  setChatTopics,
  setRoomUnreadBySlug,
  setRoomMentionUnreadBySlug,
  roomSlugById,
  activeTopicId,
  currentUserId,
  applyRemoteTypingPayload,
  applyRemotePinState,
  applyRemoteMessageReactionState
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

  const handleChatMessagePinned = useCallback((payload: {
    roomSlug?: string;
    messageId?: string;
    pinned?: boolean;
  }) => {
    const targetRoomSlug = String(payload.roomSlug || "").trim();
    const targetMessageId = String(payload.messageId || "").trim();
    if (!targetRoomSlug || targetRoomSlug !== chatRoomSlug || !targetMessageId) {
      return;
    }

    applyRemotePinState(targetMessageId, payload.pinned !== false);
  }, [applyRemotePinState, chatRoomSlug]);

  const handleChatMessageUnpinned = useCallback((payload: {
    roomSlug?: string;
    messageId?: string;
    pinned?: boolean;
  }) => {
    const targetRoomSlug = String(payload.roomSlug || "").trim();
    const targetMessageId = String(payload.messageId || "").trim();
    if (!targetRoomSlug || targetRoomSlug !== chatRoomSlug || !targetMessageId) {
      return;
    }

    applyRemotePinState(targetMessageId, payload.pinned === true);
  }, [applyRemotePinState, chatRoomSlug]);

  const handleChatMessageReactionChanged = useCallback((payload: {
    roomSlug?: string;
    messageId?: string;
    emoji?: string;
    active?: boolean;
    userId?: string;
  }) => {
    const targetRoomSlug = String(payload.roomSlug || "").trim();
    const targetMessageId = String(payload.messageId || "").trim();
    const emoji = String(payload.emoji || "").trim();
    const actorUserId = String(payload.userId || "").trim();
    if (!targetRoomSlug || targetRoomSlug !== chatRoomSlug || !targetMessageId || !emoji) {
      return;
    }

    applyRemoteMessageReactionState(targetMessageId, emoji, payload.active === true, actorUserId || undefined);
  }, [applyRemoteMessageReactionState, chatRoomSlug]);

  const handleChatMessageReceived = useCallback((payload: {
    roomSlug?: string;
    roomId?: string;
    topicId?: string;
    userId?: string;
    senderRequestId?: string;
    mentionUserIds?: string[];
  }) => {
    const targetRoomId = String(payload.roomId || "").trim();
    const targetRoomSlug = String(payload.roomSlug || roomSlugById[targetRoomId] || "").trim();
    const targetTopicId = String(payload.topicId || "").trim();
    const normalizedActiveTopicId = String(activeTopicId || "").trim();
    const selfUserId = String(currentUserId || "").trim();

    if (!targetRoomSlug) {
      return;
    }

    const isSameRoom = targetRoomSlug === chatRoomSlug;
    const isVisibleInCurrentContext = isSameRoom
      && (
        (normalizedActiveTopicId && targetTopicId === normalizedActiveTopicId)
        || (!normalizedActiveTopicId && !targetTopicId)
      );

    if (isVisibleInCurrentContext) {
      return;
    }

    const mentionTargets = Array.isArray(payload.mentionUserIds)
      ? payload.mentionUserIds
        .map((value) => String(value || "").trim())
        .filter(Boolean)
      : [];
    const mentionIncludesCurrentUser = Boolean(
      selfUserId
      && mentionTargets.length > 0
      && mentionTargets.includes(selfUserId)
    );

    setRoomUnreadBySlug((prev) => ({
      ...prev,
      [targetRoomSlug]: Math.max(0, Number(prev[targetRoomSlug] || 0)) + 1
    }));
    if (mentionIncludesCurrentUser) {
      setRoomMentionUnreadBySlug((prev) => ({
        ...prev,
        [targetRoomSlug]: Math.max(0, Number(prev[targetRoomSlug] || 0)) + 1
      }));
    }
  }, [activeTopicId, chatRoomSlug, currentUserId, roomSlugById, setRoomMentionUnreadBySlug, setRoomUnreadBySlug]);

  const handleChatTopicRead = useCallback((payload: {
    roomId?: string;
    topicId?: string;
    userId?: string;
    unreadDelta?: number;
    mentionDelta?: number;
  }) => {
    const targetRoomId = String(payload.roomId || "").trim();
    const targetTopicId = String(payload.topicId || "").trim();
    const actorUserId = String(payload.userId || "").trim();
    const selfUserId = String(currentUserId || "").trim();
    if (!targetTopicId || !actorUserId || !selfUserId || actorUserId !== selfUserId) {
      return;
    }

    const payloadUnreadDelta = Math.max(0, Number(payload.unreadDelta || 0));
    const { topicFound, unreadDelta: snapshotUnreadDelta } = getTopicReadDeltas(chatTopics, targetTopicId);
    const unreadDelta = payloadUnreadDelta > 0 ? payloadUnreadDelta : snapshotUnreadDelta;
    if (!topicFound) {
      pushLog(`chat.topic.read topic snapshot missing: topicId=${targetTopicId}`);
    }

    setChatTopics((prev) => prev.map((topic) => {
      if (topic.id !== targetTopicId) {
        return topic;
      }

      const nextUnreadCount = 0;
      if (topic.unreadCount === nextUnreadCount) {
        return topic;
      }

      return {
        ...topic,
        unreadCount: nextUnreadCount
      };
    }));

    setRoomUnreadBySlug((prev) => {
      const resolvedRoomSlug = targetRoomId ? String(roomSlugById[targetRoomId] || "").trim() : "";
      const targetRoomSlug = resolvedRoomSlug || chatRoomSlug;
      if (!targetRoomSlug) {
        return prev;
      }

      const currentUnread = Math.max(0, Number(prev[targetRoomSlug] || 0));
      if (currentUnread === 0 || unreadDelta <= 0) {
        return prev;
      }

      const nextUnread = decrementUnreadValue(currentUnread, unreadDelta);
      if (nextUnread === currentUnread) {
        return prev;
      }

      return {
        ...prev,
        [targetRoomSlug]: nextUnread
      };
    });
  }, [chatRoomSlug, chatTopics, currentUserId, pushLog, roomSlugById, setChatTopics, setRoomUnreadBySlug]);

  const handleChatTopicDeleted = useCallback((payload: {
    roomId?: string;
    roomSlug?: string;
    topicId?: string;
  }) => {
    const targetRoomSlug = String(payload.roomSlug || roomSlugById[String(payload.roomId || "").trim()] || "").trim();
    const targetTopicId = String(payload.topicId || "").trim();
    if (!targetRoomSlug || targetRoomSlug !== chatRoomSlug || !targetTopicId) {
      return;
    }

    setChatTopics((prev) => {
      if (!prev.some((topic) => topic.id === targetTopicId)) {
        return prev;
      }
      return prev.filter((topic) => topic.id !== targetTopicId);
    });
  }, [chatRoomSlug, roomSlugById, setChatTopics]);

  const sortTopics = useCallback((topics: RoomTopic[]) => {
    return [...topics].sort((a, b) => {
      const pinnedDiff = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
      if (pinnedDiff !== 0) {
        return pinnedDiff;
      }

      const positionDiff = Number(a.position || 0) - Number(b.position || 0);
      if (positionDiff !== 0) {
        return positionDiff;
      }

      return String(a.title || "").localeCompare(String(b.title || ""));
    });
  }, []);

  const handleTopicMutation = useCallback((payload: {
    roomId?: string;
    roomSlug?: string;
    topic?: RoomTopic;
  }) => {
    const topic = payload.topic;
    if (!topic) {
      return;
    }

    const targetRoomSlug = String(payload.roomSlug || roomSlugById[String(payload.roomId || "").trim()] || "").trim();
    if (!targetRoomSlug || targetRoomSlug !== chatRoomSlug) {
      return;
    }

    setChatTopics((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === topic.id);
      if (existingIndex < 0) {
        return sortTopics([...prev, topic]);
      }

      const next = [...prev];
      next[existingIndex] = {
        ...next[existingIndex],
        ...topic
      };
      return sortTopics(next);
    });
  }, [chatRoomSlug, roomSlugById, setChatTopics, sortTopics]);

  const handleChatTopicCreated = useCallback((payload: {
    roomId?: string;
    roomSlug?: string;
    topic?: RoomTopic;
  }) => {
    handleTopicMutation(payload);
  }, [handleTopicMutation]);

  const handleChatTopicUpdated = useCallback((payload: {
    roomId?: string;
    roomSlug?: string;
    topic?: RoomTopic;
  }) => {
    handleTopicMutation(payload);
  }, [handleTopicMutation]);

  const handleChatTopicArchived = useCallback((payload: {
    roomId?: string;
    roomSlug?: string;
    topic?: RoomTopic;
  }) => {
    handleTopicMutation(payload);
  }, [handleTopicMutation]);

  const handleChatTopicUnarchived = useCallback((payload: {
    roomId?: string;
    roomSlug?: string;
    topic?: RoomTopic;
  }) => {
    handleTopicMutation(payload);
  }, [handleTopicMutation]);

  const handleNotificationSettingsUpdated = useCallback((payload: {
    settings?: {
      scopeType?: string;
      mode?: string;
    };
  }) => {
    const scopeType = String(payload.settings?.scopeType || "").trim();
    const mode = String(payload.settings?.mode || "").trim();
    if (!scopeType || !mode) {
      return;
    }

    pushLog(`notification settings updated (${scopeType}:${mode})`);
  }, [pushLog]);

  return {
    handleSessionMoved,
    handleChatCleared,
    handleChatTyping,
    handleChatMessagePinned,
    handleChatMessageUnpinned,
    handleChatMessageReactionChanged,
    handleChatMessageReceived,
    handleChatTopicRead,
    handleChatTopicCreated,
    handleChatTopicUpdated,
    handleChatTopicArchived,
    handleChatTopicUnarchived,
    handleChatTopicDeleted,
    handleNotificationSettingsUpdated
  };
}