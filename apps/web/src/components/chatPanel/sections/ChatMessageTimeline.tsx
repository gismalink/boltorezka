// Секционный компонент таймлайна сообщений: отвечает за рендер сообщений,
// контекстное меню и визуальные разделители (дата/непрочитанные).
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from "react";
import type { ChatMessageViewModel } from "../../../utils/chatMessageViewModel";
import { CHAT_AGENT_IDS, chatAgentMessageId } from "../../../constants/chatAgentSemantics";
import { Button } from "../../uicomponents";
import { formatDateSeparatorLabel, shouldShowDateDivider } from "./chatTimelineUtils";

const INITIAL_TIMELINE_RENDER_COUNT = 180;
const TIMELINE_RENDER_INCREMENT = 120;
const TIMELINE_EXPAND_SCROLL_TOP_THRESHOLD = 220;

type ChatMessageTimelineProps = {
  t: (key: string) => string;
  locale: string;
  hasActiveRoom: boolean;
  hasTopics: boolean;
  activeTopicId: string | null;
  messagesHasMore: boolean;
  loadingOlderMessages: boolean;
  onLoadOlderMessages: () => void;
  chatLogRef: RefObject<HTMLDivElement>;
  messageViewModels: ChatMessageViewModel[];
  pinnedByMessageId: Record<string, boolean>;
  reactionsByMessageId: Record<string, Record<string, { count: number; reacted: boolean }>>;
  messageContextMenu: { messageId: string; x: number; y: number } | null;
  setMessageContextMenu: (value: { messageId: string; x: number; y: number } | null) => void;
  onReplyMessage: (messageId: string) => void;
  onEditMessage: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReportMessage: (messageId: string) => void;
  onTogglePinMessage: (messageId: string) => void;
  onToggleMessageReaction: (messageId: string, emoji: string) => void;
  insertMentionToComposer: (userName: string) => void;
  mentionCandidates: Array<{
    key: string;
    kind: "user" | "tag" | "all";
    handle: string;
    label: string;
    userId?: string;
  }>;
  insertQuoteToComposer: (userName: string, text: string, selectedText: string) => void;
  markTopicUnreadFromMessage: (messageId: string) => Promise<void>;
  markReadSaving: boolean;
  formatMessageTime: (value: string) => string;
  resolveAttachmentImageUrl: (url: string) => string;
  formatAttachmentSize: (bytes: number) => string;
  setPreviewImageUrl: (value: string | null) => void;
  unreadDividerMessageId: string | null;
  unreadDividerVisible: boolean;
};

