import { ClipboardEvent, FormEvent, KeyboardEvent, ReactNode, RefObject, useEffect, useState } from "react";
import type { Message } from "../domain";

const CHAT_MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)\s]+|https?:\/\/[^)\s]+)\)/g;

type ChatPanelProps = {
  t: (key: string) => string;
  locale: string;
  roomSlug: string;
  roomTitle: string;
  messages: Message[];
  currentUserId: string | null;
  messagesHasMore: boolean;
  loadingOlderMessages: boolean;
  chatText: string;
  composePreviewImageUrl: string | null;
  chatImageLimitHint: string;
  typingUsers: string[];
  chatLogRef: RefObject<HTMLDivElement>;
  onLoadOlderMessages: () => void;
  onSetChatText: (value: string) => void;
  onChatPaste: (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onChatInputKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSendMessage: (event: FormEvent) => void;
  editingMessageId: string | null;
  showVideoToggle: boolean;
  videoWindowsVisible: boolean;
  onToggleVideoWindows: () => void;
  onCancelEdit: () => void;
  onEditMessage: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
};

export function ChatPanel({
  t,
  locale,
  roomSlug,
  roomTitle,
  messages,
  currentUserId,
  messagesHasMore,
  loadingOlderMessages,
  chatText,
  composePreviewImageUrl,
  chatImageLimitHint,
  typingUsers,
  chatLogRef,
  onLoadOlderMessages,
  onSetChatText,
  onChatPaste,
  onChatInputKeyDown,
  onSendMessage,
  editingMessageId,
  showVideoToggle,
  videoWindowsVisible,
  onToggleVideoWindows,
  onCancelEdit,
  onEditMessage,
  onDeleteMessage
}: ChatPanelProps) {
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const hasActiveRoom = Boolean(roomSlug);

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

  const composePreviewImage = composePreviewImageUrl;
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
  const historyButtonLabel = loadingOlderMessages
    ? t("chat.loading")
    : !messagesHasMore
      ? t("chat.historyLoaded")
      : t("chat.loadOlder");

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

  const renderMessageText = (value: string): ReactNode[] => {
    const text = String(value || "");
    const urlPattern = /((https?:\/\/|www\.)[^\s<]+)/gi;
    const result: ReactNode[] = [];
    let imageMatch: RegExpExecArray | null;
    let cursor = 0;
    let keyIndex = 0;

    const pushTextWithLinks = (chunk: string) => {
      if (!chunk) {
        return;
      }

      let textCursor = 0;
      let linkMatch: RegExpExecArray | null;
      urlPattern.lastIndex = 0;

      while ((linkMatch = urlPattern.exec(chunk)) !== null) {
        const raw = linkMatch[0];
        const start = linkMatch.index;
        if (start > textCursor) {
          result.push(chunk.slice(textCursor, start));
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

      if (textCursor < chunk.length) {
        result.push(chunk.slice(textCursor));
      }
    };

    CHAT_MARKDOWN_IMAGE_PATTERN.lastIndex = 0;
    while ((imageMatch = CHAT_MARKDOWN_IMAGE_PATTERN.exec(text)) !== null) {
      const start = imageMatch.index;
      if (start > cursor) {
        pushTextWithLinks(text.slice(cursor, start));
      }

      const imageUrl = String(imageMatch[1] || "").trim();
      if (imageUrl) {
        result.push(
          <button
            key={`img-btn-${keyIndex}-${start}`}
            type="button"
            className="chat-inline-image-btn"
            onClick={() => setPreviewImageUrl(imageUrl)}
            aria-label={t("chat.openImagePreview")}
            title={t("chat.openImagePreview")}
          >
            <img
              src={imageUrl}
              alt="chat-image"
              className="chat-inline-image"
              loading="lazy"
            />
          </button>
        );
        keyIndex += 1;
      }

      cursor = start + imageMatch[0].length;
    }

    if (cursor < text.length) {
      pushTextWithLinks(text.slice(cursor));
    }

    return result.length > 0 ? result : [text];
  };

  return (
    <section className="card middle-card flex min-h-0 flex-1 flex-col overflow-hidden">
      <h2>
        {t("chat.title")} ({hasActiveRoom ? roomTitle || roomSlug : t("chat.noChannel")})
      </h2>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="secondary"
          onClick={onLoadOlderMessages}
          disabled={!hasActiveRoom || !messagesHasMore || loadingOlderMessages}
        >
          {historyButtonLabel}
        </button>
        {showVideoToggle ? (
          <button
            type="button"
            className="secondary ml-auto"
            onClick={onToggleVideoWindows}
          >
            {videoWindowsVisible ? t("chat.hideAllVideos") : t("chat.showAllVideos")}
          </button>
        ) : null}
        {!hasActiveRoom ? (
          <span className="muted">{t("chat.noChannelHint")}</span>
        ) : null}
      </div>
      <div className="chat-log min-h-0 flex-1" ref={chatLogRef}>
        {messages.map((message, index) => {
          const isOwn = currentUserId === message.user_id;
          const previousMessage = index > 0 ? messages[index - 1] : null;
          const nextMessage = index + 1 < messages.length ? messages[index + 1] : null;
          const showAuthor = !previousMessage || previousMessage.user_id !== message.user_id;
          const showAvatar = !isOwn && (!nextMessage || nextMessage.user_id !== message.user_id);
          const createdAtTs = Number(new Date(message.created_at));
          const canManageOwnMessage = isOwn && Number.isFinite(createdAtTs) && (Date.now() - createdAtTs) <= 10 * 60 * 1000;
          const deliveryClass = message.deliveryStatus === "sending"
            ? "delivery-sending"
            : message.deliveryStatus === "delivered"
              ? "delivery-delivered"
              : message.deliveryStatus === "failed"
                ? "text-[var(--pixel-danger)]"
                : "";
          const deliveryGlyph = message.deliveryStatus === "sending"
            ? "•"
            : message.deliveryStatus === "delivered"
              ? "✓✓"
              : message.deliveryStatus === "failed"
                ? "!"
                : "";

          return (
            <article
              key={message.id}
              className={`chat-message group grid items-end gap-2 ${isOwn ? "chat-message-own grid-cols-1 justify-items-end" : "grid-cols-[34px_minmax(0,1fr)]"}`}
            >
              {!isOwn ? (
                <div className="chat-avatar-slot inline-flex h-[30px] w-[30px] items-end justify-center" aria-hidden="true">
                  {showAvatar ? (
                    <div className="chat-avatar inline-flex h-[30px] w-[30px] items-center justify-center">
                      {(message.user_name || "U").charAt(0).toUpperCase()}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className={`chat-bubble-wrap grid max-w-[min(92%,820px)] gap-0.5 ${isOwn ? "justify-items-end" : "justify-items-start"}`}>
                {canManageOwnMessage ? (
                  <div className={`chat-actions-side ${isOwn ? "chat-actions-side-own" : "chat-actions-side-peer"}`}>
                    <button type="button" className="secondary tiny" onClick={() => onEditMessage(message.id)}>{t("chat.edit")}</button>
                    <button type="button" className="secondary tiny" onClick={() => onDeleteMessage(message.id)}>{t("chat.delete")}</button>
                  </div>
                ) : null}

                <div className="chat-bubble w-fit min-w-[120px]">
                  {showAuthor ? (
                    <div className="chat-meta flex items-baseline gap-2">
                      <span className="chat-author">{message.user_name}</span>
                    </div>
                  ) : null}
                  <div className="chat-content-row">
                    <p className="chat-text">{renderMessageText(message.text)}</p>
                    <span className="chat-time-wrap">
                      <span className="chat-time">{formatMessageTime(message.created_at)}</span>
                      {isOwn && message.deliveryStatus ? (
                        <span className={`delivery ${deliveryClass}`}>
                          {deliveryGlyph}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {message.edited_at ? <div className="chat-edited-mark">{t("chat.editedMark")}</div> : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {editingMessageId ? (
        <div className="chat-edit-banner mb-2 flex items-center justify-between gap-3">
          <span>{t("chat.editingNow")}</span>
          <button type="button" className="secondary tiny" onClick={onCancelEdit}>{t("chat.cancelEdit")}</button>
        </div>
      ) : null}
      <form className="chat-compose mt-3 flex items-end gap-3" onSubmit={onSendMessage}>
        <textarea
          value={chatText}
          onChange={(event) => onSetChatText(event.target.value)}
          onPaste={onChatPaste}
          onKeyDown={onChatInputKeyDown}
          rows={2}
          placeholder={hasActiveRoom ? t("chat.typePlaceholder") : t("chat.selectChannelPlaceholder")}
          disabled={!hasActiveRoom}
        />
        {composePreviewImage ? (
          <button
            type="button"
            className="chat-compose-thumb-btn"
            onClick={() => setPreviewImageUrl(composePreviewImage)}
            aria-label={t("chat.openImagePreview")}
            title={t("chat.openImagePreview")}
          >
            <img
              src={composePreviewImage}
              alt="chat-compose-image"
              className="chat-compose-thumb"
              loading="lazy"
            />
          </button>
        ) : null}
        <button type="submit" disabled={!hasActiveRoom}>{editingMessageId ? t("chat.saveEdit") : t("chat.send")}</button>
      </form>
      {hasActiveRoom && typingUsers.length > 0 ? (
        <p className="chat-typing-status" aria-live="polite">
          <span>{typingLabel}</span>
          <span className="chat-typing-dots" aria-hidden="true">
            <span className="chat-typing-dot">.</span>
            <span className="chat-typing-dot">.</span>
            <span className="chat-typing-dot">.</span>
          </span>
        </p>
      ) : null}
      <p className="chat-compose-help muted">{t("chat.composeHint")} {chatImageLimitHint}</p>
      {previewImageUrl ? (
        <div
          className="chat-image-modal-overlay popup-layer-content"
          role="dialog"
          aria-modal="true"
          aria-label={t("chat.imagePreviewTitle")}
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="chat-image-modal-card" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="secondary tiny chat-image-modal-close"
              onClick={() => setPreviewImageUrl(null)}
            >
              {t("chat.closeImagePreview")}
            </button>
            <img src={previewImageUrl} alt="chat-image-preview" className="chat-image-modal-media" />
          </div>
        </div>
      ) : null}
    </section>
  );
}
