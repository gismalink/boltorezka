/**
 * ChatPanel.tsx — главный компонент чата.
 *
 * Назначение:
 * - Координирует состояния панелей (правая/левая колонки), темы, поиска и непрочитанного.
 * - Рендерит таймлайн сообщений, композер и оверлеи (drag’н’drop, mention picker, attachments).
 * - Объединяет логику хуков (`useChat*`) в единый вью без сетевых вызовов внутри.
 */
// Главный компонент чата: координирует состояния панелей, тем, поиска,
// непрочитанного и рендер секций таймлайна/композера/оверлеев.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useChatPanelMentionNavigation } from "./chatPanel/hooks/useChatPanelMentionNavigation";
import { useChatPanelUnreadWindowExpand } from "./chatPanel/hooks/useChatPanelUnreadWindowExpand";
import { useChatPanelScrollToBottom } from "./chatPanel/hooks/useChatPanelScrollToBottom";
import { ChatPanelProvider, ChatMessageActionsProvider } from "./chatPanel/ChatPanelContext";
import { TopicActionsProvider } from "./chatPanel/TopicActionsContext";
import type { ChatPanelProps, MentionCandidate } from "./chatPanel/chatPanelTypes";
import { toMentionHandle } from "./chatPanel/chatPanelTypes";
import { TopicTabsHeader } from "./chatPanel/sections/TopicTabsHeader";
import { SearchPanel } from "./chatPanel/sections/SearchPanel";
import { ChatMessageTimeline } from "./chatPanel/sections/ChatMessageTimeline";
import { ChatComposerSection } from "./chatPanel/sections/ChatComposerSection";
import { ChatPanelOverlays } from "./chatPanel/sections/ChatPanelOverlays";
import { ChatFloatingActions } from "./chatPanel/sections/ChatFloatingActions";
import { useDmOptional } from "./dm/DmContext";
import { setActiveTopicSoundMuted } from "../hooks/realtime/activeTopicSoundMute";
import { asTrimmedString } from "../utils/stringUtils";

