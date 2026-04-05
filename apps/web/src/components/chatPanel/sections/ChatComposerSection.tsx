import { useEffect, useRef, type ClipboardEvent, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { Button } from "../../uicomponents";

type ChatComposerSectionProps = {
  t: (key: string) => string;
  hasActiveRoom: boolean;
  activeTopicIsArchived: boolean;
  editingMessageId: string | null;
  replyingToMessage: { id: string; userName: string; text: string } | null;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  onSendMessage: (event: FormEvent) => void;
  onSelectAttachmentFile: (file: File | null) => void;
  onClearPendingAttachment: () => void;
  onSetChatText: (value: string) => void;
  onChatPaste: (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onChatInputKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  chatText: string;
  composePreviewImage: string | null;
  composePendingAttachmentName: string | null;
  setPreviewImageUrl: (value: string | null) => void;
  attachmentInputRef: RefObject<HTMLInputElement>;
};

export function ChatComposerSection({
  t,
  hasActiveRoom,
  activeTopicIsArchived,
  editingMessageId,
  replyingToMessage,
  onCancelEdit,
  onCancelReply,
  onSendMessage,
  onSelectAttachmentFile,
  onClearPendingAttachment,
  onSetChatText,
  onChatPaste,
  onChatInputKeyDown,
  chatText,
  composePreviewImage,
  composePendingAttachmentName,
  setPreviewImageUrl,
  attachmentInputRef
}: ChatComposerSectionProps) {
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!replyingToMessage || !hasActiveRoom || activeTopicIsArchived) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const input = messageInputRef.current;
      if (!input) {
        return;
      }

      input.focus();
      const caretPosition = input.value.length;
      input.setSelectionRange(caretPosition, caretPosition);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [replyingToMessage?.id, hasActiveRoom, activeTopicIsArchived]);

  return (
    <>
      <form className="chat-compose mt-3 flex items-end gap-3" onSubmit={onSendMessage}>
        <input
          ref={attachmentInputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] || null;
            onSelectAttachmentFile(file);
            event.currentTarget.value = "";
          }}
          accept="image/*,audio/*,.pdf,.txt,.csv,.zip"
        />
        <Button
          type="button"
          className="secondary"
          onClick={() => attachmentInputRef.current?.click()}
          disabled={!hasActiveRoom || activeTopicIsArchived}
          aria-label={t("chat.attach")}
          title={t("chat.attach")}
        >
          <i className="bi bi-paperclip" aria-hidden="true" />
        </Button>
        <div className="chat-compose-input-stack">
          {editingMessageId ? (
            <div className="chat-edit-banner chat-compose-context-banner flex items-center justify-between gap-3">
              <span>{t("chat.editingNow")}</span>
              <Button type="button" className="secondary tiny" onClick={onCancelEdit}>{t("chat.cancelEdit")}</Button>
            </div>
          ) : null}
          {replyingToMessage ? (
            <div className="chat-reply-banner chat-compose-context-banner flex items-center justify-between gap-3">
              <span>
                {t("chat.replyingTo")}
                {" "}
                <strong>{replyingToMessage.userName}</strong>
                {": "}
                {String(replyingToMessage.text || "").replace(/\s+/g, " ").trim().slice(0, 120)}
              </span>
              <Button type="button" className="secondary tiny" onClick={onCancelReply}>{t("chat.cancelReply")}</Button>
            </div>
          ) : null}
          <textarea
            ref={messageInputRef}
            value={chatText}
            onChange={(event) => onSetChatText(event.target.value)}
            onPaste={onChatPaste}
            onKeyDown={onChatInputKeyDown}
            rows={2}
            placeholder={hasActiveRoom ? (activeTopicIsArchived ? t("chat.topicArchivedReadOnly") : t("chat.typePlaceholder")) : t("chat.selectChannelPlaceholder")}
            disabled={!hasActiveRoom || activeTopicIsArchived}
            aria-label={t("chat.composeAria")}
          />
        </div>
        {composePreviewImage ? (
          <Button
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
          </Button>
        ) : null}
        {composePendingAttachmentName ? (
          <div className="chat-compose-attachment-pill" title={composePendingAttachmentName}>
            <span className="chat-compose-attachment-name">{composePendingAttachmentName}</span>
            <Button
              type="button"
              className="secondary tiny"
              onClick={onClearPendingAttachment}
              aria-label={t("chat.clearAttachment")}
              title={t("chat.clearAttachment")}
            >
              ×
            </Button>
          </div>
        ) : null}
        <Button type="submit" disabled={!hasActiveRoom || activeTopicIsArchived}>{editingMessageId ? t("chat.saveEdit") : t("chat.send")}</Button>
      </form>
    </>
  );
}
