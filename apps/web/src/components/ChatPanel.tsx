// Главный компонент чата: координирует состояния панелей, тем, поиска,
// непрочитанного и рендер секций таймлайна/композера/оверлеев.
import { ClipboardEvent, FormEvent, KeyboardEvent, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type MentionCandidate = {
  key: string;
  kind: "user" | "tag" | "all";
  handle: string;
  label: string;
  userId?: string;
  userIds?: string[];
  subtitle?: string | null;
};

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
  mentionCandidates: MentionCandidate[];
};

export function ChatPanel({
  t,
  locale,
  currentServerId,
  roomSlug, roomId, roomTitle,
  topics,  activeTopicId,
  authToken,
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
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
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
    onLoadOlderMessages
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
    currentUserId,
    activeTopicId,
    roomId,
    topics: topicsForUi,
    messages,
    loadingOlderMessages,
    messagesHasMore,
    onLoadOlderMessages,
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
    editingTopicStatusText,
    setEditingTopicStatusText,
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
    loadingOlderMessages,
    messagesHasMore,
    onLoadOlderMessages
  });

  const activeTopic = useMemo(() => topicsForUi.find((topic) => topic.id === activeTopicId) ?? null, [topicsForUi, activeTopicId]);
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
      {editingTopicStatusText ? <div className="chat-topic-read-status mb-2" role="status" aria-live="polite">{editingTopicStatusText}</div> : null}
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
      <ChatMessageTimeline
        t={t}
        locale={locale}
        hasActiveRoom={hasActiveRoom}
        hasTopics={hasTopics}
        activeTopicId={activeTopicId}
        loadingOlderMessages={loadingOlderMessages}
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
        unreadDividerMessageId={unreadDividerVisible ? (entryUnreadDivider?.messageId || null) : null}
        unreadDividerVisible={unreadDividerVisible}
      />
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
