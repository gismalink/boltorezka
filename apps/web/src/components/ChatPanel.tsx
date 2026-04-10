// Главный компонент чата: координирует состояния панелей, тем, поиска,
// непрочитанного и рендер секций таймлайна/композера/оверлеев.
import { ClipboardEvent, FormEvent, KeyboardEvent, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { Message, RoomTopic } from "../domain";
import { buildChatMessageViewModels } from "../utils/chatMessageViewModel";
import { CHAT_MEMORY_METRICS_ENABLED, CHAT_MEMORY_METRICS_EVERY } from "../constants/appConfig";
import { CHAT_AGENT_IDS, CHAT_AGENT_STATUS_STYLE } from "../constants/chatAgentSemantics";
import { useChatPanelInboxNotifications } from "./chatPanel/hooks/useChatPanelInboxNotifications";
import { useChatPanelAttachmentImages } from "./chatPanel/hooks/useChatPanelAttachmentImages";
import { useChatPanelReadState } from "./chatPanel/hooks/useChatPanelReadState";
import { useChatPanelTopicLists } from "./chatPanel/hooks/useChatPanelTopicLists";
import { useChatPanelTopicActions } from "./chatPanel/hooks/useChatPanelTopicActions";
import { useChatTopLazyLoad } from "./chatPanel/hooks/useChatTopLazyLoad";
import { useChatPanelSearch } from "./chatPanel/hooks/useChatPanelSearch";
import { useMessageContextMenu } from "./chatPanel/hooks/useMessageContextMenu";
import { useChatPanelUiInteractions } from "./chatPanel/hooks/useChatPanelUiInteractions";
import { useChatPanelComposerHelpers } from "./chatPanel/hooks/useChatPanelComposerHelpers";
import { useChatPanelTopicCreate } from "./chatPanel/hooks/useChatPanelTopicCreate";
import { useChatPanelTypingBanner } from "./chatPanel/hooks/useChatPanelTypingBanner";
import { useChatPanelSearchOverlay } from "./chatPanel/hooks/useChatPanelSearchOverlay";
import { TopicTabsHeader } from "./chatPanel/sections/TopicTabsHeader";
import { SearchPanel } from "./chatPanel/sections/SearchPanel";
import { ChatMessageTimeline } from "./chatPanel/sections/ChatMessageTimeline";
import { ChatComposerSection } from "./chatPanel/sections/ChatComposerSection";
import { ChatPanelOverlays } from "./chatPanel/sections/ChatPanelOverlays";
import { Button } from "./uicomponents";

type MentionCandidate = {
  key: string;
  kind: "user" | "tag" | "all";
  handle: string;
  label: string;
  userId?: string;
  userIds?: string[];
  subtitle?: string | null;
};

type TopicUnreadMentionNavItem = {
  eventId: string;
  messageId: string;
};

const UNREAD_WINDOW_EXPAND_STEP = 50;
const UNREAD_WINDOW_EXPAND_MAX = 500;

function toMentionHandle(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}._-]/gu, "")
    .replace(/_{2,}/g, "_")
    .replace(/^[_\.\-]+|[_\.\-]+$/g, "")
    .slice(0, 32);
}

