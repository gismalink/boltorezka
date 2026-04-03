import { type ReactNode, type RefObject } from "react";
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
  contextMenuMessageId: string | null;
  setContextMenuMessageId: (value: string | null | ((prev: string | null) => string | null)) => void;
  onReplyMessage: (messageId: string) => void;
  onEditMessage: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReportMessage: (messageId: string) => void;
  onTogglePinMessage: (messageId: string) => void;
  onToggleThumbsUpReaction: (messageId: string) => void;
  insertMentionToComposer: (userName: string) => void;
  insertQuoteToComposer: (userName: string, text: string) => void;
  markTopicUnreadFromMessage: (messageId: string) => Promise<void>;
  markReadSaving: boolean;
  formatMessageTime: (value: string) => string;
  renderMessageText: (value: string) => ReactNode[];
  extractFirstLinkPreview: (value: string) => { href: string; host: string; path: string } | null;
  resolveAttachmentImageUrl: (url: string) => string;
  formatAttachmentSize: (bytes: number) => string;
  setPreviewImageUrl: (value: string | null) => void;
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
  contextMenuMessageId,
  setContextMenuMessageId,
  onReplyMessage,
  onEditMessage,
  onDeleteMessage,
  onReportMessage,
  onTogglePinMessage,
  onToggleThumbsUpReaction,
  insertMentionToComposer,
  insertQuoteToComposer,
  markTopicUnreadFromMessage,
  markReadSaving,
  formatMessageTime,
  renderMessageText,
  extractFirstLinkPreview,
  resolveAttachmentImageUrl,
  formatAttachmentSize,
  setPreviewImageUrl
}: ChatMessageTimelineProps) {
  const closeContextMenu = () => {
    setContextMenuMessageId(null);
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
        const linkPreview = extractFirstLinkPreview(messageVm.text);

        return (
          <article
            key={messageVm.id}
            data-message-id={messageVm.id}
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
              {hasActiveRoom ? (
                <div className={`chat-actions-side ${isOwn ? "chat-actions-side-own" : "chat-actions-side-peer"}`}>
                  <Button
                    type="button"
                    className="secondary tiny icon-btn chat-context-menu-toggle"
                    onClick={() => setContextMenuMessageId((prev) => (prev === messageVm.id ? null : messageVm.id))}
                    aria-label={t("chat.messageActions")}
                    title={t("chat.messageActions")}
                    aria-haspopup="menu"
                    aria-expanded={contextMenuMessageId === messageVm.id}
                    aria-controls={`chat-message-menu-${messageVm.id}`}
                  >
                    <i className="bi bi-three-dots" aria-hidden="true" />
                  </Button>
                  {contextMenuMessageId === messageVm.id ? (
                    <div className="chat-context-menu" id={`chat-message-menu-${messageVm.id}`} role="menu" aria-label={t("chat.messageActions")}>
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
                      <Button
                        type="button"
                        className="secondary tiny"
                        role="menuitem"
                        onClick={() => {
                          onToggleThumbsUpReaction(messageVm.id);
                          closeContextMenu();
                        }}
                      >
                        {t("chat.react")}
                      </Button>
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
                  ) : null}
                  <Button
                    type="button"
                    className="secondary tiny icon-btn"
                    onClick={() => onReplyMessage(messageVm.id)}
                    aria-label={t("chat.reply")}
                    title={t("chat.reply")}
                  >
                    <i className="bi bi-reply" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    className="secondary tiny icon-btn"
                    onClick={() => insertMentionToComposer(messageVm.userName)}
                    aria-label={t("chat.mention")}
                    title={t("chat.mention")}
                  >
                    <i className="bi bi-at" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    className="secondary tiny icon-btn"
                    onClick={() => insertQuoteToComposer(messageVm.userName, messageVm.text)}
                    aria-label={t("chat.quote")}
                    title={t("chat.quote")}
                  >
                    <i className="bi bi-blockquote-left" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    className="secondary tiny icon-btn"
                    onClick={() => void markTopicUnreadFromMessage(messageVm.id)}
                    aria-label={t("chat.markUnreadFromHere")}
                    title={t("chat.markUnreadFromHere")}
                    disabled={!activeTopicId || markReadSaving}
                  >
                    <i className="bi bi-envelope-open" aria-hidden="true" />
                  </Button>
                  {!isOwn ? (
                    <Button
                      type="button"
                      className="secondary tiny icon-btn"
                      onClick={() => onReportMessage(messageVm.id)}
                      aria-label={t("chat.reportMessage")}
                      title={t("chat.reportMessage")}
                    >
                      <i className="bi bi-flag" aria-hidden="true" />
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    className="secondary tiny icon-btn"
                    onClick={() => onTogglePinMessage(messageVm.id)}
                    aria-label={isPinned ? t("chat.unpin") : t("chat.pin")}
                    title={isPinned ? t("chat.unpin") : t("chat.pin")}
                  >
                    <i className={`bi ${isPinned ? "bi-pin-angle-fill" : "bi-pin-angle"}`} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    className="secondary tiny icon-btn"
                    onClick={() => onToggleThumbsUpReaction(messageVm.id)}
                    aria-label={t("chat.react")}
                    title={t("chat.react")}
                  >
                    <i className={`bi ${hasThumbsUp ? "bi-hand-thumbs-up-fill" : "bi-hand-thumbs-up"}`} aria-hidden="true" />
                  </Button>
                  {canManageOwnMessage ? (
                    <>
                      <Button
                        type="button"
                        className="secondary tiny icon-btn"
                        onClick={() => onEditMessage(messageVm.id)}
                        aria-label={t("chat.edit")}
                        title={t("chat.edit")}
                      >
                        <i className="bi bi-pencil-square" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        className="secondary tiny icon-btn"
                        onClick={() => onDeleteMessage(messageVm.id)}
                        aria-label={t("chat.delete")}
                        title={t("chat.delete")}
                      >
                        <i className="bi bi-trash3" aria-hidden="true" />
                      </Button>
                    </>
                  ) : null}
                </div>
              ) : null}

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
                {isPinned || hasThumbsUp ? (
                  <div className="chat-reactions-row">
                    {isPinned ? <span className="chat-reaction-chip">{t("chat.pin")}</span> : null}
                    {hasThumbsUp ? <span className="chat-reaction-chip">👍</span> : null}
                  </div>
                ) : null}
                {messageVm.editedAt ? <div className="chat-edited-mark">{t("chat.editedMark")}</div> : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