export type { ChatPanelProps };
export { toMentionHandle };
export type { MentionCandidate } from "./chatPanel/chatPanelTypes";

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
  composePendingAttachments,
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
  onSelectAttachmentFiles,
  onRemovePendingAttachmentAt,
  onRetryPendingAttachmentAt,
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
  mentionCandidates,
  headerSlot
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
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const messageVmBuildMsRef = useRef(0);
  const metricsSamplesRef = useRef(0);
  const hasActiveRoom = Boolean(roomSlug);
  const isDm = roomSlug === "dm";
  const dmCtx = useDmOptional();
  const hasTopics = topics.length > 0 || isDm;
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

    return asTrimmedString(sortedByMainPriority[0]?.id) || null;
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
      if (asTrimmedString(topic.id) !== mainTopicId) {
        return topic;
      }
      return {
        ...topic,
        title: effectiveMainTopicTitle
      };
    });
  }, [effectiveMainTopicTitle, mainTopicId, topics]);

  const isMainTopic = useCallback((topicId: string) => {
    const normalizedTopicId = asTrimmedString(topicId);
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

  const topicActionsCtxValue = useMemo(() => ({
    topicContextMenu, editingTopicTitle, setEditingTopicTitle,
    editingTopicTitleDraftInitial, setEditingTopicTitleDraftInitial,
    isEditingTopicTitleInline, setIsEditingTopicTitleInline,
    editingTopicSaving, archivingTopicId, notificationSaving,
    topicMutePresetById, topicDeleteConfirm, setTopicDeleteConfirm,
    openTopicContextMenu, runTopicMenuAction, applyTopicRename,
    confirmDeleteTopic, setTopicMutePreset
  }), [
    topicContextMenu, editingTopicTitle, setEditingTopicTitle,
    editingTopicTitleDraftInitial, setEditingTopicTitleDraftInitial,
    isEditingTopicTitleInline, setIsEditingTopicTitleInline,
    editingTopicSaving, archivingTopicId, notificationSaving,
    topicMutePresetById, topicDeleteConfirm, setTopicDeleteConfirm,
    openTopicContextMenu, runTopicMenuAction, applyTopicRename,
    confirmDeleteTopic, setTopicMutePreset
  ]);

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
    if (isDm) return Boolean(dmCtx?.dmUnreadDividerMessageId);
    const dividerMessageId = asTrimmedString(entryUnreadDivider?.messageId);
    const dividerTopicId = asTrimmedString(entryUnreadDivider?.topicId);
    const normalizedActiveTopicId = asTrimmedString(activeTopicId);

    return Boolean(dividerMessageId && dividerTopicId && normalizedActiveTopicId && dividerTopicId === normalizedActiveTopicId);
  }, [activeTopicId, entryUnreadDivider?.messageId, entryUnreadDivider?.topicId, isDm, dmCtx?.dmUnreadDividerMessageId]);

  const messageViewModels = useMemo(() => {
    const startedAt = typeof performance !== "undefined" ? performance.now() : 0;
    const built = buildChatMessageViewModels(messages, currentUserId, 10 * 60 * 1000);
    const finishedAt = typeof performance !== "undefined" ? performance.now() : startedAt;
    messageVmBuildMsRef.current = Math.max(0, finishedAt - startedAt);
    return built;
  }, [messages, currentUserId]);

  const unreadDividerMessageId = useMemo(() => {
    if (isDm) {
      return dmCtx?.dmUnreadDividerMessageId || "";
    }
    if (!unreadDividerVisible) {
      return "";
    }

    return asTrimmedString(entryUnreadDivider?.messageId);
  }, [entryUnreadDivider?.messageId, unreadDividerVisible, isDm, dmCtx?.dmUnreadDividerMessageId]);

  const dmUnreadScrollKeyRef = useRef("");
  const dmBottomScrollKeyRef = useRef("");

  useEffect(() => {
    if (!isDm) {
      dmUnreadScrollKeyRef.current = "";
      dmBottomScrollKeyRef.current = "";
      return;
    }

    const container = chatLogRef.current;
    if (!container) {
      return;
    }

    const dmThreadId = asTrimmedString(roomId);
    if (!dmThreadId || messages.length === 0) {
      return;
    }

    const dividerId = asTrimmedString(unreadDividerMessageId);
    if (dividerId) {
      const dividerScrollKey = `${dmThreadId}:${dividerId}`;
      if (dmUnreadScrollKeyRef.current === dividerScrollKey) {
        return;
      }

      const selectorMessageId = (typeof CSS !== "undefined" && typeof CSS.escape === "function")
        ? CSS.escape(dividerId)
        : dividerId;
      const target = container.querySelector<HTMLElement>(`[data-message-id="${selectorMessageId}"]`);
      if (!target) {
        return;
      }

      dmUnreadScrollKeyRef.current = dividerScrollKey;
      window.requestAnimationFrame(() => {
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      return;
    }

    const bottomScrollKey = `${dmThreadId}:bottom`;
    if (dmBottomScrollKeyRef.current === bottomScrollKey) {
      return;
    }

    dmBottomScrollKeyRef.current = bottomScrollKey;
    window.requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
    });
  }, [chatLogRef, isDm, messages.length, roomId, unreadDividerMessageId]);

  // B3: принудительный скролл к низу при отправке своего сообщения (rooms + DM).
  // Снимает divider-lock и игнорирует stick-to-bottom гейт.
  useEffect(() => {
    const handler = () => {
      const container = chatLogRef.current;
      if (!container) return;
      delete container.dataset.unreadDividerVisible;
      window.requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    };
    window.addEventListener("datowave:chat:own-send", handler);
    return () => window.removeEventListener("datowave:chat:own-send", handler);
  }, [chatLogRef]);

  // Звуковой mute активного топика: учитываем notificationMode === "none"
  // и заданный topic mute preset (не "off"). Пушим значение в модульный
  // флаг, который читает useRealtimeSoundEffects.
  useEffect(() => {
    if (!activeTopicId) {
      setActiveTopicSoundMuted(false);
      return;
    }
    const preset = topicMutePresetById[activeTopicId] || "off";
    const muted = notificationMode === "none" || (Boolean(preset) && preset !== "off");
    setActiveTopicSoundMuted(muted);
  }, [activeTopicId, notificationMode, topicMutePresetById]);

  const loadedUnreadAfterDivider = useMemo(() => {
    if (!unreadDividerMessageId) {
      return 0;
    }

    const dividerIndex = messages.findIndex((message) => asTrimmedString(message.id) === unreadDividerMessageId);
    if (dividerIndex < 0) {
      return 0;
    }

    return Math.max(0, messages.length - dividerIndex - 1);
  }, [messages, unreadDividerMessageId]);

  const resolvedMentionCandidates = useMemo(() => {
    const byKey = new Map<string, MentionCandidate>();

    (Array.isArray(mentionCandidates) ? mentionCandidates : []).forEach((candidate) => {
      const key = asTrimmedString(candidate.key);
      const handle = asTrimmedString(candidate.handle).toLowerCase();
      const label = asTrimmedString(candidate.label);
      if (!key || !handle || !label) {
        return;
      }

      byKey.set(key, {
        ...candidate,
        key,
        handle,
        label,
        subtitle: asTrimmedString(candidate.subtitle) || null
      });
    });

    messages.forEach((message) => {
      const userId = asTrimmedString(message.user_id);
      const label = asTrimmedString(message.user_name);
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
      userName: asTrimmedString(userName) || "Unknown",
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

  const {
    resetForTopic: resetMentionNavForTopic,
    jumpToNextTopicUnreadMention
  } = useChatPanelMentionNavigation({
    authToken,
    roomId,
    roomSlug,
    activeTopicId,
    topicMentionsActionLoading,
    setTopicMentionsActionLoading,
    onConsumeTopicMentionUnread,
    onSetTopicMentionUnreadLocal,
    setSearchJumpStatusText,
    setSearchJumpTarget: (value) => setSearchJumpTarget(value),
    t
  });

  useEffect(() => {
    const topicId = asTrimmedString(activeTopicId);
    resetMentionNavForTopic(topicId);
  }, [activeTopicId, resetMentionNavForTopic]);

  useChatPanelUnreadWindowExpand({
    activeTopicId,
    hasActiveRoom,
    unreadDividerVisible,
    unreadDividerMessageId,
    loadedUnreadAfterDivider,
    loadingOlderMessages,
    chatLogRef,
    onLoadMessagesAroundAnchor
  });

  const {
    showScrollToBottomButton,
    scrollTimelineToBottom
  } = useChatPanelScrollToBottom({
    chatLogRef,
    hasActiveRoom,
    messagesLength: messages.length,
    loadingOlderMessages
  });

  const chatPanelCtxValue = useMemo(() => ({
    t,
    locale,
    formatMessageTime,
    resolveAttachmentImageUrl,
    formatAttachmentSize,
    setPreviewImageUrl
  }), [t, locale, formatMessageTime, resolveAttachmentImageUrl, formatAttachmentSize]);

  const chatMessageActionsValue = useMemo(() => ({
    onEditMessage,
    onDeleteMessage,
    onReplyMessage,
    onReportMessage,
    onTogglePinMessage,
    onToggleMessageReaction,
    insertMentionToComposer,
    insertQuoteToComposer: handleInsertQuoteToComposer,
    markTopicUnreadFromMessage,
    markReadSaving
  }), [
    onEditMessage, onDeleteMessage, onReplyMessage, onReportMessage,
    onTogglePinMessage, onToggleMessageReaction,
    insertMentionToComposer, handleInsertQuoteToComposer,
    markTopicUnreadFromMessage, markReadSaving
  ]);

  return (
    <ChatPanelProvider value={chatPanelCtxValue}>
    <ChatMessageActionsProvider value={chatMessageActionsValue}>
    <TopicActionsProvider value={topicActionsCtxValue}>
    <section
      className="card middle-card relative flex min-h-0 flex-1 flex-col overflow-hidden"
      data-agent-id={CHAT_AGENT_IDS.panel}
      data-agent-screen-context={chatScreenContext}
    >
      {headerSlot ? (
        <div className="chat-header-stack">{headerSlot}</div>
      ) : (
      <div className="chat-header-stack">
        <TopicTabsHeader
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
            setSearchJumpStatusText={setSearchJumpStatusText}
            setSearchJumpTarget={(value) => setSearchJumpTarget(value)}
            onClose={closeSearchPanel}
          />
        ) : null}
      </div>
      )}
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
          mentionCandidates={resolvedMentionCandidates}
          unreadDividerMessageId={unreadDividerMessageId || null}
          unreadDividerVisible={unreadDividerVisible}
        />
        <ChatFloatingActions
          t={t}
          hasActiveRoom={hasActiveRoom}
          activeTopicMentionUnreadCount={activeTopicMentionUnreadCount}
          topicMentionsActionLoading={topicMentionsActionLoading}
          jumpToNextTopicUnreadMention={jumpToNextTopicUnreadMention}
          showScrollToBottomButton={showScrollToBottomButton}
          scrollTimelineToBottom={scrollTimelineToBottom}
        />
      </div>
      <ChatComposerSection
        hasActiveRoom={hasActiveRoom}
        activeTopicIsArchived={activeTopicIsArchived}
        editingMessageId={editingMessageId}
        replyingToMessage={replyingToMessage}
        quotedMessage={quotedMessage}
        onCancelEdit={onCancelEdit}
        onCancelReply={onCancelReply}
        onCancelQuote={cancelQuote}
        onSendMessage={onSendMessage}
        onSelectAttachmentFiles={onSelectAttachmentFiles}
        onRemovePendingAttachmentAt={onRemovePendingAttachmentAt}
        onRetryPendingAttachmentAt={onRetryPendingAttachmentAt}
        onClearPendingAttachment={onClearPendingAttachment}
        onSetChatText={onSetChatText}
        onChatPaste={onChatPaste}
        onChatInputKeyDown={onChatInputKeyDown}
        chatText={chatText}
        mentionCandidates={resolvedMentionCandidates}
        composePreviewImage={composePreviewImage}
        composePendingAttachments={composePendingAttachments}
        attachmentInputRef={attachmentInputRef}
        screenContext={chatScreenContext}
      />
      <ChatPanelOverlays
        previewImageUrl={previewImageUrl}
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
        topics={topicsForUi}
        isTopicProtected={isMainTopic}
        canManageTopicModeration={canManageTopicModeration}
      />
    </section>
    </TopicActionsProvider>
    </ChatMessageActionsProvider>
    </ChatPanelProvider>
  );
}
