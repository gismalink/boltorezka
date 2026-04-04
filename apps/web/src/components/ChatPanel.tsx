// Purpose: presentation-only chat panel with message timeline, composer, and message-level UI actions.
import { ClipboardEvent, FormEvent, KeyboardEvent, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Message, RoomTopic } from "../domain";
import { buildChatMessageViewModels } from "../utils/chatMessageViewModel";
import { useChatPanelInboxNotifications } from "./chatPanel/hooks/useChatPanelInboxNotifications";
import { useChatPanelAttachmentImages } from "./chatPanel/hooks/useChatPanelAttachmentImages";
import { useChatPanelReadState } from "./chatPanel/hooks/useChatPanelReadState";
import { useChatPanelTopicLists } from "./chatPanel/hooks/useChatPanelTopicLists";
import { useChatPanelTopicActions } from "./chatPanel/hooks/useChatPanelTopicActions";
import { useChatTopLazyLoad } from "./chatPanel/hooks/useChatTopLazyLoad";
import { useChatPanelSearch } from "./chatPanel/hooks/useChatPanelSearch";
import { useMessageContextMenu } from "./chatPanel/hooks/useMessageContextMenu";
import { TopicTabsHeader } from "./chatPanel/sections/TopicTabsHeader";
import { SearchPanel } from "./chatPanel/sections/SearchPanel";
import { ChatMessageTimeline } from "./chatPanel/sections/ChatMessageTimeline";
import { ChatComposerSection } from "./chatPanel/sections/ChatComposerSection";
import { ChatPanelOverlays } from "./chatPanel/sections/ChatPanelOverlays";

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
  thumbsUpByMessageId: Record<string, boolean>;
  reactionsByMessageId: Record<string, Record<string, { count: number; reacted: boolean }>>;
  onTogglePinMessage: (messageId: string) => void;
  onToggleMessageReaction: (messageId: string, emoji: string) => void;
  onUpdateTopic: (topicId: string, title: string) => Promise<void>;
  onArchiveTopic: (topicId: string) => Promise<void>;
  onUnarchiveTopic: (topicId: string) => Promise<void>;
  onDeleteTopic: (topicId: string) => Promise<void>;
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
  thumbsUpByMessageId,
  reactionsByMessageId,
  onTogglePinMessage,
  onToggleMessageReaction,
  onUpdateTopic,
  onArchiveTopic,
  onUnarchiveTopic,
  onDeleteTopic
}: ChatPanelProps) {
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [topicCreateOpen, setTopicCreateOpen] = useState(false);
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [topicFilterMode] = useState<"all" | "active" | "unread" | "my" | "mentions" | "pinned" | "archived">("all");
  const [topicPaletteOpen, setTopicPaletteOpen] = useState(false);
  const [topicPaletteQuery, setTopicPaletteQuery] = useState("");
  const [topicPaletteSelectedIndex, setTopicPaletteSelectedIndex] = useState(0);
  const [notificationMode, setNotificationMode] = useState<"all" | "mentions" | "none">("all");
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [hotkeyStatusText, setHotkeyStatusText] = useState("");
  const topicPaletteInputRef = useRef<HTMLInputElement | null>(null);
  const topicCreatePopupRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const hasActiveRoom = Boolean(roomSlug);

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
    topics,
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
    activeTopicId,
    roomId,
    topics,
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
    topics,
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
    topicsForSelector,
    filteredTopicsForPalette
  } = useChatPanelTopicLists({
    topics,
    activeTopicId,
    topicFilterMode,
    currentUserId,
    getTopicUnreadCount,
    topicPaletteQuery
  });

  useEffect(() => {
    setHotkeyStatusText("");
  }, [activeTopicId, roomSlug]);

  useEffect(() => {
    if (!previewImageUrl) {
      return;
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewImageUrl(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [previewImageUrl]);

  useEffect(() => {
    if (!topicPaletteOpen) {
      return;
    }

    setTopicPaletteQuery("");
    const topicsForInitialSelection = [...topics].sort((a, b) => {
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
    const activeIndex = topicsForInitialSelection.findIndex((topic) => topic.id === activeTopicId);
    setTopicPaletteSelectedIndex(activeIndex >= 0 ? activeIndex : 0);

    const timerId = window.setTimeout(() => {
      topicPaletteInputRef.current?.focus();
      topicPaletteInputRef.current?.select();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [topicPaletteOpen, topics, activeTopicId]);

  useEffect(() => {
    if (!topicCreateOpen) {
      return;
    }

    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        setTopicCreateOpen(false);
        return;
      }

      if (target.closest(".chat-topic-create-anchor") || target.closest(".chat-topic-create-popup")) {
        return;
      }

      setTopicCreateOpen(false);
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setTopicCreateOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [topicCreateOpen]);

  useChatTopLazyLoad({
    chatLogRef,
    hasActiveRoom,
    loadingOlderMessages,
    messagesHasMore,
    onLoadOlderMessages
  });

  const composePreviewImage = composePreviewImageUrl;
  const hasTopics = topics.length > 0;
  const visibleTypingUsers = typingUsers.slice(0, 2);
  const typingOverflowCount = Math.max(0, typingUsers.length - visibleTypingUsers.length);
  const typingUsersLabel = typingOverflowCount > 0
    ? t("chat.typingUsersOverflow")
      .replace("{users}", visibleTypingUsers.join(", "))
      .replace("{count}", String(typingOverflowCount))
    : visibleTypingUsers.join(", ");
  const typingLabel = typingUsers.length <= 1
    ? t("chat.typingSingle").replace("{users}", typingUsersLabel)
    : t("chat.typingMultiple").replace("{users}", typingUsersLabel);
  const handleCreateTopic = async () => {
    const title = newTopicTitle.trim();
    if (!title || creatingTopic) {
      return;
    }

    setCreatingTopic(true);
    try {
      await onCreateTopic(title);
      setNewTopicTitle("");
      setTopicCreateOpen(false);
    } finally {
      setCreatingTopic(false);
    }
  };

  const handleCreateTopicSubmit = (event: FormEvent) => {
    event.preventDefault();
    void handleCreateTopic();
  };

  useEffect(() => {
    if (filteredTopicsForPalette.length === 0) {
      setTopicPaletteSelectedIndex(0);
      return;
    }

    setTopicPaletteSelectedIndex((prev) => {
      if (prev < 0) {
        return 0;
      }
      if (prev >= filteredTopicsForPalette.length) {
        return filteredTopicsForPalette.length - 1;
      }
      return prev;
    });
  }, [filteredTopicsForPalette]);

  const activeTopic = useMemo(() => topics.find((topic) => topic.id === activeTopicId) ?? null, [topics, activeTopicId]);
  const activeTopicIsArchived = Boolean(activeTopic?.archivedAt);

  const messageViewModels = useMemo(
    () => buildChatMessageViewModels(messages, currentUserId, 10 * 60 * 1000),
    [messages, currentUserId]
  );

  const latestMessageIdForHotkeys = messageViewModels.length > 0
    ? messageViewModels[messageViewModels.length - 1]?.id || null
    : null;

  const latestOwnManageableMessageIdForHotkeys = useMemo(() => {
    for (let index = messageViewModels.length - 1; index >= 0; index -= 1) {
      const candidate = messageViewModels[index];
      if (candidate?.canManageOwnMessage) {
        return candidate.id;
      }
    }
    return null;
  }, [messageViewModels]);

  useEffect(() => {
    const hasOpenOverlay = Boolean(previewImageUrl || topicPaletteOpen);
    if (!hasActiveRoom || hasOpenOverlay) {
      return;
    }

    const isEditableTarget = (target: EventTarget | null): boolean => {
      const element = target as HTMLElement | null;
      if (!element) {
        return false;
      }

      const tagName = element.tagName.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select") {
        return true;
      }

      if (element.isContentEditable || element.closest("[contenteditable='true']")) {
        return true;
      }

      return false;
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        openTopicPalette();
        setHotkeyStatusText(t("chat.hotkeyTopicSwitch"));
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      if (key === "t") {
        event.preventDefault();
        openTopicPalette();
        setHotkeyStatusText(t("chat.hotkeyTopicSwitch"));
        return;
      }

      if (key === "r" && latestMessageIdForHotkeys) {
        event.preventDefault();
        onReplyMessage(latestMessageIdForHotkeys);
        setHotkeyStatusText(t("chat.hotkeyReply"));
        return;
      }

      if (key === "e" && latestOwnManageableMessageIdForHotkeys) {
        event.preventDefault();
        onEditMessage(latestOwnManageableMessageIdForHotkeys);
        setHotkeyStatusText(t("chat.hotkeyEdit"));
        return;
      }

      if (key === "m") {
        event.preventDefault();
        void markRoomRead();
        setHotkeyStatusText(t("chat.hotkeyMarkRead"));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    hasActiveRoom,
    latestMessageIdForHotkeys,
    latestOwnManageableMessageIdForHotkeys,
    onEditMessage,
    onReplyMessage,
    previewImageUrl,
    t,
    topicPaletteOpen
  ]);

  const formatMessageTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const formatAttachmentSize = (bytes: number): string => {
    const normalized = Number(bytes || 0);
    if (!Number.isFinite(normalized) || normalized <= 0) {
      return "0 B";
    }

    if (normalized < 1024) {
      return `${Math.round(normalized)} B`;
    }

    if (normalized < 1024 * 1024) {
      return `${(normalized / 1024).toFixed(1)} KB`;
    }

    return `${(normalized / (1024 * 1024)).toFixed(1)} MB`;
  };

  const insertMentionToComposer = (userName: string) => {
    const normalizedUserName = String(userName || "").trim();
    if (!normalizedUserName) {
      return;
    }

    const current = String(chatText || "");
    const separator = current.length === 0 || /\s$/.test(current) ? "" : " ";
    onSetChatText(`${current}${separator}@${normalizedUserName} `);
  };

  const insertQuoteToComposer = (userName: string, text: string) => {
    const normalizedText = String(text || "").replace(/\r/g, "").trim();
    if (!normalizedText) {
      return;
    }

    const normalizedUserName = String(userName || "").trim();
    const quoteSource = normalizedText.length > 280 ? `${normalizedText.slice(0, 277)}...` : normalizedText;
    const quotedLines = quoteSource
      .split("\n")
      .slice(0, 4)
      .map((line) => `> ${String(line || "").trim() || "..."}`)
      .join("\n");

    const quoteBlock = normalizedUserName
      ? `@${normalizedUserName}:\n${quotedLines}\n`
      : `${quotedLines}\n`;

    const current = String(chatText || "");
    const separator = current.trim().length > 0 ? "\n\n" : "";
    onSetChatText(`${current}${separator}${quoteBlock}`);
  };

  const topicPaletteListboxId = "chat-topic-palette-listbox";

  const closeTopicPalette = () => {
    setTopicPaletteOpen(false);
  };

  const openTopicPalette = () => {
    if (!hasTopics) {
      return;
    }
    setTopicPaletteOpen(true);
  };

  const selectTopicFromPalette = (topicId: string) => {
    onSelectTopic(topicId);
    setTopicPaletteOpen(false);
  };

  const handleTopicPaletteKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filteredTopicsForPalette.length > 0) {
        setTopicPaletteSelectedIndex((prev) => Math.min(filteredTopicsForPalette.length - 1, prev + 1));
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredTopicsForPalette.length > 0) {
        setTopicPaletteSelectedIndex((prev) => Math.max(0, prev - 1));
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const selected = filteredTopicsForPalette[topicPaletteSelectedIndex];
      if (selected) {
        selectTopicFromPalette(selected.id);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeTopicPalette();
    }
  };

  return (
    <section className="card middle-card flex min-h-0 flex-1 flex-col overflow-hidden">
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
      />
      {hasActiveRoom ? (
        <div className="chat-hotkeys-hint muted" aria-live="polite">
          {t("chat.hotkeysHint")}
          {hotkeyStatusText ? ` ${hotkeyStatusText}` : ""}
        </div>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {!hasActiveRoom ? (
          <span className="muted">{t("chat.noChannelHint")}</span>
        ) : null}
      </div>
      {editingTopicStatusText ? <div className="chat-topic-read-status mb-2" role="status" aria-live="polite">{editingTopicStatusText}</div> : null}
      {hasActiveRoom ? (
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
        />
      ) : null}
      <div className="chat-typing-banner" aria-live="polite">
        {hasActiveRoom && typingUsers.length > 0 ? (
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
        hasActiveRoom={hasActiveRoom}
        hasTopics={hasTopics}
        activeTopicId={activeTopicId}
        loadingOlderMessages={loadingOlderMessages}
        chatLogRef={chatLogRef}
        messageViewModels={messageViewModels}
        pinnedByMessageId={pinnedByMessageId}
        thumbsUpByMessageId={thumbsUpByMessageId}
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
        insertQuoteToComposer={insertQuoteToComposer}
        markTopicUnreadFromMessage={markTopicUnreadFromMessage}
        markReadSaving={markReadSaving}
        formatMessageTime={formatMessageTime}
        resolveAttachmentImageUrl={resolveAttachmentImageUrl}
        formatAttachmentSize={formatAttachmentSize}
        setPreviewImageUrl={setPreviewImageUrl}
        unreadDividerMessageId={entryUnreadDivider?.messageId || null}
        unreadDividerVisible={Boolean(entryUnreadDivider?.visible && entryUnreadDivider?.topicId === String(activeTopicId || "").trim())}
      />
      <ChatComposerSection
        t={t}
        hasActiveRoom={hasActiveRoom}
        activeTopicIsArchived={activeTopicIsArchived}
        editingMessageId={editingMessageId}
        replyingToMessage={replyingToMessage}
        onCancelEdit={onCancelEdit}
        onCancelReply={onCancelReply}
        onSendMessage={onSendMessage}
        onSelectAttachmentFile={onSelectAttachmentFile}
        onClearPendingAttachment={onClearPendingAttachment}
        onSetChatText={onSetChatText}
        onChatPaste={onChatPaste}
        onChatInputKeyDown={onChatInputKeyDown}
        chatText={chatText}
        composePreviewImage={composePreviewImage}
        composePendingAttachmentName={composePendingAttachmentName}
        setPreviewImageUrl={setPreviewImageUrl}
        attachmentInputRef={attachmentInputRef}
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
        topics={topics}
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
