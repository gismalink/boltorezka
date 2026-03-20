import { ClipboardEvent, FormEvent, KeyboardEvent, ReactNode, RefObject, useEffect, useMemo, useRef, useState } from "react";
import type { Message } from "../domain";
import { buildChatMessageViewModels } from "../utils/chatMessageViewModel";

type ChatPanelProps = {
  t: (key: string) => string;
  locale: string;
  roomSlug: string;
  roomTitle: string;
  authToken: string;
  messages: Message[];
  currentUserId: string | null;
  messagesHasMore: boolean;
  loadingOlderMessages: boolean;
  chatText: string;
  composePreviewImageUrl: string | null;
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
  authToken,
  messages,
  currentUserId,
  messagesHasMore,
  loadingOlderMessages,
  chatText,
  composePreviewImageUrl,
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
  const [resolvedAttachmentImageUrls, setResolvedAttachmentImageUrls] = useState<Record<string, string>>({});
  const resolvedAttachmentImageUrlsRef = useRef<Record<string, string>>({});
  const hasActiveRoom = Boolean(roomSlug);

  useEffect(() => {
    resolvedAttachmentImageUrlsRef.current = resolvedAttachmentImageUrls;
  }, [resolvedAttachmentImageUrls]);

  useEffect(
    () => () => {
      Object.values(resolvedAttachmentImageUrlsRef.current).forEach((blobUrl) => {
        URL.revokeObjectURL(blobUrl);
      });
    },
    []
  );

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
  const messageViewModels = useMemo(
    () => buildChatMessageViewModels(messages, currentUserId, 10 * 60 * 1000),
    [messages, currentUserId]
  );

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

  const isProtectedAttachmentObjectUrl = (value: string): boolean => {
    if (!value) {
      return false;
    }

    if (value.startsWith("/v1/chat/uploads/object")) {
      return true;
    }

    try {
      const parsed = new URL(value, window.location.origin);
      return parsed.pathname === "/v1/chat/uploads/object";
    } catch {
      return false;
    }
  };

  const protectedAttachmentUrls = useMemo(() => {
    const unique = new Set<string>();

    messages.forEach((message) => {
      const attachments = Array.isArray(message.attachments) ? message.attachments : [];
      attachments
        .filter((item) => String(item.type || "") === "image")
        .map((item) => String(item.download_url || "").trim())
        .filter((url) => url.length > 0)
        .forEach((url) => {
          if (isProtectedAttachmentObjectUrl(url)) {
            unique.add(url);
          }
        });
    });

    return Array.from(unique);
  }, [messages]);

  useEffect(() => {
    const nextProtected = new Set(protectedAttachmentUrls);

    setResolvedAttachmentImageUrls((prev) => {
      let changed = false;
      const next: Record<string, string> = {};

      Object.entries(prev).forEach(([url, blobUrl]) => {
        if (nextProtected.has(url)) {
          next[url] = blobUrl;
          return;
        }

        changed = true;
        URL.revokeObjectURL(blobUrl);
      });

      return changed ? next : prev;
    });

    if (nextProtected.size === 0) {
      return;
    }

    const abortController = new AbortController();
    let cancelled = false;

    const load = async (url: string) => {
      if (resolvedAttachmentImageUrlsRef.current[url]) {
        return;
      }

      const headers: Record<string, string> = {};
      if (authToken) {
        headers.authorization = `Bearer ${authToken}`;
      }

      try {
        const response = await fetch(url, {
          credentials: "include",
          headers,
          signal: abortController.signal
        });

        if (!response.ok) {
          return;
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }

        setResolvedAttachmentImageUrls((prev) => {
          if (prev[url] === blobUrl) {
            return prev;
          }

          if (prev[url]) {
            URL.revokeObjectURL(prev[url]);
          }

          return {
            ...prev,
            [url]: blobUrl
          };
        });
      } catch {
        // Keep original URL fallback if fetch fails.
      }
    };

    void Promise.all(Array.from(nextProtected).map((url) => load(url)));

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [authToken, protectedAttachmentUrls]);

  const resolveAttachmentImageUrl = (url: string): string => {
    return resolvedAttachmentImageUrls[url] || url;
  };

  const renderMessageText = (value: string): ReactNode[] => {
    const text = String(value || "");
    const urlPattern = /((https?:\/\/|www\.)[^\s<]+)/gi;
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
      <div className="chat-log min-h-0 flex-1" ref={chatLogRef}>
        {messageViewModels.map((messageVm) => {
          const attachmentImageUrls = messageVm.attachmentImageUrls;
          const isOwn = messageVm.isOwn;
          const showAuthor = messageVm.showAuthor;
          const showAvatar = messageVm.showAvatar;
          const canManageOwnMessage = messageVm.canManageOwnMessage;
          const deliveryClass = messageVm.deliveryClass;
          const deliveryGlyph = messageVm.deliveryGlyph;

          return (
            <article
              key={messageVm.id}
              className={`chat-message group grid items-end gap-2 ${isOwn ? "chat-message-own grid-cols-1 justify-items-end" : "grid-cols-[34px_minmax(0,1fr)]"}`}
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
                {canManageOwnMessage ? (
                  <div className={`chat-actions-side ${isOwn ? "chat-actions-side-own" : "chat-actions-side-peer"}`}>
                    <button
                      type="button"
                      className="secondary tiny icon-btn"
                      onClick={() => onEditMessage(messageVm.id)}
                      aria-label={t("chat.edit")}
                      title={t("chat.edit")}
                    >
                      <i className="bi bi-pencil-square" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="secondary tiny icon-btn"
                      onClick={() => onDeleteMessage(messageVm.id)}
                      aria-label={t("chat.delete")}
                      title={t("chat.delete")}
                    >
                      <i className="bi bi-trash3" aria-hidden="true" />
                    </button>
                  </div>
                ) : null}

                <div className="chat-bubble w-fit min-w-[120px]">
                  {showAuthor ? (
                    <div className="chat-meta flex items-baseline gap-2">
                      <span className="chat-author">{messageVm.userName}</span>
                    </div>
                  ) : null}
                  <div className="chat-content-row">
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
                  {attachmentImageUrls.length > 0 ? (
                    <div className="chat-attachments-row">
                      {attachmentImageUrls.map((imageUrl) => (
                        <button
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
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {messageVm.editedAt ? <div className="chat-edited-mark">{t("chat.editedMark")}</div> : null}
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
            <img
              src={resolveAttachmentImageUrl(previewImageUrl)}
              alt="chat-image-preview"
              className="chat-image-modal-media"
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