const renderMessageText = (
  value: string,
  resolveMentionUser: (handle: string) => { label: string; handle: string; userId?: string } | null,
  onMentionClick: (input: { label: string; handle: string; userId?: string }) => void
): ReactNode[] => {
  const text = String(value || "");
  const urlPattern = /((https?:\/\/|www\.)[^\s<]+)/gi;
  const mentionPattern = /(^|\s)(@[\p{L}\p{N}._-]{2,32})/gu;
  const result: ReactNode[] = [];
  let keyIndex = 0;

  let textCursor = 0;
  let linkMatch: RegExpExecArray | null;
  urlPattern.lastIndex = 0;

  while ((linkMatch = urlPattern.exec(text)) !== null) {
    const raw = linkMatch[0];
    const start = linkMatch.index;
    if (start > textCursor) {
      result.push(text.slice(textCursor, start));
    }

    let linkText = raw;
    let trailing = "";
    while (/[.,!?;:)\]]$/.test(linkText)) {
      trailing = linkText.slice(-1) + trailing;
      linkText = linkText.slice(0, -1);
    }

    if (linkText) {
      const href = /^https?:\/\//i.test(linkText) ? linkText : `https://${linkText}`;
      result.push(
        <a
          key={`link-${keyIndex}-${start}-${linkText}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="chat-link"
        >
          {linkText}
        </a>
      );
      keyIndex += 1;
    }

    if (trailing) {
      result.push(trailing);
    }

    textCursor = start + raw.length;
  }

  if (textCursor < text.length) {
    result.push(text.slice(textCursor));
  }

  const withMentions: ReactNode[] = [];
  let mentionKeyIndex = 0;

  const pushSegmentWithMentions = (segment: string) => {
    if (!segment) {
      return;
    }

    let cursor = 0;
    let mentionMatch: RegExpExecArray | null;
    mentionPattern.lastIndex = 0;

    while ((mentionMatch = mentionPattern.exec(segment)) !== null) {
      const leading = mentionMatch[1] || "";
      const mention = mentionMatch[2] || "";
      const absoluteStart = mentionMatch.index + leading.length;

      if (absoluteStart > cursor) {
        withMentions.push(segment.slice(cursor, absoluteStart));
      }

      withMentions.push(
        (() => {
          const normalizedHandle = mention.slice(1).toLowerCase();
          const mentionUser = resolveMentionUser(normalizedHandle);
          if (mentionUser) {
            return (
              <button
                key={`mention-${mentionKeyIndex}-${absoluteStart}`}
                type="button"
                className="chat-mention chat-mention-btn"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onMentionClick(mentionUser);
                }}
              >
                {mention}
              </button>
            );
          }

          return (
            <span key={`mention-${mentionKeyIndex}-${absoluteStart}`} className="chat-mention">
              {mention}
            </span>
          );
        })()
      );
      mentionKeyIndex += 1;
      cursor = absoluteStart + mention.length;
    }

    if (cursor < segment.length) {
      withMentions.push(segment.slice(cursor));
    }
  };

  (result.length > 0 ? result : [text]).forEach((chunk) => {
    if (typeof chunk === "string") {
      pushSegmentWithMentions(chunk);
      return;
    }

    withMentions.push(chunk);
  });

  const withFormatting: ReactNode[] = [];
  let formatKeyIndex = 0;
  const formattingPattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\|\|[^|\n]+\|\|)/g;

  const pushSegmentWithFormatting = (segment: string) => {
    if (!segment) {
      return;
    }

    let cursor = 0;
    formattingPattern.lastIndex = 0;
    let formatMatch: RegExpExecArray | null;

    while ((formatMatch = formattingPattern.exec(segment)) !== null) {
      const token = formatMatch[0] || "";
      const start = formatMatch.index;
      if (start > cursor) {
        withFormatting.push(segment.slice(cursor, start));
      }

      if (token.startsWith("**") && token.endsWith("**")) {
        withFormatting.push(
          <strong key={`fmt-bold-${formatKeyIndex}-${start}`} className="chat-format-bold">
            {token.slice(2, -2)}
          </strong>
        );
      } else if (token.startsWith("*") && token.endsWith("*")) {
        withFormatting.push(
          <em key={`fmt-italic-${formatKeyIndex}-${start}`} className="chat-format-italic">
            {token.slice(1, -1)}
          </em>
        );
      } else if (token.startsWith("`") && token.endsWith("`")) {
        withFormatting.push(
          <code key={`fmt-code-${formatKeyIndex}-${start}`} className="chat-format-code">
            {token.slice(1, -1)}
          </code>
        );
      } else if (token.startsWith("||") && token.endsWith("||")) {
        withFormatting.push(
          <span key={`fmt-spoiler-${formatKeyIndex}-${start}`} className="chat-format-spoiler">
            {token.slice(2, -2)}
          </span>
        );
      } else {
        withFormatting.push(token);
      }

      formatKeyIndex += 1;
      cursor = start + token.length;
    }

    if (cursor < segment.length) {
      withFormatting.push(segment.slice(cursor));
    }
  };

  (withMentions.length > 0 ? withMentions : [text]).forEach((chunk) => {
    if (typeof chunk === "string") {
      pushSegmentWithFormatting(chunk);
      return;
    }

    withFormatting.push(chunk);
  });

  return withFormatting.length > 0 ? withFormatting : [text];
};

const extractFirstLinkPreview = (value: string): { href: string; host: string; path: string } | null => {
  const text = String(value || "");
  const match = text.match(/((https?:\/\/|www\.)[^\s<]+)/i);
  if (!match || !match[0]) {
    return null;
  }

  let raw = match[0];
  while (/[.,!?;:)\]]$/.test(raw)) {
    raw = raw.slice(0, -1);
  }
  if (!raw) {
    return null;
  }

  const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(href);
    const normalizedPath = `${parsed.pathname || "/"}${parsed.search || ""}`;
    return {
      href,
      host: parsed.host,
      path: normalizedPath.length > 72 ? `${normalizedPath.slice(0, 69)}...` : normalizedPath
    };
  } catch {
    return null;
  }
};

export function ChatMessageTimeline({
  t,
  locale,
  hasActiveRoom,
  hasTopics,
  activeTopicId,
  messagesHasMore,
  loadingOlderMessages,
  onLoadOlderMessages,
  chatLogRef,
  messageViewModels,
  pinnedByMessageId,
  reactionsByMessageId,
  messageContextMenu,
  setMessageContextMenu,
  onReplyMessage,
  onEditMessage,
  onDeleteMessage,
  onReportMessage,
  onTogglePinMessage,
  onToggleMessageReaction,
  insertMentionToComposer,
  mentionCandidates,
  insertQuoteToComposer,
  markTopicUnreadFromMessage,
  markReadSaving,
  formatMessageTime,
  resolveAttachmentImageUrl,
  formatAttachmentSize,
  setPreviewImageUrl,
  unreadDividerMessageId,
  unreadDividerVisible
}: ChatMessageTimelineProps) {
  const [renderedMessagesCount, setRenderedMessagesCount] = useState(INITIAL_TIMELINE_RENDER_COUNT);
  const [selectedMentionProfile, setSelectedMentionProfile] = useState<{ label: string; handle: string; userId?: string } | null>(null);
  const safeReactionsByMessageId = reactionsByMessageId || {};
  const quickReactionOptions = ["👍", "❤️", "😂", "🔥", "👏", "🎉", "🤯", "😢"];
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 720;

  const mentionUsersByHandle = useMemo(() => {
    const byHandle = new Map<string, { label: string; handle: string; userId?: string }>();

    (Array.isArray(mentionCandidates) ? mentionCandidates : []).forEach((candidate) => {
      if (candidate.kind !== "user") {
        return;
      }

      const handle = String(candidate.handle || "").trim().toLowerCase();
      const label = String(candidate.label || "").trim();
      if (!handle || !label || byHandle.has(handle)) {
        return;
      }

      byHandle.set(handle, {
        label,
        handle,
        userId: String(candidate.userId || "").trim() || undefined
      });
    });

    return byHandle;
  }, [mentionCandidates]);

  const mentionUsersByLabel = useMemo(() => {
    const byLabel = new Map<string, { label: string; handle: string; userId?: string }>();

    (Array.isArray(mentionCandidates) ? mentionCandidates : []).forEach((candidate) => {
      if (candidate.kind !== "user") {
        return;
      }

      const label = String(candidate.label || "").trim();
      const normalizedLabel = label.toLowerCase();
      const handle = String(candidate.handle || "").trim();
      if (!normalizedLabel || !label || !handle || byLabel.has(normalizedLabel)) {
        return;
      }

      byLabel.set(normalizedLabel, {
        label,
        handle,
        userId: String(candidate.userId || "").trim() || undefined
      });
    });

    return byLabel;
  }, [mentionCandidates]);

  const openProfileFromUserName = (userNameRaw: string) => {
    const userName = String(userNameRaw || "").trim();
    if (!userName) {
      return;
    }

    const resolved = mentionUsersByLabel.get(userName.toLowerCase());
    if (resolved) {
      setSelectedMentionProfile(resolved);
      return;
    }

    setSelectedMentionProfile({
      label: userName,
      handle: userName,
      userId: undefined
    });
  };

  useEffect(() => {
    setRenderedMessagesCount(INITIAL_TIMELINE_RENDER_COUNT);
  }, [activeTopicId]);

  const unreadDividerIndex = useMemo(() => {
    if (!unreadDividerVisible || !unreadDividerMessageId) {
      return -1;
    }

    return messageViewModels.findIndex((messageVm) => messageVm.id === unreadDividerMessageId);
  }, [messageViewModels, unreadDividerMessageId, unreadDividerVisible]);

  const windowStartIndex = useMemo(() => {
    const baseStart = Math.max(0, messageViewModels.length - renderedMessagesCount);
    if (unreadDividerIndex >= 0) {
      return Math.min(baseStart, unreadDividerIndex);
    }

    return baseStart;
  }, [messageViewModels.length, renderedMessagesCount, unreadDividerIndex]);

  const visibleMessageViewModels = useMemo(
    () => messageViewModels.slice(windowStartIndex),
    [messageViewModels, windowStartIndex]
  );

  useEffect(() => {
    const chatLogNode = chatLogRef.current;
    if (!chatLogNode) {
      return;
    }

    const maybeExpandRenderedWindow = () => {
      if (chatLogNode.scrollTop > TIMELINE_EXPAND_SCROLL_TOP_THRESHOLD) {
        return;
      }

      setRenderedMessagesCount((prev) => {
        if (prev >= messageViewModels.length) {
          return prev;
        }

        const previousScrollHeight = chatLogNode.scrollHeight;
        const next = Math.min(messageViewModels.length, prev + TIMELINE_RENDER_INCREMENT);
        window.requestAnimationFrame(() => {
          const nextScrollHeight = chatLogNode.scrollHeight;
          const delta = nextScrollHeight - previousScrollHeight;
          if (delta > 0) {
            chatLogNode.scrollTop += delta;
          }
        });
        return next;
      });
    };

    chatLogNode.addEventListener("scroll", maybeExpandRenderedWindow, { passive: true });
    maybeExpandRenderedWindow();

    return () => {
      chatLogNode.removeEventListener("scroll", maybeExpandRenderedWindow);
    };
  }, [chatLogRef, messageViewModels.length]);

  const closeContextMenu = () => {
    setMessageContextMenu(null);
  };

  const openContextMenu = (event: ReactMouseEvent, messageId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setMessageContextMenu({
      messageId,
      x: event.clientX,
      y: event.clientY
    });
  };

  const shouldIgnoreMessageDoubleClick = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(target.closest("a, button, input, textarea, select, label"));
  };

  const handleMessageDoubleClick = (event: ReactMouseEvent, messageId: string) => {
    if (event.button !== 0 || shouldIgnoreMessageDoubleClick(event.target)) {
      return;
    }

    onReplyMessage(messageId);
    closeContextMenu();
  };

  const resolveMessageIdFromSelectionNode = (node: Node | null): string | null => {
    if (!node) {
      return null;
    }

    const element = node instanceof Element ? node : node.parentElement;
    if (!element) {
      return null;
    }

    const messageElement = element.closest("[data-message-id]");
    return messageElement ? String(messageElement.getAttribute("data-message-id") || "").trim() || null : null;
  };

  const getSelectedQuoteTextForMessage = (messageId: string): string => {
    if (typeof window === "undefined") {
      return "";
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return "";
    }

    const anchorMessageId = resolveMessageIdFromSelectionNode(selection.anchorNode);
    const focusMessageId = resolveMessageIdFromSelectionNode(selection.focusNode);
    if (!anchorMessageId || !focusMessageId || anchorMessageId !== messageId || focusMessageId !== messageId) {
      return "";
    }

    const normalized = selection.toString().replace(/\s+/g, " ").trim();
    return normalized.length > 280 ? `${normalized.slice(0, 277)}...` : normalized;
  };

  return (
    <div
      className="chat-log min-h-0 flex-1"
      ref={chatLogRef}
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      data-agent-id={CHAT_AGENT_IDS.timeline}
    >
      {hasActiveRoom ? (
        <div className="chat-history-status-row" role="status" aria-live="polite">
          {messagesHasMore ? (
            loadingOlderMessages ? (
              <div className="chat-history-loading muted">{t("chat.loading")}</div>
            ) : (
              <Button
                type="button"
                className="secondary tiny"
                onClick={onLoadOlderMessages}
                disabled={loadingOlderMessages}
              >
                Загрузить более ранние сообщения
              </Button>
            )
          ) : messageViewModels.length > 0 ? (
            <div className="chat-history-start muted">Начало истории чата</div>
          ) : null}
        </div>
      ) : null}
      {hasActiveRoom && !hasTopics ? (
        <div className="chat-empty-state">
          <p className="chat-empty-state-title">{t("chat.emptyTopicsTitle")}</p>
          <p className="chat-empty-state-hint">{t("chat.emptyTopicsHint")}</p>
        </div>
      ) : hasActiveRoom && hasTopics && activeTopicId && messageViewModels.length === 0 && !loadingOlderMessages ? (
        <div className="chat-empty-state">
          <p className="chat-empty-state-title">{t("chat.emptyMessagesTitle")}</p>
          <p className="chat-empty-state-hint">{t("chat.emptyMessagesHint")}</p>
        </div>
      ) : null}
      {visibleMessageViewModels.map((messageVm, index) => {
        const previousMessageVm = index > 0 ? visibleMessageViewModels[index - 1] : null;
        const showDateDivider = shouldShowDateDivider(previousMessageVm?.createdAt || null, messageVm.createdAt);
        const dateDividerLabel = showDateDivider ? formatDateSeparatorLabel(messageVm.createdAt, locale) : "";
        const attachmentImageUrls = messageVm.attachmentImageUrls;
        const attachmentFiles = messageVm.attachmentFiles;
        const isOwn = messageVm.isOwn;
        const showAuthor = messageVm.showAuthor;
        const showAvatar = messageVm.showAvatar;
        const canManageOwnMessage = messageVm.canManageOwnMessage;
        const deliveryClass = messageVm.deliveryClass;
        const deliveryGlyph = messageVm.deliveryGlyph;
        const isPinned = Boolean(pinnedByMessageId[messageVm.id]);
        const messageReactions = safeReactionsByMessageId[messageVm.id] || {};
        const mergedReactions = Object.entries(messageReactions)
          .filter(([, value]) => Number(value?.count || 0) > 0)
          .map(([emoji, value]) => ({
            emoji,
            count: Number(value.count || 0),
            reacted: Boolean(value.reacted)
          }));
        const linkPreview = extractFirstLinkPreview(messageVm.text);
        const contextMenuOpen = messageContextMenu?.messageId === messageVm.id;
        const contextMenuX = messageContextMenu
          ? Math.max(10, Math.min(messageContextMenu.x, viewportWidth - 216))
          : 10;
        const contextMenuY = messageContextMenu
          ? Math.max(10, Math.min(messageContextMenu.y, viewportHeight - 330))
          : 10;
        const reactionMenuX = messageContextMenu
          ? Math.max(10, Math.min(messageContextMenu.x, viewportWidth - 360))
          : 10;
        const reactionMenuY = messageContextMenu
          ? Math.max(10, Math.min(messageContextMenu.y - 52, viewportHeight - 80))
          : 10;
        const selectedQuoteText = contextMenuOpen ? getSelectedQuoteTextForMessage(messageVm.id) : "";
        return (
          <div key={messageVm.id}>
          {showDateDivider ? (
            <div className="chat-date-divider" role="separator" aria-label={dateDividerLabel || "Date separator"}>
              <span>{dateDividerLabel}</span>
            </div>
          ) : null}
          {unreadDividerVisible && unreadDividerMessageId === messageVm.id ? (
            <div
              className={`chat-unread-divider ${unreadDividerVisible ? "chat-unread-divider-visible" : ""}`}
              role="separator"
              aria-label="Unread messages"
              data-agent-id={CHAT_AGENT_IDS.timelineUnreadDivider}
            >
              <span aria-hidden="true">----непрочитанные---</span>
            </div>
          ) : null}
          <article
            data-message-id={messageVm.id}
            data-agent-id={chatAgentMessageId(messageVm.id)}
            data-agent-message-author={messageVm.userName}
            data-agent-message-own={isOwn ? "true" : "false"}
            className={`chat-message group grid items-end gap-2 ${isOwn ? "chat-message-own grid-cols-1 justify-items-end" : "grid-cols-[34px_minmax(0,1fr)]"}`}
            onContextMenu={(event) => openContextMenu(event, messageVm.id)}
            onDoubleClick={(event) => handleMessageDoubleClick(event, messageVm.id)}
            aria-label={`${messageVm.userName}: ${String(messageVm.text || "").replace(/\s+/g, " ").trim().slice(0, 140)}`}
          >
            {!isOwn ? (
              <div className="chat-avatar-slot inline-flex h-[30px] w-[30px] items-end justify-center" aria-hidden="true">
                {showAvatar ? (
                  <div className="chat-avatar inline-flex h-[30px] w-[30px] items-center justify-center">
                    {(messageVm.userName || "U").charAt(0).toUpperCase()}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className={`chat-bubble-wrap grid max-w-[min(92%,820px)] gap-0.5 ${isOwn ? "justify-items-end" : "justify-items-start"}`}>
              <div className="chat-bubble w-fit min-w-[120px]">
                {showAuthor ? (
                  <div className="chat-meta flex items-baseline gap-2">
                    <button
                      type="button"
                      className="chat-author chat-author-btn"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openProfileFromUserName(messageVm.userName);
                      }}
                    >
                      {messageVm.userName}
                    </button>
                  </div>
                ) : null}
                <div className="chat-content-row">
                  {messageVm.replyPreview ? (
                    <div className="chat-inline-reply">
                      <button
                        type="button"
                        className="chat-inline-reply-author chat-inline-reply-author-btn"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openProfileFromUserName(messageVm.replyPreview?.userName || "");
                        }}
                      >
                        {messageVm.replyPreview.userName}
                      </button>
                      <span className="chat-inline-reply-text">{String(messageVm.replyPreview.text || "").replace(/\s+/g, " ").trim().slice(0, 120)}</span>
                    </div>
                  ) : null}
                  <p className="chat-text">
                    {renderMessageText(
                      messageVm.text,
                      (handle) => mentionUsersByHandle.get(handle) || null,
                      (input) => setSelectedMentionProfile(input)
                    )}
                  </p>
                  <span className="chat-time-wrap">
                    <span className="chat-time">{formatMessageTime(messageVm.createdAt)}</span>
                    {isOwn && deliveryGlyph ? (
                      <span className={`delivery ${deliveryClass}`}>
                        {deliveryGlyph}
                      </span>
                    ) : null}
                  </span>
                </div>
                {linkPreview ? (
                  <a
                    href={linkPreview.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chat-link-preview"
                  >
                    <span className="chat-link-preview-host">{linkPreview.host}</span>
                    <span className="chat-link-preview-path">{linkPreview.path}</span>
                    <span className="chat-link-preview-open">{t("chat.openLink")}</span>
                  </a>
                ) : null}
                {attachmentImageUrls.length > 0 ? (
                  <div className="chat-attachments-row">
                    {attachmentImageUrls.map((imageUrl) => (
                      <Button
                        key={`${messageVm.id}-${imageUrl}`}
                        type="button"
                        className="chat-inline-image-btn"
                        onClick={() => setPreviewImageUrl(imageUrl)}
                        aria-label={t("chat.openImagePreview")}
                        title={t("chat.openImagePreview")}
                      >
                        <img
                          src={resolveAttachmentImageUrl(imageUrl)}
                          alt="chat-image"
                          className="chat-inline-image"
                          loading="lazy"
                        />
                      </Button>
                    ))}
                  </div>
                ) : null}
                {attachmentFiles.length > 0 ? (
                  <div className="chat-attachments-row">
                    {attachmentFiles.map((attachment) => (
                      <a
                        key={`${messageVm.id}-${attachment.id}`}
                        href={attachment.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="chat-attachment-file"
                      >
                        <span className="chat-attachment-file-title">
                          {attachment.type === "audio" ? t("chat.attachmentAudio") : t("chat.attachmentDocument")}
                        </span>
                        <span className="chat-attachment-file-meta">
                          {attachment.mimeType}
                          {" · "}
                          {formatAttachmentSize(attachment.sizeBytes)}
                        </span>
                      </a>
                    ))}
                  </div>
                ) : null}
                {isPinned || mergedReactions.length > 0 ? (
                  <div className="chat-reactions-row">
                    {isPinned ? <span className="chat-reaction-chip">{t("chat.pin")}</span> : null}
                    {mergedReactions.map((reaction) => (
                      <button
                        key={`${messageVm.id}-${reaction.emoji}`}
                        type="button"
                        className={`chat-reaction-chip chat-reaction-chip-button ${reaction.reacted ? "chat-reaction-chip-active" : ""}`}
                        onClick={() => onToggleMessageReaction(messageVm.id, reaction.emoji)}
                        aria-label={`${t("chat.react")}: ${reaction.emoji}`}
                        title={`${t("chat.react")}: ${reaction.emoji}`}
                      >
                        <span>{reaction.emoji}</span>
                        {reaction.count > 1 ? <span>{reaction.count}</span> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
                {messageVm.editedAt ? <div className="chat-edited-mark">{t("chat.editedMark")}</div> : null}
              </div>

              {hasActiveRoom && contextMenuOpen ? (
                <>
                  <div
                    className="chat-message-reaction-menu"
                    style={{ left: `${reactionMenuX}px`, top: `${reactionMenuY}px` }}
                    role="toolbar"
                    aria-label={t("chat.react")}
                    data-agent-id={CHAT_AGENT_IDS.messageReactionMenu}
                  >
                    {quickReactionOptions.map((emoji) => {
                      const active = Boolean(messageReactions[emoji]?.reacted);
                      return (
                        <button
                          key={`${messageVm.id}-quick-${emoji}`}
                          type="button"
                          className={`chat-quick-reaction-btn ${active ? "chat-quick-reaction-btn-active" : ""}`}
                          onClick={() => {
                            onToggleMessageReaction(messageVm.id, emoji);
                            closeContextMenu();
                          }}
                          aria-label={`${t("chat.react")}: ${emoji}`}
                          title={`${t("chat.react")}: ${emoji}`}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                  <div
                    className="chat-message-context-menu"
                    id={`chat-message-menu-${messageVm.id}`}
                    role="menu"
                    aria-label={t("chat.messageActions")}
                    style={{ left: `${contextMenuX}px`, top: `${contextMenuY}px` }}
                    data-agent-id={CHAT_AGENT_IDS.messageContextMenu}
                  >
                    <Button
                      type="button"
                      className="secondary tiny"
                      role="menuitem"
                      data-agent-id={CHAT_AGENT_IDS.messageActionReply}
                      onClick={() => {
                        onReplyMessage(messageVm.id);
                        closeContextMenu();
                      }}
                    >
                      {t("chat.reply")}
                    </Button>
                    <Button
                      type="button"
                      className="secondary tiny"
                      role="menuitem"
                      data-agent-id={CHAT_AGENT_IDS.messageActionMention}
                      onClick={() => {
                        insertMentionToComposer(messageVm.userName);
                        closeContextMenu();
                      }}
                    >
                      {t("chat.mention")}
                    </Button>
                    <Button
                      type="button"
                      className="secondary tiny"
                      role="menuitem"
                      data-agent-id={CHAT_AGENT_IDS.messageActionQuote}
                      onClick={() => {
                        insertQuoteToComposer(messageVm.userName, messageVm.text, selectedQuoteText);
                        closeContextMenu();
                      }}
                      disabled={!selectedQuoteText}
                      title={selectedQuoteText ? t("chat.quote") : t("chat.quoteSelectHint")}
                    >
                      {t("chat.quote")}
                    </Button>
                    <Button
                      type="button"
                      className="secondary tiny"
                      role="menuitem"
                      data-agent-id={CHAT_AGENT_IDS.messageActionMarkUnread}
                      onClick={() => {
                        void markTopicUnreadFromMessage(messageVm.id);
                        closeContextMenu();
                      }}
                      disabled={!activeTopicId || markReadSaving || isOwn}
                    >
                      {t("chat.markUnreadFromHere")}
                    </Button>
                    <Button
                      type="button"
                      className="secondary tiny"
                      role="menuitem"
                      data-agent-id={CHAT_AGENT_IDS.messageActionPinToggle}
                      onClick={() => {
                        onTogglePinMessage(messageVm.id);
                        closeContextMenu();
                      }}
                    >
                      {isPinned ? t("chat.unpin") : t("chat.pin")}
                    </Button>
                    {!isOwn ? (
                      <Button
                        type="button"
                        className="secondary tiny"
                        role="menuitem"
                        data-agent-id={CHAT_AGENT_IDS.messageActionReport}
                        onClick={() => {
                          onReportMessage(messageVm.id);
                          closeContextMenu();
                        }}
                      >
                        {t("chat.reportMessage")}
                      </Button>
                    ) : null}
                    {canManageOwnMessage ? (
                      <>
                        <Button
                          type="button"
                          className="secondary tiny"
                          role="menuitem"
                          data-agent-id={CHAT_AGENT_IDS.messageActionEdit}
                          onClick={() => {
                            onEditMessage(messageVm.id);
                            closeContextMenu();
                          }}
                        >
                          {t("chat.edit")}
                        </Button>
                        <Button
                          type="button"
                          className="secondary tiny"
                          role="menuitem"
                          data-agent-id={CHAT_AGENT_IDS.messageActionDelete}
                          onClick={() => {
                            onDeleteMessage(messageVm.id);
                            closeContextMenu();
                          }}
                        >
                          {t("chat.delete")}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </article>
          </div>
        );
      })}
      {selectedMentionProfile ? (
        <div
          className="fixed inset-0 z-[185] flex items-center justify-center bg-black/65 px-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("rooms.memberProfileTitle")}
          data-agent-id={CHAT_AGENT_IDS.messageProfileModal}
        >
          <div className="card compact relative grid w-full max-w-[460px] gap-3 p-4">
            <button
              type="button"
              className="secondary icon-btn tiny mention-profile-close"
              onClick={() => setSelectedMentionProfile(null)}
              aria-label={t("settings.cancel")}
              data-agent-id={CHAT_AGENT_IDS.messageProfileModalClose}
            >
              <i className="bi bi-x-lg" aria-hidden="true" />
            </button>
            <h3>{t("rooms.memberProfileTitle")}</h3>
            <div><strong>{t("server.profileName")}: </strong>{selectedMentionProfile.label}</div>
            <div><strong>Handle: </strong>@{selectedMentionProfile.handle}</div>
            {selectedMentionProfile.userId ? <div><strong>ID: </strong>{selectedMentionProfile.userId}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
