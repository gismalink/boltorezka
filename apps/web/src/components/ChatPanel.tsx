import { FormEvent, ReactNode, RefObject } from "react";
import type { Message } from "../domain";

type ChatPanelProps = {
  t: (key: string) => string;
  locale: string;
  roomSlug: string;
  messages: Message[];
  currentUserId: string | null;
  messagesHasMore: boolean;
  loadingOlderMessages: boolean;
  chatText: string;
  chatLogRef: RefObject<HTMLDivElement>;
  onLoadOlderMessages: () => void;
  onSetChatText: (value: string) => void;
  onSendMessage: (event: FormEvent) => void;
};

export function ChatPanel({
  t,
  locale,
  roomSlug,
  messages,
  currentUserId,
  messagesHasMore,
  loadingOlderMessages,
  chatText,
  chatLogRef,
  onLoadOlderMessages,
  onSetChatText,
  onSendMessage
}: ChatPanelProps) {
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
    const nodes: ReactNode[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = urlPattern.exec(text)) !== null) {
      const raw = match[0];
      const start = match.index;

      if (start > cursor) {
        nodes.push(text.slice(cursor, start));
      }

      let linkText = raw;
      let trailing = "";
      while (/[.,!?;:)\]]$/.test(linkText)) {
        trailing = linkText.slice(-1) + trailing;
        linkText = linkText.slice(0, -1);
      }

      if (linkText.length > 0) {
        const href = /^https?:\/\//i.test(linkText) ? linkText : `https://${linkText}`;
        nodes.push(
          <a
            key={`link-${start}-${linkText}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="chat-link"
          >
            {linkText}
          </a>
        );
      }

      if (trailing) {
        nodes.push(trailing);
      }

      cursor = start + raw.length;
    }

    if (cursor < text.length) {
      nodes.push(text.slice(cursor));
    }

    return nodes.length > 0 ? nodes : [text];
  };

  return (
    <section className="card middle-card flex min-h-0 flex-col">
      <h2>{t("chat.title")} ({roomSlug})</h2>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="secondary"
          onClick={onLoadOlderMessages}
          disabled={!messagesHasMore || loadingOlderMessages}
        >
          {loadingOlderMessages ? t("chat.loading") : t("chat.loadOlder")}
        </button>
        {!messagesHasMore && messages.length > 0 ? (
          <span className="muted">{t("chat.historyLoaded")}</span>
        ) : null}
      </div>
      <div className="chat-log min-h-0 flex-1" ref={chatLogRef}>
        {messages.map((message) => {
          const isOwn = currentUserId === message.user_id;
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
      <form className="chat-compose mt-3 flex items-center gap-3" onSubmit={onSendMessage}>
        <input value={chatText} onChange={(event) => onSetChatText(event.target.value)} placeholder={t("chat.typePlaceholder")} />
        <button type="submit">{t("chat.send")}</button>
      </form>
    </section>
  );
}
