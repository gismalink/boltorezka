import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";
import { api } from "../../api";
import { trackClientEvent } from "../../telemetry";
import type { Message, MessagesCursor, PresenceMember, RoomTopic } from "../../domain";
import { RealtimeClient, WsMessageController } from "../../services";
import type { ChatController } from "../../services";

type UseRealtimeChatLifecycleArgs = {
  token: string;
  currentServerId?: string;
  reconnectNonce: number;
  joinedRoomSlug: string;
  chatRoomSlug: string;
  activeTopicId: string | null;
  messages: Message[];
  messagesNextCursor: MessagesCursor | null;
  loadingOlderMessages: boolean;
  chatController: ChatController;
  chatLogRef: RefObject<HTMLDivElement>;
  roomSlugRef: MutableRefObject<string>;
  realtimeClientRef: MutableRefObject<RealtimeClient | null>;
  lastRoomSlugForScrollRef: MutableRefObject<string>;
  lastMessageIdRef: MutableRefObject<string | null>;
  setWsState: (value: "disconnected" | "connecting" | "connected") => void;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setJoinedRoomSlug: (slug: string) => void;
  onRoomMediaTopology?: (payload: { roomSlug: string; mediaTopology: "livekit" }) => void;
  setRoomsPresenceBySlug: Dispatch<SetStateAction<Record<string, string[]>>>;
  setRoomsPresenceDetailsBySlug: Dispatch<SetStateAction<Record<string, PresenceMember[]>>>;
  pushLog: (text: string) => void;
  pushCallLog: (text: string) => void;
  pushToast: (message: string) => void;
  markMessageDelivery: (
    requestId: string,
    status: "sending" | "delivered" | "failed",
    patch?: Partial<Message>
  ) => void;
  onCallMicState?: (
    payload: { fromUserId?: string; fromUserName?: string; muted?: boolean; speaking?: boolean; audioMuted?: boolean }
  ) => void;
  onCallVideoState?: (
    payload: {
      fromUserId?: string;
      fromUserName?: string;
      roomSlug?: string;
      settings?: Record<string, unknown>;
    }
  ) => void;
  onCallInitialState?: (
    payload: {
      roomSlug?: string;
      participants?: Array<{
        userId?: string;
        userName?: string;
        mic?: {
          muted?: boolean;
          speaking?: boolean;
          audioMuted?: boolean;
        };
        video?: {
          localVideoEnabled?: boolean;
        };
      }>;
    }
  ) => void;
  onCallNack?: (
    payload: { requestId: string; eventType: string; code: string; message: string }
  ) => void;
  onAudioQualityUpdated?: (
    payload: {
      scope?: string;
      audioQuality?: string;
      roomId?: string;
      roomSlug?: string;
      audioQualityOverride?: string | null;
      updatedAt?: string;
      updatedByUserId?: string | null;
    }
  ) => void;
  onChatCleared?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      deletedCount?: number;
      clearedAt?: string;
    }
  ) => void;
  onChatTyping?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      userId?: string;
      userName?: string;
      isTyping?: boolean;
      ts?: string;
    }
  ) => void;
  onChatMessagePinned?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      topicId?: string;
      topicSlug?: string;
      messageId?: string;
      pinned?: boolean;
      pinnedByUserId?: string;
      ts?: string;
    }
  ) => void;
  onChatMessageUnpinned?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      topicId?: string;
      topicSlug?: string;
      messageId?: string;
      pinned?: boolean;
      unpinnedByUserId?: string;
      ts?: string;
    }
  ) => void;
  onChatMessageReactionChanged?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      topicId?: string;
      topicSlug?: string;
      messageId?: string;
      emoji?: string;
      userId?: string;
      active?: boolean;
      ts?: string;
    }
  ) => void;
  onChatMessageReceived?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      topicId?: string;
      topicSlug?: string;
      messageId?: string;
      userId?: string;
      userName?: string;
      createdAt?: string;
      senderRequestId?: string;
    }
  ) => void;
  onChatTopicRead?: (
    payload: {
      roomId?: string;
      topicId?: string;
      userId?: string;
      lastReadMessageId?: string;
      lastReadAt?: string;
    }
  ) => void;
  onChatTopicCreated?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      topic?: RoomTopic;
      actorUserId?: string;
      ts?: string;
    }
  ) => void;
  onChatTopicUpdated?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      topic?: RoomTopic;
      actorUserId?: string;
      ts?: string;
    }
  ) => void;
  onChatTopicArchived?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      topic?: RoomTopic;
      actorUserId?: string;
      ts?: string;
    }
  ) => void;
  onChatTopicUnarchived?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      topic?: RoomTopic;
      actorUserId?: string;
      ts?: string;
    }
  ) => void;
  onNotificationSettingsUpdated?: (
    payload: {
      settings?: {
        id: string;
        userId: string;
        scopeType: "server" | "room" | "topic";
        serverId: string | null;
        roomId: string | null;
        topicId: string | null;
        mode: "all" | "mentions" | "none";
        muteUntil: string | null;
        allowCriticalMentions: boolean;
        createdAt: string;
        updatedAt: string;
      };
      ts?: string;
    }
  ) => void;
  onAck?: (
    payload: { requestId: string; eventType: string; meta: Record<string, unknown> }
  ) => void;
  onNack?: (
    payload: { requestId: string; eventType: string; code: string; message: string }
  ) => void;
  onScreenShareState?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      active?: boolean;
      ownerUserId?: string | null;
      ownerUserName?: string | null;
      ts?: string;
    }
  ) => void;
  onSessionMoved?: (payload: { code: string; message: string }) => void;
};

