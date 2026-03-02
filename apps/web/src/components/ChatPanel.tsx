import { ClipboardEvent, FormEvent, KeyboardEvent, ReactNode, RefObject } from "react";
import type { Message } from "../domain";

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
  chatLogRef: RefObject<HTMLDivElement>;
  onLoadOlderMessages: () => void;
  onSetChatText: (value: string) => void;
  onChatPaste: (event: ClipboardEvent<HTMLInputElement>) => void;
  onChatInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSendMessage: (event: FormEvent) => void;
  editingMessageId: string | null;
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
  chatLogRef,
  onLoadOlderMessages,
  onSetChatText,
  onChatPaste,
  onChatInputKeyDown,
  onSendMessage,
  editingMessageId,
  onCancelEdit,
  onEditMessage,
  onDeleteMessage
}: ChatPanelProps) {
  const hasActiveRoom = Boolean(roomSlug);
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
    const markdownImagePattern = /!\[[^\]]*\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[^)\s]+|https?:\/\/[^)\s]+)\)/g;
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

    while ((imageMatch = markdownImagePattern.exec(text)) !== null) {
      const start = imageMatch.index;
      if (start > cursor) {
        pushTextWithLinks(text.slice(cursor, start));
      }

      const imageUrl = String(imageMatch[1] || "").trim();
      if (imageUrl) {
        result.push(
          <img
            key={`img-${keyIndex}-${start}`}
            src={imageUrl}
            alt="chat-image"
            className="chat-inline-image"
            loading="lazy"
          />
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
          {loadingOlderMessages ? t("chat.loading") : t("chat.loadOlder")}
        </button>
        {!messagesHasMore && messages.length > 0 ? (
          <span className="muted">{t("chat.historyLoaded")}</span>
        ) : null}
        {!hasActiveRoom ? (
          <span className="muted">{t("chat.noChannelHint")}</span>
        ) : null}
      </div>
      <div className="chat-log min-h-0 flex-1" ref={chatLogRef}>
        {messages.map((message) => {
          const isOwn = currentUserId === message.user_id;
          const createdAtTs = Number(new Date(message.created_at));
          const canManageOwnMessage = isOwn && Number.isFinite(createdAtTs) && (Date.now() - createdAtTs) <= 10 * 60 * 1000;
          const deliveryClass = message.deliveryStatus === "sending"
            ? "text-[#ffd166]"
            : message.deliveryStatus === "delivered"
              ? "text-[#d4f0ff]"
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
              className={`chat-message grid items-end gap-2 ${isOwn ? "chat-message-own grid-cols-1 justify-items-end" : "grid-cols-[34px_minmax(0,1fr)]"}`}
            >
              {!isOwn ? (
                <div className="chat-avatar inline-flex h-[30px] w-[30px] items-center justify-center" aria-hidden="true">
                  {(message.user_name || "U").charAt(0).toUpperCase()}
                </div>
              ) : null}

              <div className={`chat-bubble-wrap grid max-w-[min(92%,820px)] gap-0.5 ${isOwn ? "justify-items-end" : "justify-items-start"}`}>
                <div className="chat-bubble w-fit min-w-[120px]">
                  <div className="chat-meta flex items-baseline justify-between gap-2">
                    <span className="chat-author">{message.user_name}</span>
                    <span className="chat-time">{formatMessageTime(message.created_at)}</span>
                  </div>
                  <p className="chat-text">{renderMessageText(message.text)}</p>
                  {message.edited_at ? <div className="chat-edited-mark">{t("chat.editedMark")}</div> : null}
                  {canManageOwnMessage ? (
                    <div className="chat-actions-row flex items-center justify-end gap-2">
                      <button type="button" className="secondary tiny" onClick={() => onEditMessage(message.id)}>{t("chat.edit")}</button>
                      <button type="button" className="secondary tiny" onClick={() => onDeleteMessage(message.id)}>{t("chat.delete")}</button>
                    </div>
                  ) : null}
                </div>

                {isOwn && message.deliveryStatus ? (
                  <span className={`delivery ${deliveryClass}`}>
                    {deliveryGlyph}
                  </span>
                ) : null}
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
      <form className="chat-compose mt-3 flex items-center gap-3" onSubmit={onSendMessage}>
        <input
          value={chatText}
          onChange={(event) => onSetChatText(event.target.value)}
          onPaste={onChatPaste}
          onKeyDown={onChatInputKeyDown}
          placeholder={hasActiveRoom ? t("chat.typePlaceholder") : t("chat.selectChannelPlaceholder")}
          disabled={!hasActiveRoom}
        />
        <button type="submit" disabled={!hasActiveRoom}>{editingMessageId ? t("chat.saveEdit") : t("chat.send")}</button>
      </form>
    </section>
  );
}
