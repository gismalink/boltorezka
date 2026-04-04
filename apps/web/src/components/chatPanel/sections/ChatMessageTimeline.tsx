import { type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from "react";
import type { ChatMessageViewModel } from "../../../utils/chatMessageViewModel";
import { Button } from "../../uicomponents";

type ChatMessageTimelineProps = {
  t: (key: string) => string;
  hasActiveRoom: boolean;
  hasTopics: boolean;
  activeTopicId: string | null;
  loadingOlderMessages: boolean;
  chatLogRef: RefObject<HTMLDivElement>;
  messageViewModels: ChatMessageViewModel[];
  pinnedByMessageId: Record<string, boolean>;
  thumbsUpByMessageId: Record<string, boolean>;
  extraReactionsByMessageId: Record<string, string[]>;
  messageContextMenu: { messageId: string; x: number; y: number } | null;
  setMessageContextMenu: (value: { messageId: string; x: number; y: number } | null) => void;
  onReplyMessage: (messageId: string) => void;
  onEditMessage: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReportMessage: (messageId: string) => void;
  onTogglePinMessage: (messageId: string) => void;
  onToggleMessageReaction: (messageId: string, emoji: string) => void;
  insertMentionToComposer: (userName: string) => void;
  insertQuoteToComposer: (userName: string, text: string) => void;
  markTopicUnreadFromMessage: (messageId: string) => Promise<void>;
  markReadSaving: boolean;
  formatMessageTime: (value: string) => string;
  resolveAttachmentImageUrl: (url: string) => string;
  formatAttachmentSize: (bytes: number) => string;
  setPreviewImageUrl: (value: string | null) => void;
  unreadDividerMessageId: string | null;
  unreadDividerVisible: boolean;
};

const renderMessageText = (value: string): ReactNode[] => {
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
        <span key={`mention-${mentionKeyIndex}-${absoluteStart}`} className="chat-mention">
          {mention}
        </span>
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
  hasActiveRoom,
  hasTopics,
  activeTopicId,
  loadingOlderMessages,
  chatLogRef,
  messageViewModels,
  pinnedByMessageId,
  thumbsUpByMessageId,
  extraReactionsByMessageId,
  messageContextMenu,
  setMessageContextMenu,
  onReplyMessage,
  onEditMessage,
  onDeleteMessage,
  onReportMessage,
  onTogglePinMessage,
  onToggleMessageReaction,
  insertMentionToComposer,
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
  const quickReactionOptions = ["👍", "❤️", "😂", "🔥", "👏", "🎉", "🤯", "😢"];

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

  return (
    <div className="chat-log min-h-0 flex-1" ref={chatLogRef}>
      {loadingOlderMessages ? <div className="chat-history-loading muted">{t("chat.loading")}</div> : null}
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
      {messageViewModels.map((messageVm) => {
        const attachmentImageUrls = messageVm.attachmentImageUrls;
        const attachmentFiles = messageVm.attachmentFiles;
        const isOwn = messageVm.isOwn;
        const showAuthor = messageVm.showAuthor;
        const showAvatar = messageVm.showAvatar;
        const canManageOwnMessage = messageVm.canManageOwnMessage;
        const deliveryClass = messageVm.deliveryClass;
        const deliveryGlyph = messageVm.deliveryGlyph;
        const isPinned = Boolean(pinnedByMessageId[messageVm.id]);
        const hasThumbsUp = Boolean(thumbsUpByMessageId[messageVm.id]);
        const extraReactions = Array.isArray(extraReactionsByMessageId[messageVm.id])
          ? extraReactionsByMessageId[messageVm.id]
          : [];
        const linkPreview = extractFirstLinkPreview(messageVm.text);
        const contextMenuOpen = messageContextMenu?.messageId === messageVm.id;
        const mergedReactions = [
          ...(hasThumbsUp ? ["👍"] : []),
          ...extraReactions.filter((emoji) => emoji !== "👍")
        ];

        return (
          <div key={messageVm.id}>
          {unreadDividerMessageId === messageVm.id ? (
            <div className={`chat-unread-divider ${unreadDividerVisible ? "chat-unread-divider-visible" : ""}`}>
              ----непрочитанные---
            </div>
          ) : null}
          <article
            data-message-id={messageVm.id}
            className={`chat-message group grid items-end gap-2 ${isOwn ? "chat-message-own grid-cols-1 justify-items-end" : "grid-cols-[34px_minmax(0,1fr)]"}`}
            onContextMenu={(event) => openContextMenu(event, messageVm.id)}
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
                    <span className="chat-author">{messageVm.userName}</span>
                  </div>
                ) : null}
                <div className="chat-content-row">
                  {messageVm.replyPreview ? (
                    <div className="chat-inline-reply">
                      <span className="chat-inline-reply-author">{messageVm.replyPreview.userName}</span>
                      <span className="chat-inline-reply-text">{String(messageVm.replyPreview.text || "").replace(/\s+/g, " ").trim().slice(0, 120)}</span>
                    </div>
                  ) : null}
                  <p className="chat-text">{renderMessageText(messageVm.text)}</p>
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
                    {mergedReactions.map((emoji) => <span key={`${messageVm.id}-${emoji}`} className="chat-reaction-chip">{emoji}</span>)}
                  </div>
                ) : null}
                {messageVm.editedAt ? <div className="chat-edited-mark">{t("chat.editedMark")}</div> : null}
              </div>

              {hasActiveRoom && contextMenuOpen ? (
                <>
                  <div
                    className="chat-message-reaction-menu"
                    style={{ left: `${messageContextMenu?.x || 0}px`, top: `${(messageContextMenu?.y || 0) - 52}px` }}
                    role="toolbar"
                    aria-label={t("chat.react")}
                  >
                    {quickReactionOptions.map((emoji) => {
                      const active = emoji === "👍"
                        ? hasThumbsUp
                        : extraReactions.includes(emoji);
                      return (
                        <button
                          key={`${messageVm.id}-quick-${emoji}`}
                          type="button"
                          className={`chat-quick-reaction-btn ${active ? "chat-quick-reaction-btn-active" : ""}`}
                          onClick={() => {
                            onToggleMessageReaction(messageVm.id, emoji);
                            closeContextMenu();
                          }}
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
                    style={{ left: `${messageContextMenu?.x || 0}px`, top: `${messageContextMenu?.y || 0}px` }}
                  >
                    <Button
                      type="button"
                      className="secondary tiny"
                      role="menuitem"
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
                      onClick={() => {
                        insertQuoteToComposer(messageVm.userName, messageVm.text);
                        closeContextMenu();
                      }}
                    >
                      {t("chat.quote")}
                    </Button>
                    <Button
                      type="button"
                      className="secondary tiny"
                      role="menuitem"
                      onClick={() => {
                        void markTopicUnreadFromMessage(messageVm.id);
                        closeContextMenu();
                      }}
                      disabled={!activeTopicId || markReadSaving}
                    >
                      {t("chat.markUnreadFromHere")}
                    </Button>
                    <Button
                      type="button"
                      className="secondary tiny"
                      role="menuitem"
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
    </div>
  );
}
