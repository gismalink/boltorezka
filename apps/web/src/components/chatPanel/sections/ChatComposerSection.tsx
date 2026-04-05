import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { Button } from "../../uicomponents";

type MentionCandidate = {
  userId: string;
  name: string;
  username: string | null;
};

type MentionContext = {
  start: number;
  end: number;
  query: string;
};

function resolveMentionContext(value: string, caret: number): MentionContext | null {
  const normalizedValue = String(value || "");
  const safeCaret = Math.max(0, Math.min(caret, normalizedValue.length));
  const beforeCaret = normalizedValue.slice(0, safeCaret);
  const match = beforeCaret.match(/(?:^|\s)@([\p{L}\p{N}._-]{0,32})$/u);
  if (!match) {
    return null;
  }

  const fullMatch = String(match[0] || "");
  const query = String(match[1] || "");
  const start = safeCaret - fullMatch.length + (fullMatch.startsWith("@") ? 0 : 1);
  if (start < 0 || normalizedValue[start] !== "@") {
    return null;
  }

  return {
    start,
    end: safeCaret,
    query
  };
}

type ChatComposerSectionProps = {
  t: (key: string) => string;
  hasActiveRoom: boolean;
  activeTopicIsArchived: boolean;
  editingMessageId: string | null;
  replyingToMessage: { id: string; userName: string; text: string } | null;
  quotedMessage: { userName: string; text: string } | null;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  onCancelQuote: () => void;
  onSendMessage: (event: FormEvent) => void;
  onSelectAttachmentFile: (file: File | null) => void;
  onClearPendingAttachment: () => void;
  onSetChatText: (value: string) => void;
  onChatPaste: (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onChatInputKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  chatText: string;
  mentionCandidates: MentionCandidate[];
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
  quotedMessage,
  onCancelEdit,
  onCancelReply,
  onCancelQuote,
  onSendMessage,
  onSelectAttachmentFile,
  onClearPendingAttachment,
  onSetChatText,
  onChatPaste,
  onChatInputKeyDown,
  chatText,
  mentionCandidates,
  composePreviewImage,
  composePendingAttachmentName,
  setPreviewImageUrl,
  attachmentInputRef
}: ChatComposerSectionProps) {
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [mentionContext, setMentionContext] = useState<MentionContext | null>(null);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);

  const mentionSuggestions = useMemo(() => {
    if (!mentionContext) {
      return [];
    }

    const normalizedQuery = String(mentionContext.query || "").trim().toLowerCase();
    const deduped = new Map<string, MentionCandidate>();
    (Array.isArray(mentionCandidates) ? mentionCandidates : []).forEach((candidate) => {
      const userId = String(candidate.userId || "").trim();
      const name = String(candidate.name || "").trim();
      if (!userId || !name || deduped.has(userId)) {
        return;
      }

      deduped.set(userId, {
        userId,
        name,
        username: String(candidate.username || "").trim() || null
      });
    });

    const filtered = Array.from(deduped.values()).filter((candidate) => {
      if (!normalizedQuery) {
        return true;
      }

      const name = candidate.name.toLowerCase();
      const username = String(candidate.username || "").toLowerCase();
      return name.includes(normalizedQuery) || (username ? username.includes(normalizedQuery) : false);
    });

    filtered.sort((left, right) => {
      if (!normalizedQuery) {
        return left.name.localeCompare(right.name);
      }

      const leftStarts = left.name.toLowerCase().startsWith(normalizedQuery) || String(left.username || "").toLowerCase().startsWith(normalizedQuery);
      const rightStarts = right.name.toLowerCase().startsWith(normalizedQuery) || String(right.username || "").toLowerCase().startsWith(normalizedQuery);
      if (leftStarts !== rightStarts) {
        return leftStarts ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });

    return filtered.slice(0, 8);
  }, [mentionCandidates, mentionContext]);

  const mentionPickerOpen = mentionContext !== null;

  const updateMentionContext = (value: string, caret: number) => {
    if (!hasActiveRoom || activeTopicIsArchived) {
      if (mentionContext) {
        setMentionContext(null);
      }
      return;
    }

    const nextContext = resolveMentionContext(value, caret);
    setMentionContext(nextContext);
    setMentionSelectedIndex(0);
  };

  const applyMentionCandidate = (candidate: MentionCandidate) => {
    const input = messageInputRef.current;
    if (!input || !mentionContext) {
      return;
    }

    const currentValue = String(input.value || "");
    const beforeMention = currentValue.slice(0, mentionContext.start);
    const afterMention = currentValue.slice(mentionContext.end);
    const insertedMention = `@${candidate.name} `;
    const nextValue = `${beforeMention}${insertedMention}${afterMention}`;
    const nextCaret = beforeMention.length + insertedMention.length;

    onSetChatText(nextValue);
    setMentionContext(null);
    setMentionSelectedIndex(0);

    window.requestAnimationFrame(() => {
      const activeInput = messageInputRef.current;
      if (!activeInput) {
        return;
      }

      activeInput.focus();
      activeInput.setSelectionRange(nextCaret, nextCaret);
    });
  };

  useEffect(() => {
    if ((!replyingToMessage && !quotedMessage) || !hasActiveRoom || activeTopicIsArchived) {
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
  }, [replyingToMessage?.id, quotedMessage?.text, hasActiveRoom, activeTopicIsArchived]);

  useEffect(() => {
    if (!mentionPickerOpen || mentionSuggestions.length > 0) {
      return;
    }

    setMentionSelectedIndex(0);
  }, [mentionPickerOpen, mentionSuggestions.length]);

  useEffect(() => {
    if (hasActiveRoom && !activeTopicIsArchived) {
      return;
    }

    setMentionContext(null);
    setMentionSelectedIndex(0);
  }, [activeTopicIsArchived, hasActiveRoom]);

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
          {quotedMessage ? (
            <div className="chat-reply-banner chat-compose-context-banner flex items-center justify-between gap-3">
              <span>
                {t("chat.replyingToQuote")}
                {" "}
                <strong>{quotedMessage.userName}</strong>
                {": "}
                {String(quotedMessage.text || "").replace(/\s+/g, " ").trim().slice(0, 120)}
              </span>
              <Button type="button" className="secondary tiny" onClick={onCancelQuote}>{t("chat.cancelQuote")}</Button>
            </div>
          ) : null}
          <textarea
            ref={messageInputRef}
            value={chatText}
            onChange={(event) => {
              const target = event.target;
              onSetChatText(target.value);
              const caret = typeof target.selectionStart === "number" ? target.selectionStart : target.value.length;
              updateMentionContext(target.value, caret);
            }}
            onPaste={onChatPaste}
            onKeyDown={(event) => {
              if (mentionPickerOpen && mentionSuggestions.length > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setMentionSelectedIndex((prev) => (prev + 1) % mentionSuggestions.length);
                  return;
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setMentionSelectedIndex((prev) => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length);
                  return;
                }

                if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
                  event.preventDefault();
                  const selectedCandidate = mentionSuggestions[Math.max(0, Math.min(mentionSelectedIndex, mentionSuggestions.length - 1))];
                  if (selectedCandidate) {
                    applyMentionCandidate(selectedCandidate);
                  }
                  return;
                }
              }

              if (event.key === "Escape" && mentionPickerOpen) {
                event.preventDefault();
                setMentionContext(null);
                return;
              }

              onChatInputKeyDown(event);

              if (event.defaultPrevented) {
                return;
              }

              window.requestAnimationFrame(() => {
                const input = messageInputRef.current;
                if (!input) {
                  return;
                }

                const caret = typeof input.selectionStart === "number" ? input.selectionStart : input.value.length;
                updateMentionContext(input.value, caret);
              });
            }}
            onClick={(event) => {
              const target = event.currentTarget;
              const caret = typeof target.selectionStart === "number" ? target.selectionStart : target.value.length;
              updateMentionContext(target.value, caret);
            }}
            rows={2}
            placeholder={hasActiveRoom ? (activeTopicIsArchived ? t("chat.topicArchivedReadOnly") : t("chat.typePlaceholder")) : t("chat.selectChannelPlaceholder")}
            disabled={!hasActiveRoom || activeTopicIsArchived}
            aria-label={t("chat.composeAria")}
          />
          {mentionPickerOpen ? (
            <div className="chat-mention-picker" role="listbox" aria-label={t("chat.mentionSuggestionsAria")}>
              {mentionSuggestions.length > 0 ? mentionSuggestions.map((candidate, index) => (
                <button
                  key={candidate.userId}
                  type="button"
                  className={`chat-mention-picker-item ${index === mentionSelectedIndex ? "chat-mention-picker-item-active" : ""}`}
                  role="option"
                  aria-selected={index === mentionSelectedIndex}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applyMentionCandidate(candidate);
                  }}
                >
                  <span className="chat-mention-picker-name">{candidate.name}</span>
                  {candidate.username ? <span className="chat-mention-picker-username">@{candidate.username}</span> : null}
                </button>
              )) : (
                <div className="chat-mention-picker-empty">{t("chat.mentionNoMatches")}</div>
              )}
            </div>
          ) : null}
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
