// Purpose: presentation-only chat panel with message timeline, composer, and message-level UI actions.
import { ClipboardEvent, FormEvent, KeyboardEvent, RefObject, useMemo, useRef, useState } from "react";
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
import { useChatPanelUiInteractions } from "./chatPanel/hooks/useChatPanelUiInteractions";
import { useChatPanelComposerHelpers } from "./chatPanel/hooks/useChatPanelComposerHelpers";
import { useChatPanelTopicCreate } from "./chatPanel/hooks/useChatPanelTopicCreate";
import { useChatPanelTypingBanner } from "./chatPanel/hooks/useChatPanelTypingBanner";
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
  reactionsByMessageId,
  onTogglePinMessage,
  onToggleMessageReaction,
  onUpdateTopic,
  onArchiveTopic,
  onUnarchiveTopic,
  onDeleteTopic
}: ChatPanelProps) {
  const [topicFilterMode] = useState<"all" | "active" | "unread" | "my" | "mentions" | "pinned" | "archived">("all");
  const [topicPaletteOpen, setTopicPaletteOpen] = useState(false);
  const [topicPaletteQuery, setTopicPaletteQuery] = useState("");
  const [topicPaletteSelectedIndex, setTopicPaletteSelectedIndex] = useState(0);
  const [notificationMode, setNotificationMode] = useState<"all" | "mentions" | "none">("all");
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [hotkeyStatusText, setHotkeyStatusText] = useState("");
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const hasActiveRoom = Boolean(roomSlug);

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
    filteredTopicsForPalette
  } = useChatPanelTopicLists({
    topics,
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

  const activeTopic = useMemo(() => topics.find((topic) => topic.id === activeTopicId) ?? null, [topics, activeTopicId]);
  const activeTopicIsArchived = Boolean(activeTopic?.archivedAt);

  const messageViewModels = useMemo(
    () => buildChatMessageViewModels(messages, currentUserId, 10 * 60 * 1000),
    [messages, currentUserId]
  );

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
    topics,
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