export function useRealtimeChatLifecycle({
  token,
  currentServerId,
  reconnectNonce,
  joinedRoomSlug,
  chatRoomSlug,
  activeTopicId,
  messages,
  messagesNextCursor,
  loadingOlderMessages,
  chatController,
  chatLogRef,
  roomSlugRef,
  realtimeClientRef,
  lastRoomSlugForScrollRef,
  lastMessageIdRef,
  setWsState,
  setMessages,
  setJoinedRoomSlug,
  onRoomMediaTopology,
  setRoomsPresenceBySlug,
  setRoomsPresenceDetailsBySlug,
  pushLog,
  pushCallLog,
  pushToast,
  markMessageDelivery,
  onCallMicState,
  onCallVideoState,
  onCallInitialState,
  onCallNack,
  onAudioQualityUpdated,
  onChatCleared,
  onChatTyping,
  onChatMessagePinned,
  onChatMessageUnpinned,
  onChatMessageReactionChanged,
  onChatMessageReceived,
  onChatTopicRead,
  onChatTopicCreated,
  onChatTopicUpdated,
  onChatTopicArchived,
  onChatTopicUnarchived,
  onNotificationSettingsUpdated,
  onAck,
  onNack,
  onScreenShareState,
  onSessionMoved
}: UseRealtimeChatLifecycleArgs) {
  const shouldStickToBottomRef = useRef(true);
  const lastConversationKeyForScrollRef = useRef("");

  const onCallMicStateRef = useRef(onCallMicState);
  const onCallVideoStateRef = useRef(onCallVideoState);
  const onCallInitialStateRef = useRef(onCallInitialState);
  const onCallNackRef = useRef(onCallNack);
  const onAudioQualityUpdatedRef = useRef(onAudioQualityUpdated);
  const onChatClearedRef = useRef(onChatCleared);
  const onChatTypingRef = useRef(onChatTyping);
  const onChatMessagePinnedRef = useRef(onChatMessagePinned);
  const onChatMessageUnpinnedRef = useRef(onChatMessageUnpinned);
  const onChatMessageReactionChangedRef = useRef(onChatMessageReactionChanged);
  const onChatMessageReceivedRef = useRef(onChatMessageReceived);
  const onChatTopicReadRef = useRef(onChatTopicRead);
  const onChatTopicCreatedRef = useRef(onChatTopicCreated);
  const onChatTopicUpdatedRef = useRef(onChatTopicUpdated);
  const onChatTopicArchivedRef = useRef(onChatTopicArchived);
  const onChatTopicUnarchivedRef = useRef(onChatTopicUnarchived);
  const onNotificationSettingsUpdatedRef = useRef(onNotificationSettingsUpdated);
  const onAckRef = useRef(onAck);
  const onNackRef = useRef(onNack);
  const onScreenShareStateRef = useRef(onScreenShareState);
  const onRoomMediaTopologyRef = useRef(onRoomMediaTopology);
  const activeChatRoomSlugRef = useRef(chatRoomSlug);
  const activeTopicIdRef = useRef<string | null>(activeTopicId);

  useEffect(() => {
    onCallMicStateRef.current = onCallMicState;
  }, [onCallMicState]);

  useEffect(() => {
    onCallVideoStateRef.current = onCallVideoState;
  }, [onCallVideoState]);

  useEffect(() => {
    onCallInitialStateRef.current = onCallInitialState;
  }, [onCallInitialState]);

  useEffect(() => {
    onCallNackRef.current = onCallNack;
  }, [onCallNack]);

  useEffect(() => {
    onAudioQualityUpdatedRef.current = onAudioQualityUpdated;
  }, [onAudioQualityUpdated]);

  useEffect(() => {
    onChatClearedRef.current = onChatCleared;
  }, [onChatCleared]);

  useEffect(() => {
    onChatTypingRef.current = onChatTyping;
  }, [onChatTyping]);

  useEffect(() => {
    onChatMessagePinnedRef.current = onChatMessagePinned;
  }, [onChatMessagePinned]);

  useEffect(() => {
    onChatMessageUnpinnedRef.current = onChatMessageUnpinned;
  }, [onChatMessageUnpinned]);

  useEffect(() => {
    onChatMessageReactionChangedRef.current = onChatMessageReactionChanged;
  }, [onChatMessageReactionChanged]);

  useEffect(() => {
    onChatMessageReceivedRef.current = onChatMessageReceived;
  }, [onChatMessageReceived]);

  useEffect(() => {
    onChatTopicReadRef.current = onChatTopicRead;
  }, [onChatTopicRead]);

  useEffect(() => {
    onChatTopicCreatedRef.current = onChatTopicCreated;
  }, [onChatTopicCreated]);

  useEffect(() => {
    onChatTopicUpdatedRef.current = onChatTopicUpdated;
  }, [onChatTopicUpdated]);

  useEffect(() => {
    onChatTopicArchivedRef.current = onChatTopicArchived;
  }, [onChatTopicArchived]);

  useEffect(() => {
    onChatTopicUnarchivedRef.current = onChatTopicUnarchived;
  }, [onChatTopicUnarchived]);

  useEffect(() => {
    onNotificationSettingsUpdatedRef.current = onNotificationSettingsUpdated;
  }, [onNotificationSettingsUpdated]);

  useEffect(() => {
    onAckRef.current = onAck;
  }, [onAck]);

  useEffect(() => {
    onNackRef.current = onNack;
  }, [onNack]);

  useEffect(() => {
    onScreenShareStateRef.current = onScreenShareState;
  }, [onScreenShareState]);

  useEffect(() => {
    onRoomMediaTopologyRef.current = onRoomMediaTopology;
  }, [onRoomMediaTopology]);

  useEffect(() => {
    activeChatRoomSlugRef.current = chatRoomSlug;
  }, [chatRoomSlug]);

  useEffect(() => {
    activeTopicIdRef.current = activeTopicId;
  }, [activeTopicId]);

  useEffect(() => {
    roomSlugRef.current = joinedRoomSlug;
    realtimeClientRef.current?.setRoomSlug(joinedRoomSlug);
  }, [joinedRoomSlug]);

  useEffect(() => {
    if (!token) {
      setWsState("disconnected");
      return;
    }

    const messageController = new WsMessageController({
      clearPendingRequest: (requestId) => realtimeClientRef.current?.clearPendingRequest(requestId),
      markMessageDelivery,
      setMessages,
      pushLog,
      pushCallLog,
      pushToast,
      setRoomSlug: setJoinedRoomSlug,
      onRoomMediaTopology: (...args) => onRoomMediaTopologyRef.current?.(...args),
      setRoomsPresenceBySlug,
      setRoomsPresenceDetailsBySlug,
      trackNack: ({ requestId, eventType, code, message }) => {
        trackClientEvent(
          "ws.nack.received",
          {
            requestId,
            eventType,
            code,
            message
          },
          token
        );
      },
      onCallMicState: (...args) => onCallMicStateRef.current?.(...args),
      onCallVideoState: (...args) => onCallVideoStateRef.current?.(...args),
      onCallInitialState: (...args) => onCallInitialStateRef.current?.(...args),
      onCallNack: (...args) => onCallNackRef.current?.(...args),
      onAudioQualityUpdated: (...args) => onAudioQualityUpdatedRef.current?.(...args),
      onChatCleared: (...args) => onChatClearedRef.current?.(...args),
      onChatTyping: (...args) => onChatTypingRef.current?.(...args),
      onChatMessagePinned: (...args) => onChatMessagePinnedRef.current?.(...args),
      onChatMessageUnpinned: (...args) => onChatMessageUnpinnedRef.current?.(...args),
      onChatMessageReactionChanged: (...args) => onChatMessageReactionChangedRef.current?.(...args),
      onChatMessageReceived: (...args) => onChatMessageReceivedRef.current?.(...args),
      onChatTopicRead: (...args) => onChatTopicReadRef.current?.(...args),
      onChatTopicCreated: (...args) => onChatTopicCreatedRef.current?.(...args),
      onChatTopicUpdated: (...args) => onChatTopicUpdatedRef.current?.(...args),
      onChatTopicArchived: (...args) => onChatTopicArchivedRef.current?.(...args),
      onChatTopicUnarchived: (...args) => onChatTopicUnarchivedRef.current?.(...args),
      onNotificationSettingsUpdated: (...args) => onNotificationSettingsUpdatedRef.current?.(...args),
      onAck: (...args) => onAckRef.current?.(...args),
      onNack: (...args) => onNackRef.current?.(...args),
      onScreenShareState: (...args) => onScreenShareStateRef.current?.(...args),
      onSessionMoved: (...args) => onSessionMoved?.(...args),
      getActiveChatRoomSlug: () => activeChatRoomSlugRef.current,
      getActiveTopicId: () => activeTopicIdRef.current
    });

    const client = new RealtimeClient({
      getTicket: async (authToken) => {
        const response = await api.wsTicket(authToken, currentServerId);
        return response.ticket;
      },
      onWsStateChange: setWsState,
      onLog: (message) => {
        pushLog(message);
        if (message === "ws error") {
          trackClientEvent("ws.error", {}, token);
        }
      },
      onMessage: (message) => messageController.handle(message),
      onConnected: () => {
        trackClientEvent("ws.connected", { roomSlug: roomSlugRef.current }, token);
      },
      onRequestResent: (requestId, eventType) => {
        if (eventType === "chat.send") {
          markMessageDelivery(requestId, "sending");
        }
      },
      onRequestFailed: (requestId, eventType, retries) => {
        if (eventType === "chat.send") {
          markMessageDelivery(requestId, "failed");
          trackClientEvent(
            "chat.request.failed.retries_exhausted",
            { requestId, eventType, retries },
            token
          );
        }
      }
    });

    realtimeClientRef.current = client;
    client.setRoomSlug(roomSlugRef.current);
    client.connect(token);

    return () => {
      client.dispose();
      if (realtimeClientRef.current === client) {
        realtimeClientRef.current = null;
      }
    };
  }, [token, currentServerId, reconnectNonce]);

  useEffect(() => {
    if (!token || !chatRoomSlug) return;
    void chatController.loadRecentMessages(token, chatRoomSlug, activeTopicId);
  }, [token, chatRoomSlug, activeTopicId, chatController]);

  useEffect(() => {
    const chatLogElement = chatLogRef.current;
    if (!chatLogElement) {
      return;
    }

    const updateStickToBottom = () => {
      const distanceToBottom = chatLogElement.scrollHeight - chatLogElement.scrollTop - chatLogElement.clientHeight;
      shouldStickToBottomRef.current = distanceToBottom <= 80;
    };

    updateStickToBottom();
    chatLogElement.addEventListener("scroll", updateStickToBottom, { passive: true });
    return () => {
      chatLogElement.removeEventListener("scroll", updateStickToBottom);
    };
  }, [chatLogRef, chatRoomSlug]);

  useEffect(() => {
    const chatLogElement = chatLogRef.current;
    if (!chatLogElement) {
      return;
    }

    const conversationKey = `${chatRoomSlug}::${String(activeTopicId || "")}`;
    const latestMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
    const roomChanged = lastRoomSlugForScrollRef.current !== chatRoomSlug;
    const conversationChanged = lastConversationKeyForScrollRef.current !== conversationKey;
    const latestMessageChanged = latestMessageId !== lastMessageIdRef.current;

    if (conversationChanged) {
      lastConversationKeyForScrollRef.current = conversationKey;
      lastRoomSlugForScrollRef.current = chatRoomSlug;
      lastMessageIdRef.current = latestMessageId;
      return;
    }

    const shouldAutoScroll = roomChanged || (latestMessageChanged && shouldStickToBottomRef.current);

    if (shouldAutoScroll) {
      chatLogElement.scrollTop = chatLogElement.scrollHeight;
    }

    lastRoomSlugForScrollRef.current = chatRoomSlug;
    lastMessageIdRef.current = latestMessageId;
  }, [messages, chatRoomSlug, activeTopicId]);

  const loadOlderMessages = useCallback(async () => {
    if (!token || !chatRoomSlug || !messagesNextCursor || loadingOlderMessages) {
      return;
    }

    await chatController.loadOlderMessages(token, chatRoomSlug, activeTopicId, messagesNextCursor, loadingOlderMessages);
  }, [token, chatRoomSlug, activeTopicId, messagesNextCursor, loadingOlderMessages, chatController]);

  return {
    loadOlderMessages
  };
}