type ChatPanelProps = {
  t: (key: string) => string;
  locale: string;
  currentServerId: string;
  roomSlug: string;
  roomId: string;
  roomTitle: string;
  topics: RoomTopic[];
  activeTopicId: string | null;
  authToken: string;
  sendWsEventAwaitAck?: (
    eventType: string,
    payload: Record<string, unknown>,
    options?: { withIdempotency?: boolean; maxRetries?: number }
  ) => Promise<void>;
  messages: Message[];
  currentUserId: string | null;
  messagesHasMore: boolean;
  loadingOlderMessages: boolean;
  chatText: string;
  composePreviewImageUrl: string | null;
  composePendingAttachmentName: string | null;
  typingUsers: string[];
  chatLogRef: RefObject<HTMLDivElement>;
  onLoadOlderMessages: () => void;
  onLoadMessagesAroundAnchor: (
    topicId: string,
    anchorMessageId: string,
    options?: {
      aroundWindowBefore?: number;
      aroundWindowAfter?: number;
    }
  ) => Promise<boolean>;
  onSetChatText: (value: string) => void;
  onOpenRoomChat: (slug: string) => void;
  onSelectTopic: (topicId: string) => void;
  onCreateTopic: (title: string) => Promise<void>;
  onChatPaste: (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onChatInputKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSendMessage: (event: FormEvent) => void;
  onSelectAttachmentFile: (file: File | null) => void;
  onClearPendingAttachment: () => void;
  editingMessageId: string | null;
  replyingToMessage: { id: string; userName: string; text: string } | null;
  showVideoToggle: boolean;
  videoWindowsVisible: boolean;
  onToggleVideoWindows: () => void;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  onEditMessage: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReportMessage: (messageId: string) => void;
  onReplyMessage: (messageId: string) => void;
  pinnedByMessageId: Record<string, boolean>;
  reactionsByMessageId: Record<string, Record<string, { count: number; reacted: boolean }>>;
  onTogglePinMessage: (messageId: string) => void;
  onToggleMessageReaction: (messageId: string, emoji: string) => void;
  onUpdateTopic: (topicId: string, title: string) => Promise<void>;
  onArchiveTopic: (topicId: string) => Promise<void>;
  onUnarchiveTopic: (topicId: string) => Promise<void>;
  onDeleteTopic: (topicId: string) => Promise<void>;
  onConsumeTopicMentionUnread: (topicId: string) => void;
  onSetTopicMentionUnreadLocal: (topicId: string, count: number) => void;
  onApplyTopicReadLocal: (topicId: string) => void;
  canManageTopicModeration: boolean;
  mentionCandidates: MentionCandidate[];
};

export function ChatPanel({
  t,
  locale,
  currentServerId,
  roomSlug, roomId, roomTitle,
  topics,  activeTopicId,
  authToken,
  sendWsEventAwaitAck,
  messages,
  currentUserId,
  messagesHasMore,
  loadingOlderMessages,
  chatText,
  composePreviewImageUrl,
  composePendingAttachmentName,
  typingUsers,
  chatLogRef,
  onLoadOlderMessages,
  onLoadMessagesAroundAnchor,
  onSetChatText,
  onOpenRoomChat,
  onSelectTopic,
  onCreateTopic,
  onChatPaste,
  onChatInputKeyDown,
  onSendMessage,
  onSelectAttachmentFile,
  onClearPendingAttachment,
  editingMessageId,
  replyingToMessage,
  onCancelEdit,
  onCancelReply,
  onEditMessage,
  onDeleteMessage,
  onReportMessage,
  onReplyMessage,
  pinnedByMessageId,
  reactionsByMessageId,
  onTogglePinMessage,
  onToggleMessageReaction,
  onUpdateTopic,
  onArchiveTopic,
  onUnarchiveTopic,
  onDeleteTopic,
  onConsumeTopicMentionUnread,
  onSetTopicMentionUnreadLocal,
  onApplyTopicReadLocal,
  canManageTopicModeration,
  mentionCandidates
}: ChatPanelProps) {
  const [topicFilterMode] = useState<"all" | "active" | "unread" | "my" | "mentions" | "pinned" | "archived">("all");
  const [topicPaletteOpen, setTopicPaletteOpen] = useState(false);
  const [topicPaletteQuery, setTopicPaletteQuery] = useState("");
  const [topicPaletteSelectedIndex, setTopicPaletteSelectedIndex] = useState(0);
  const [notificationMode, setNotificationMode] = useState<"all" | "mentions" | "none">("all");
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [quotedMessage, setQuotedMessage] = useState<{ userName: string; text: string } | null>(null);
  const [hotkeyStatusText, setHotkeyStatusText] = useState("");
  const [topicMentionsActionLoading, setTopicMentionsActionLoading] = useState(false);
  const [showScrollToBottomButton, setShowScrollToBottomButton] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const topicUnreadMentionQueueRef = useRef<TopicUnreadMentionNavItem[]>([]);
  const topicUnreadMentionCursorRef = useRef<{ beforeCreatedAt: string; beforeId: string } | null>(null);
  const topicUnreadMentionHasMoreRef = useRef(true);
  const topicUnreadMentionTopicIdRef = useRef("");
  const unreadWindowExpandInFlightRef = useRef(false);
  const unreadWindowRequestedAfterByTopicRef = useRef<Record<string, number>>({});
  const messageVmBuildMsRef = useRef(0);
  const metricsSamplesRef = useRef(0);
  const hasActiveRoom = Boolean(roomSlug);
  const mainTopicId = useMemo(() => {
    if (topics.length === 0) {
      return null;
    }

    const sortedByMainPriority = [...topics].sort((a, b) => {
      const positionDiff = Number(a.position || 0) - Number(b.position || 0);
      if (positionDiff !== 0) {
        return positionDiff;
      }

      const createdAtDiff = Number(new Date(a.createdAt)) - Number(new Date(b.createdAt));
      if (createdAtDiff !== 0) {
        return createdAtDiff;
      }

      return String(a.id || "").localeCompare(String(b.id || ""));
    });

    return String(sortedByMainPriority[0]?.id || "").trim() || null;
  }, [topics]);

  const effectiveMainTopicTitle = useMemo(
    () => String(roomTitle || roomSlug || t("chat.noChannel")).trim() || t("chat.noChannel"),
    [roomSlug, roomTitle, t]
  );

  const topicsForUi = useMemo(() => {
    if (!mainTopicId) {
      return topics;
    }

    return topics.map((topic) => {
      if (String(topic.id || "").trim() !== mainTopicId) {
        return topic;
      }
      return {
        ...topic,
        title: effectiveMainTopicTitle
      };
    });
  }, [effectiveMainTopicTitle, mainTopicId, topics]);

  const isMainTopic = useCallback((topicId: string) => {
    const normalizedTopicId = String(topicId || "").trim();
    return Boolean(mainTopicId && normalizedTopicId && normalizedTopicId === mainTopicId);
  }, [mainTopicId]);

  const {
    topicCreatePopupRef,
    newTopicTitle,
    setNewTopicTitle,
    topicCreateOpen,
    setTopicCreateOpen,
    creatingTopic,
    handleCreateTopicSubmit
  } = useChatPanelTopicCreate({
    onCreateTopic
  });

  const {
    messageContextMenu,
    setMessageContextMenu
  } = useMessageContextMenu();

  const {
    searching,
    searchQuery,
    setSearchQuery,
    searchScope,
    setSearchScope,
    handleSearchMessages,
    searchHasMention,
    setSearchHasMention,
    searchHasAttachment,
    setSearchHasAttachment,
    searchAttachmentType,
    setSearchAttachmentType,
    searchHasLink,
    setSearchHasLink,
    searchAuthorId,
    setSearchAuthorId,
    searchFrom,
    setSearchFrom,
    searchTo,
    setSearchTo,
    searchJumpStatusText,
    setSearchJumpStatusText,
    searchError,
    searchResults,
    searchResultsHasMore,
    setSearchJumpTarget
  } = useChatPanelSearch({
    t,
    authToken,
    currentServerId,
    roomId,
    roomSlug,
    activeTopicId,
    topics: topicsForUi,
    loadingOlderMessages,
    messagesHasMore,
    onOpenRoomChat,
    onSelectTopic,
    onLoadOlderMessages,
    onLoadMessagesAroundAnchor
  });

  useChatPanelInboxNotifications({
    authToken,
    roomSlug,
    activeTopicId,
    onJumpToMessage: (payload) => setSearchJumpTarget(payload),
    onResetJumpStatus: () => setSearchJumpStatusText("")
  });

  const {
    getTopicUnreadCount,
    markReadSaving,
    markReadStatusText,
    markTopicRead,
    markRoomRead,
    markTopicUnreadFromMessage,
    entryUnreadDivider
  } = useChatPanelReadState({
    t,
    authToken,
    sendWsEventAwaitAck,
    currentUserId,
    activeTopicId,
    roomId,
    topics: topicsForUi,
    onApplyTopicReadLocal,
    messages,
    messagesHasMore,
    chatLogRef
  });

  const {
    topicContextMenu,
    editingTopicTitle,
    setEditingTopicTitle,
    editingTopicTitleDraftInitial,
    setEditingTopicTitleDraftInitial,
    isEditingTopicTitleInline,
    setIsEditingTopicTitleInline,
    editingTopicSaving,
    archivingTopicId,
    notificationSaving,
    topicMutePresetById,
    topicDeleteConfirm,
    setTopicDeleteConfirm,
    openTopicContextMenu,
    runTopicMenuAction,
    applyTopicRename,
    confirmDeleteTopic,
    setTopicMutePreset
  } = useChatPanelTopicActions({
    t,
    authToken,
    topics: topicsForUi,
    isTopicProtected: isMainTopic,
    canManageTopicModeration,
    notificationMode,
    markTopicRead,
    onUpdateTopic,
    onArchiveTopic,
    onUnarchiveTopic,
    onDeleteTopic
  });

  const { resolveAttachmentImageUrl } = useChatPanelAttachmentImages({
    messages,
    authToken
  });

  const {
    sortedTopics,
    filteredTopicsForPalette
  } = useChatPanelTopicLists({
    topics: topicsForUi,
    activeTopicId,
    topicFilterMode,
    currentUserId,
    getTopicUnreadCount,
    topicPaletteQuery
  });

  useChatTopLazyLoad({
    chatLogRef,
    hasActiveRoom,
    messageCount: messages.length,
    loadingOlderMessages,
    messagesHasMore,
    onLoadOlderMessages
  });

  const activeTopic = useMemo(() => topicsForUi.find((topic) => topic.id === activeTopicId) ?? null, [topicsForUi, activeTopicId]);
  const activeTopicMentionUnreadCount = Math.max(0, Number(activeTopic?.mentionUnreadCount || 0));
  const activeTopicIsArchived = Boolean(activeTopic?.archivedAt);
  const unreadDividerVisible = useMemo(() => {
    const dividerMessageId = String(entryUnreadDivider?.messageId || "").trim();
    const dividerTopicId = String(entryUnreadDivider?.topicId || "").trim();
    const normalizedActiveTopicId = String(activeTopicId || "").trim();

    return Boolean(dividerMessageId && dividerTopicId && normalizedActiveTopicId && dividerTopicId === normalizedActiveTopicId);
  }, [activeTopicId, entryUnreadDivider?.messageId, entryUnreadDivider?.topicId]);

  const messageViewModels = useMemo(() => {
    const startedAt = typeof performance !== "undefined" ? performance.now() : 0;
    const built = buildChatMessageViewModels(messages, currentUserId, 10 * 60 * 1000);
    const finishedAt = typeof performance !== "undefined" ? performance.now() : startedAt;
    messageVmBuildMsRef.current = Math.max(0, finishedAt - startedAt);
    return built;
  }, [messages, currentUserId]);

  const unreadDividerMessageId = useMemo(() => {
    if (!unreadDividerVisible) {
      return "";
    }

    return String(entryUnreadDivider?.messageId || "").trim();
  }, [entryUnreadDivider?.messageId, unreadDividerVisible]);

  const loadedUnreadAfterDivider = useMemo(() => {
    if (!unreadDividerMessageId) {
      return 0;
    }

    const dividerIndex = messages.findIndex((message) => String(message.id || "").trim() === unreadDividerMessageId);
    if (dividerIndex < 0) {
      return 0;
    }

    return Math.max(0, messages.length - dividerIndex - 1);
  }, [messages, unreadDividerMessageId]);

  const resolvedMentionCandidates = useMemo(() => {
    const byKey = new Map<string, MentionCandidate>();

    (Array.isArray(mentionCandidates) ? mentionCandidates : []).forEach((candidate) => {
      const key = String(candidate.key || "").trim();
      const handle = String(candidate.handle || "").trim().toLowerCase();
      const label = String(candidate.label || "").trim();
      if (!key || !handle || !label) {
        return;
      }

      byKey.set(key, {
        ...candidate,
        key,
        handle,
        label,
        subtitle: String(candidate.subtitle || "").trim() || null
      });
    });

    messages.forEach((message) => {
      const userId = String(message.user_id || "").trim();
      const label = String(message.user_name || "").trim();
      const handle = toMentionHandle(label);
      const key = `user:${userId}`;
      if (!userId || !label || !handle || byKey.has(key)) {
        return;
      }

      byKey.set(key, {
        key,
        kind: "user",
        handle,
        label,
        userId
      });
    });

    return Array.from(byKey.values());
  }, [mentionCandidates, messages]);

  const pinnedMessagesCount = useMemo(
    () => Object.keys(pinnedByMessageId || {}).length,
    [pinnedByMessageId]
  );
  const reactionMessageBucketsCount = useMemo(
    () => Object.keys(reactionsByMessageId || {}).length,
    [reactionsByMessageId]
  );

  useEffect(() => {
    if (!CHAT_MEMORY_METRICS_ENABLED) {
      return;
    }

    metricsSamplesRef.current += 1;
    if (metricsSamplesRef.current % CHAT_MEMORY_METRICS_EVERY !== 0) {
      return;
    }

    const perfWithMemory = performance as Performance & {
      memory?: {
        usedJSHeapSize?: number;
        totalJSHeapSize?: number;
      };
    };

    const usedHeapBytes = Number(perfWithMemory.memory?.usedJSHeapSize || 0);
    const totalHeapBytes = Number(perfWithMemory.memory?.totalJSHeapSize || 0);
    const usedHeapMb = usedHeapBytes > 0 ? (usedHeapBytes / (1024 * 1024)).toFixed(1) : "n/a";
    const totalHeapMb = totalHeapBytes > 0 ? (totalHeapBytes / (1024 * 1024)).toFixed(1) : "n/a";

    console.info(
      `[chat-metrics] room=${roomSlug || "-"} topic=${activeTopicId || "-"} msgs=${messages.length} vms=${messageViewModels.length} pinned=${pinnedMessagesCount} reactedBuckets=${reactionMessageBucketsCount} vmBuildMs=${messageVmBuildMsRef.current.toFixed(2)} heapMB=${usedHeapMb}/${totalHeapMb}`
    );
  }, [
    activeTopicId,
    messageViewModels.length,
    messages.length,
    pinnedMessagesCount,
    reactionMessageBucketsCount,
    roomSlug
  ]);

  const composePreviewImage = composePreviewImageUrl;
  const hasTopics = topics.length > 0;
  const {
    hasTypingUsers,
    typingLabel
  } = useChatPanelTypingBanner({
    t,
    typingUsers
  });

  const {
    formatMessageTime,
    formatAttachmentSize,
    insertMentionToComposer,
    insertQuoteToComposer
  } = useChatPanelComposerHelpers({
    locale,
    chatText,
    onSetChatText
  });

  const handleInsertQuoteToComposer = useCallback((userName: string, _messageText: string, selectedText: string) => {
    const normalizedQuote = String(selectedText || "").replace(/\s+/g, " ").trim();
    if (!normalizedQuote) {
      return;
    }

    if (editingMessageId) {
      onCancelEdit();
    }
    if (replyingToMessage) {
      onCancelReply();
    }

    setQuotedMessage({
      userName: String(userName || "").trim() || "Unknown",
      text: normalizedQuote
    });
    insertQuoteToComposer(userName, normalizedQuote);
  }, [editingMessageId, insertQuoteToComposer, onCancelEdit, onCancelReply, replyingToMessage]);

  const cancelQuote = useCallback(() => {
    setQuotedMessage(null);
  }, []);

  useEffect(() => {
    if (!quotedMessage) {
      return;
    }

    if (!chatText.trim()) {
      setQuotedMessage(null);
    }
  }, [chatText, quotedMessage]);

  const {
    topicPaletteInputRef,
    openTopicPalette,
    closeTopicPalette,
    selectTopicFromPalette,
    handleTopicPaletteKeyDown
  } = useChatPanelUiInteractions({
    t,
    hasActiveRoom,
    hasTopics,
    roomSlug,
    activeTopicId,
    topics: topicsForUi,
    filteredTopicsForPalette,
    topicPaletteOpen,
    setTopicPaletteOpen,
    topicPaletteQuery,
    setTopicPaletteQuery,
    topicPaletteSelectedIndex,
    setTopicPaletteSelectedIndex,
    setHotkeyStatusText,
    previewImageUrl,
    setPreviewImageUrl,
    messageViewModels,
    onSelectTopic,
    onReplyMessage,
    onEditMessage,
    markRoomRead
  });

  const topicPaletteListboxId = "chat-topic-palette-listbox";
  const {
    searchPanelOpen,
    closeSearchPanel,
    toggleSearchPanel
  } = useChatPanelSearchOverlay({ hasActiveRoom });

  const chatScreenContext = useMemo(() => {
    const activeTopic = topicsForUi.find((topic) => topic.id === activeTopicId) || null;
    const roomValue = hasActiveRoom ? String(roomSlug || "unknown") : "none";
    const topicValue = activeTopic ? `${activeTopic.id}:${activeTopic.title}` : "none";
    const searchValue = searchPanelOpen ? "open" : "closed";
    const archiveValue = activeTopicIsArchived ? "archived" : "active";
    const topicsValue = hasTopics ? "present" : "empty";
    return `room=${roomValue};topic=${topicValue};topicState=${archiveValue};topics=${topicsValue};search=${searchValue}`;
  }, [activeTopicId, activeTopicIsArchived, hasActiveRoom, hasTopics, roomSlug, searchPanelOpen, topicsForUi]);

  useEffect(() => {
    const topicId = String(activeTopicId || "").trim();
    topicUnreadMentionTopicIdRef.current = topicId;
    topicUnreadMentionQueueRef.current = [];
    topicUnreadMentionCursorRef.current = null;
    topicUnreadMentionHasMoreRef.current = Boolean(topicId);
  }, [activeTopicId]);

  useEffect(() => {
    const topicId = String(activeTopicId || "").trim();
    if (!topicId) {
      return;
    }

    const currentRequested = Math.max(0, Number(unreadWindowRequestedAfterByTopicRef.current[topicId] || 0));
    unreadWindowRequestedAfterByTopicRef.current[topicId] = Math.max(currentRequested, loadedUnreadAfterDivider);
    unreadWindowExpandInFlightRef.current = false;
  }, [activeTopicId, loadedUnreadAfterDivider]);

  const maybeExpandUnreadWindowAtBottom = useCallback(() => {
    const topicId = String(activeTopicId || "").trim();
    if (!topicId || !hasActiveRoom || !unreadDividerVisible || loadingOlderMessages || unreadWindowExpandInFlightRef.current) {
      return;
    }

    const dividerMessageId = unreadDividerMessageId;
    if (!dividerMessageId) {
      return;
    }

    const chatLogNode = chatLogRef.current;
    if (!chatLogNode) {
      return;
    }

    const distanceToBottom = chatLogNode.scrollHeight - chatLogNode.scrollTop - chatLogNode.clientHeight;
    if (distanceToBottom > 32) {
      return;
    }

    const requestedAfter = Math.max(
      loadedUnreadAfterDivider,
      Math.max(0, Number(unreadWindowRequestedAfterByTopicRef.current[topicId] || 0))
    );
    const nextRequestedAfter = Math.min(
      UNREAD_WINDOW_EXPAND_MAX,
      Math.max(requestedAfter + UNREAD_WINDOW_EXPAND_STEP, loadedUnreadAfterDivider + UNREAD_WINDOW_EXPAND_STEP)
    );

    if (nextRequestedAfter <= requestedAfter) {
      return;
    }

    unreadWindowExpandInFlightRef.current = true;
    void onLoadMessagesAroundAnchor(topicId, dividerMessageId, {
      aroundWindowBefore: 25,
      aroundWindowAfter: nextRequestedAfter
    }).then((ok) => {
      if (ok) {
        unreadWindowRequestedAfterByTopicRef.current[topicId] = nextRequestedAfter;
      }
    }).finally(() => {
      unreadWindowExpandInFlightRef.current = false;
    });
  }, [activeTopicId, chatLogRef, hasActiveRoom, loadedUnreadAfterDivider, loadingOlderMessages, onLoadMessagesAroundAnchor, unreadDividerMessageId, unreadDividerVisible]);

  useEffect(() => {
    const chatLogNode = chatLogRef.current;
    if (!chatLogNode || !hasActiveRoom) {
      return;
    }

    const onScroll = () => {
      maybeExpandUnreadWindowAtBottom();
    };

    chatLogNode.addEventListener("scroll", onScroll, { passive: true });
    maybeExpandUnreadWindowAtBottom();

    return () => {
      chatLogNode.removeEventListener("scroll", onScroll);
    };
  }, [chatLogRef, hasActiveRoom, maybeExpandUnreadWindowAtBottom]);

  useEffect(() => {
    maybeExpandUnreadWindowAtBottom();
  }, [loadedUnreadAfterDivider, maybeExpandUnreadWindowAtBottom]);

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
  }, [activeTopicId, authToken, loadTopicUnreadMentionsPage, onConsumeTopicMentionUnread, reconcileTopicMentionUnreadCount, roomSlug, setSearchJumpStatusText, setSearchJumpTarget, t, topicMentionsActionLoading]);

  const scrollTimelineToBottom = useCallback(() => {
    const chatLogNode = chatLogRef.current;
    if (!chatLogNode) {
      return;
    }

    chatLogNode.scrollTo({
      top: chatLogNode.scrollHeight,
      behavior: "smooth"
    });
  }, [chatLogRef]);

  useEffect(() => {
    const chatLogNode = chatLogRef.current;
    if (!chatLogNode || !hasActiveRoom) {
      setShowScrollToBottomButton(false);
      return;
    }

    const updateScrollToBottomVisibility = () => {
      const maxScrollTop = Math.max(0, chatLogNode.scrollHeight - chatLogNode.clientHeight);
      const hasScrollableContent = maxScrollTop > 1;
      const distanceToBottom = maxScrollTop - chatLogNode.scrollTop;
      const isAtBottom = distanceToBottom <= 12;

      setShowScrollToBottomButton(hasScrollableContent && !isAtBottom);
    };

    chatLogNode.addEventListener("scroll", updateScrollToBottomVisibility, { passive: true });

    const rafId = window.requestAnimationFrame(updateScrollToBottomVisibility);

    return () => {
      chatLogNode.removeEventListener("scroll", updateScrollToBottomVisibility);
      window.cancelAnimationFrame(rafId);
    };
  }, [chatLogRef, hasActiveRoom, messages.length, loadingOlderMessages]);

  return (
    <section
      className="card middle-card relative flex min-h-0 flex-1 flex-col overflow-hidden"
      data-agent-id={CHAT_AGENT_IDS.panel}
      data-agent-screen-context={chatScreenContext}
    >
      <div className="chat-header-stack">
        <TopicTabsHeader
          t={t}
          hasActiveRoom={hasActiveRoom}
          roomTitle={roomTitle}
          roomSlug={roomSlug}
          hasTopics={hasTopics}
          topicCreatePopupRef={topicCreatePopupRef}
          topicCreateOpen={topicCreateOpen}
          setTopicCreateOpen={setTopicCreateOpen}
          newTopicTitle={newTopicTitle}
          setNewTopicTitle={setNewTopicTitle}
          creatingTopic={creatingTopic}
          handleCreateTopicSubmit={handleCreateTopicSubmit}
          sortedTopics={sortedTopics}
          getTopicUnreadCount={getTopicUnreadCount}
          activeTopicId={activeTopicId}
          onSelectTopic={onSelectTopic}
          openTopicContextMenu={openTopicContextMenu}
          openTopicPalette={openTopicPalette}
          topicPaletteOpen={topicPaletteOpen}
          searchPanelOpen={searchPanelOpen}
          onToggleSearchPanel={toggleSearchPanel}
        />
        {hasActiveRoom && searchPanelOpen ? (
          <SearchPanel
            t={t}
            searching={searching}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchScope={searchScope}
            setSearchScope={setSearchScope}
            handleSearchMessages={handleSearchMessages}
            searchHasMention={searchHasMention}
            setSearchHasMention={setSearchHasMention}
            searchHasAttachment={searchHasAttachment}
            setSearchHasAttachment={setSearchHasAttachment}
            searchAttachmentType={searchAttachmentType}
            setSearchAttachmentType={setSearchAttachmentType}
            searchHasLink={searchHasLink}
            setSearchHasLink={setSearchHasLink}
            searchAuthorId={searchAuthorId}
            setSearchAuthorId={setSearchAuthorId}
            searchFrom={searchFrom}
            setSearchFrom={setSearchFrom}
            searchTo={searchTo}
            setSearchTo={setSearchTo}
            searchJumpStatusText={searchJumpStatusText}
            searchError={searchError}
            searchResults={searchResults}
            searchResultsHasMore={searchResultsHasMore}
            formatMessageTime={formatMessageTime}
            setSearchJumpStatusText={setSearchJumpStatusText}
            setSearchJumpTarget={(value) => setSearchJumpTarget(value)}
            onClose={closeSearchPanel}
          />
        ) : null}
      </div>
      {hasActiveRoom && hotkeyStatusText ? (
        <div className="chat-hotkeys-hint muted" aria-live="polite">
          {hotkeyStatusText}
        </div>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {!hasActiveRoom ? (
          <span className="muted">{t("chat.noChannelHint")}</span>
        ) : null}
      </div>
      <div
        className="chat-topic-read-status mb-2"
        role="status"
        aria-live="polite"
        data-agent-id={CHAT_AGENT_IDS.screenContextStatus}
        style={CHAT_AGENT_STATUS_STYLE}
      >
        {chatScreenContext}
      </div>
      <div className="chat-typing-banner" aria-live="polite">
        {hasActiveRoom && hasTypingUsers ? (
          <span className="chat-typing-status">
            <span>{typingLabel}</span>
            <span className="chat-typing-dots" aria-hidden="true">
              <span className="chat-typing-dot">.</span>
              <span className="chat-typing-dot">.</span>
              <span className="chat-typing-dot">.</span>
            </span>
          </span>
        ) : null}
      </div>
      <div className="chat-log-shell">
        <ChatMessageTimeline
          t={t}
          locale={locale}
          hasActiveRoom={hasActiveRoom}
          hasTopics={hasTopics}
          activeTopicId={activeTopicId}
          chatStartCreatedAt={activeTopic?.createdAt ?? null}
          messagesHasMore={messagesHasMore}
          loadingOlderMessages={loadingOlderMessages}
          onLoadOlderMessages={onLoadOlderMessages}
          chatLogRef={chatLogRef}
          messageViewModels={messageViewModels}
          pinnedByMessageId={pinnedByMessageId}
          reactionsByMessageId={reactionsByMessageId}
          messageContextMenu={messageContextMenu}
          setMessageContextMenu={setMessageContextMenu}
          onReplyMessage={onReplyMessage}
          onEditMessage={onEditMessage}
          onDeleteMessage={onDeleteMessage}
          onReportMessage={onReportMessage}
          onTogglePinMessage={onTogglePinMessage}
          onToggleMessageReaction={onToggleMessageReaction}
          insertMentionToComposer={insertMentionToComposer}
          mentionCandidates={resolvedMentionCandidates}
          insertQuoteToComposer={handleInsertQuoteToComposer}
          markTopicUnreadFromMessage={markTopicUnreadFromMessage}
          markReadSaving={markReadSaving}
          formatMessageTime={formatMessageTime}
          resolveAttachmentImageUrl={resolveAttachmentImageUrl}
          formatAttachmentSize={formatAttachmentSize}
          setPreviewImageUrl={setPreviewImageUrl}
          unreadDividerMessageId={unreadDividerMessageId || null}
          unreadDividerVisible={unreadDividerVisible}
        />
        {hasActiveRoom ? (
          <div className="chat-floating-actions" aria-live="polite">
            {activeTopicMentionUnreadCount > 0 ? (
              <Button
                type="button"
                className="secondary tiny chat-floating-action-btn chat-floating-mention-btn"
                onClick={() => void jumpToNextTopicUnreadMention()}
                onContextMenu={(event) => event.preventDefault()}
                disabled={topicMentionsActionLoading}
                data-tooltip={t("chat.topicMentionsJumpTooltip")}
                aria-label={t("chat.topicMentionsJumpTooltip")}
              >
                <span aria-hidden="true">@</span>
                <span>{activeTopicMentionUnreadCount}</span>
              </Button>
            ) : null}
            {showScrollToBottomButton ? (
              <Button
                type="button"
                className="secondary tiny icon-btn chat-floating-action-btn"
                onClick={scrollTimelineToBottom}
                onContextMenu={(event) => event.preventDefault()}
                data-tooltip={t("rooms.down")}
                aria-label={t("rooms.down")}
              >
                <i className="bi bi-arrow-down" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <ChatComposerSection
        t={t}
        hasActiveRoom={hasActiveRoom}
        activeTopicIsArchived={activeTopicIsArchived}
        editingMessageId={editingMessageId}
        replyingToMessage={replyingToMessage}
        quotedMessage={quotedMessage}
        onCancelEdit={onCancelEdit}
        onCancelReply={onCancelReply}
        onCancelQuote={cancelQuote}
        onSendMessage={onSendMessage}
        onSelectAttachmentFile={onSelectAttachmentFile}
        onClearPendingAttachment={onClearPendingAttachment}
        onSetChatText={onSetChatText}
        onChatPaste={onChatPaste}
        onChatInputKeyDown={onChatInputKeyDown}
        chatText={chatText}
        mentionCandidates={resolvedMentionCandidates}
        composePreviewImage={composePreviewImage}
        composePendingAttachmentName={composePendingAttachmentName}
        setPreviewImageUrl={setPreviewImageUrl}
        attachmentInputRef={attachmentInputRef}
        screenContext={chatScreenContext}
      />
      <ChatPanelOverlays
        t={t}
        previewImageUrl={previewImageUrl}
        setPreviewImageUrl={setPreviewImageUrl}
        resolveAttachmentImageUrl={resolveAttachmentImageUrl}
        topicPaletteOpen={topicPaletteOpen}
        closeTopicPalette={closeTopicPalette}
        topicPaletteQuery={topicPaletteQuery}
        setTopicPaletteQuery={setTopicPaletteQuery}
        handleTopicPaletteKeyDown={handleTopicPaletteKeyDown}
        topicPaletteInputRef={topicPaletteInputRef}
        topicPaletteListboxId={topicPaletteListboxId}
        filteredTopicsForPalette={filteredTopicsForPalette}
        topicPaletteSelectedIndex={topicPaletteSelectedIndex}
        activeTopicId={activeTopicId}
        getTopicUnreadCount={getTopicUnreadCount}
        setTopicPaletteSelectedIndex={setTopicPaletteSelectedIndex}
        selectTopicFromPalette={selectTopicFromPalette}
        topicContextMenu={topicContextMenu}
        topics={topicsForUi}
        isTopicProtected={isMainTopic}
        canManageTopicModeration={canManageTopicModeration}
        editingTopicSaving={editingTopicSaving}
        archivingTopicId={archivingTopicId}
        notificationSaving={notificationSaving}
        editingTopicTitle={editingTopicTitle}
        setEditingTopicTitle={setEditingTopicTitle}
        isEditingTopicTitleInline={isEditingTopicTitleInline}
        onStartTopicRenameInline={() => {
          setEditingTopicTitleDraftInitial(editingTopicTitle);
          setIsEditingTopicTitleInline(true);
        }}
        onCancelTopicRenameInline={() => {
          setEditingTopicTitle(editingTopicTitleDraftInitial);
          setIsEditingTopicTitleInline(false);
        }}
        applyTopicRename={applyTopicRename}
        runTopicMenuAction={runTopicMenuAction}
        topicMutePresetById={topicMutePresetById}
        setTopicMutePreset={setTopicMutePreset}
        topicDeleteConfirm={topicDeleteConfirm}
        setTopicDeleteConfirm={setTopicDeleteConfirm}
        confirmDeleteTopic={confirmDeleteTopic}
      />
    </section>
  );
}
