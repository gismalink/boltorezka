import { useCallback, useEffect, useRef, type KeyboardEvent, type FormEvent } from "react";
import { useDm } from "./DmContext";

type TranslateFn = (key: string) => string;

export function DmChatPanel({ t }: { t: TranslateFn }) {
  const {
    activeThreadId,
    activePeerName,
    messages,
    messagesHasMore,
    dmText,
    loading,
    closeDm,
    sendDmMessage,
    loadOlderMessages,
    setDmText
  } = useDm();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Скролл к концу при новых сообщениях
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = useCallback(async (event?: FormEvent) => {
    event?.preventDefault();
    if (!dmText.trim()) return;
    await sendDmMessage(dmText);
  }, [dmText, sendDmMessage]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || !messagesHasMore) return;
    if (el.scrollTop < 80) {
      loadOlderMessages();
    }
  }, [messagesHasMore, loadOlderMessages]);

  if (!activeThreadId) return null;

  return (
    <section className="card middle-card relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* ── header ── */}
      <div className="flex items-center gap-2 border-b border-[var(--pixel-border)] px-4 py-2">
        <button
          type="button"
          className="secondary icon-btn tiny"
          onClick={closeDm}
          aria-label={t("actions.back")}
        >
          <i className="bi bi-arrow-left" aria-hidden="true" />
        </button>
        <i className="bi bi-chat-dots text-[var(--pixel-accent)]" aria-hidden="true" />
        <h2 className="m-0 truncate text-sm font-semibold">{activePeerName || "DM"}</h2>
      </div>

      {/* ── messages ── */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-2"
        onScroll={handleScroll}
      >
        {loading ? (
          <div className="flex items-center justify-center py-8 text-[var(--pixel-muted)]">
            <i className="bi bi-hourglass-split" aria-hidden="true" /> <span className="ml-2">{t("chat.loading")}</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-[var(--pixel-muted)]">
            {t("chat.noMessages")}
          </div>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {messages.map((msg) => (
              <li key={msg.id} className="dm-message-row flex flex-col gap-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-[var(--pixel-accent)]">{msg.senderName}</span>
                  <span className="text-[10px] text-[var(--pixel-muted)]">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {msg.editedAt ? (
                    <span className="text-[10px] text-[var(--pixel-muted)]">(ред.)</span>
                  ) : null}
                </div>
                <div className="text-sm whitespace-pre-wrap break-words">{msg.body}</div>
              </li>
            ))}
          </ul>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── composer ── */}
      <form
        className="flex items-end gap-2 border-t border-[var(--pixel-border)] px-4 py-2"
        onSubmit={handleSend}
      >
        <textarea
          className="flex-1 resize-none rounded border border-[var(--pixel-border)] bg-[var(--pixel-surface)] px-3 py-1.5 text-sm text-[var(--pixel-text)] outline-none placeholder:text-[var(--pixel-muted)] focus:border-[var(--pixel-accent)]"
          rows={1}
          placeholder={t("chat.composerPlaceholder")}
          value={dmText}
          onChange={(e) => setDmText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="submit"
          className="secondary icon-btn small"
          disabled={!dmText.trim()}
          aria-label={t("chat.send")}
        >
          <i className="bi bi-send" aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
