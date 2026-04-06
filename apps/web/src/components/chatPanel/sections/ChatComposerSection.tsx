import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import {
  CHAT_AGENT_IDS,
  CHAT_AGENT_STATUS_STYLE,
  chatAgentMentionOptionId
} from "../../../constants/chatAgentSemantics";
import { Button } from "../../uicomponents";

type MentionCandidate = {
  key: string;
  kind: "user" | "tag" | "all";
  handle: string;
  label: string;
  subtitle?: string | null;
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
  onSendMessage: (event: FormEvent) => void | Promise<void>;
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
  screenContext: string;
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
  attachmentInputRef,
  screenContext
}: ChatComposerSectionProps) {
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [mentionContext, setMentionContext] = useState<MentionContext | null>(null);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [composerStatusText, setComposerStatusText] = useState("");
  const mentionListboxId = "chat-compose-mention-listbox";

  const statusErrorReason = (error: unknown): string => {
    const text = String((error as { message?: string } | null)?.message || error || "unknown")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9._-]/g, "");
    return text || "unknown";
  };

  const mentionSuggestions = useMemo(() => {
    if (!mentionContext) {
      return [];
    }

    const normalizedQuery = String(mentionContext.query || "").trim().toLowerCase();
    const deduped = new Map<string, MentionCandidate>();
    (Array.isArray(mentionCandidates) ? mentionCandidates : []).forEach((candidate) => {
      const key = String(candidate.key || "").trim();
      const handle = String(candidate.handle || "").trim().toLowerCase();
      const label = String(candidate.label || "").trim();
      if (!key || !handle || !label || deduped.has(key)) {
        return;
      }

      deduped.set(key, {
        ...candidate,
        key,
        handle,
        label,
        subtitle: String(candidate.subtitle || "").trim() || null
      });
    });

    const filtered = Array.from(deduped.values()).filter((candidate) => {
      if (!normalizedQuery) {
        return true;
      }

      const handle = candidate.handle.toLowerCase();
      const label = candidate.label.toLowerCase();
      const subtitle = String(candidate.subtitle || "").toLowerCase();
      return handle.includes(normalizedQuery) || label.includes(normalizedQuery) || subtitle.includes(normalizedQuery);
    });

    filtered.sort((left, right) => {
      if (!normalizedQuery) {
        const leftRank = left.kind === "all" ? 0 : left.kind === "tag" ? 1 : 2;
        const rightRank = right.kind === "all" ? 0 : right.kind === "tag" ? 1 : 2;
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }

        return left.label.localeCompare(right.label);
      }

      const leftStarts = left.handle.startsWith(normalizedQuery) || left.label.toLowerCase().startsWith(normalizedQuery);
      const rightStarts = right.handle.startsWith(normalizedQuery) || right.label.toLowerCase().startsWith(normalizedQuery);
      if (leftStarts !== rightStarts) {
        return leftStarts ? -1 : 1;
      }

      return left.label.localeCompare(right.label);
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
    const insertedMention = `@${candidate.handle} `;
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

  useEffect(() => {
    if (!hasActiveRoom) {
      setComposerStatusText(t("chat.selectChannelPlaceholder"));
      return;
    }

    if (activeTopicIsArchived) {
      setComposerStatusText(t("chat.topicArchivedReadOnly"));
      return;
    }

    setComposerStatusText(`${t("chat.send")}: ready`);
  }, [activeTopicIsArchived, hasActiveRoom, t]);

  return (
    <>
      <form
        className="chat-compose mt-3 flex items-end gap-3"
        onSubmit={async (event) => {
          if (!hasActiveRoom || activeTopicIsArchived) {
            event.preventDefault();
            setComposerStatusText(!hasActiveRoom ? "send:failed:no-active-room" : "send:failed:topic-archived");
            return;
          }

          const hasText = String(chatText || "").trim().length > 0;
          const hasAttachment = Boolean(composePendingAttachmentName || composePreviewImage);
          if (!hasText && !hasAttachment) {
            event.preventDefault();
            setComposerStatusText("send:failed:empty-message");
            return;
          }

          const action = editingMessageId ? "edit" : "send";
          setComposerStatusText(`${action}:requested`);
          try {
            await Promise.resolve(onSendMessage(event));
            setComposerStatusText(`${action}:accepted`);
          } catch (error) {
            setComposerStatusText(`${action}:failed:${statusErrorReason(error)}`);
          }
        }}
        data-agent-id={CHAT_AGENT_IDS.composer}
        data-agent-screen-context={screenContext}
      >
        <div
          className="chat-topic-read-status"
          role="status"
          aria-live="polite"
          data-agent-id={CHAT_AGENT_IDS.composerStatus}
          style={CHAT_AGENT_STATUS_STYLE}
        >
          {composerStatusText}
        </div>
        <input
          ref={attachmentInputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] || null;
            onSelectAttachmentFile(file);
            event.currentTarget.value = "";
            setComposerStatusText(file ? `${t("chat.attach")}: ${file.name}` : `${t("chat.attach")}: cleared`);
          }}
          accept="image/*,audio/*,.pdf,.txt,.csv,.zip"
          data-agent-id={CHAT_AGENT_IDS.composerAttachmentInput}
        />
        <Button
          type="button"
          className="secondary"
          onClick={() => attachmentInputRef.current?.click()}
          disabled={!hasActiveRoom || activeTopicIsArchived}
          aria-label={t("chat.attach")}
          title={t("chat.attach")}
          data-agent-id={CHAT_AGENT_IDS.composerAttach}
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
          <div className="chat-compose-editor-shell">
            <textarea
              ref={messageInputRef}
              value={chatText}
              data-agent-id={CHAT_AGENT_IDS.composerInput}
              data-agent-state={!hasActiveRoom || activeTopicIsArchived ? "disabled" : "active"}
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
              aria-describedby="chat-compose-context"
              aria-controls={mentionPickerOpen ? mentionListboxId : undefined}
              aria-expanded={mentionPickerOpen}
            />
            {mentionPickerOpen ? (
              <div
                className="chat-mention-picker"
                id={mentionListboxId}
                role="listbox"
                aria-label={t("chat.mentionSuggestionsAria")}
                data-agent-id={CHAT_AGENT_IDS.composerMentionPicker}
              >
                {mentionSuggestions.length > 0 ? mentionSuggestions.map((candidate, index) => (
                  <button
                    key={candidate.key}
                    type="button"
                    className={`chat-mention-picker-item ${index === mentionSelectedIndex ? "chat-mention-picker-item-active" : ""}`}
                    role="option"
                    aria-selected={index === mentionSelectedIndex}
                    data-agent-id={chatAgentMentionOptionId(candidate.handle)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applyMentionCandidate(candidate);
                    }}
                  >
                    <span className="chat-mention-picker-name">{candidate.label}</span>
                    <span className="chat-mention-picker-username">@{candidate.handle}</span>
                    {candidate.subtitle ? <span className="chat-mention-picker-subtitle">{candidate.subtitle}</span> : null}
                  </button>
                )) : (
                  <div className="chat-mention-picker-empty">{t("chat.mentionNoMatches")}</div>
                )}
              </div>
            ) : null}
          </div>
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
              onClick={() => {
                onClearPendingAttachment();
                setComposerStatusText(`${t("chat.attach")}: cleared`);
              }}
              aria-label={t("chat.clearAttachment")}
              title={t("chat.clearAttachment")}
              data-agent-id={CHAT_AGENT_IDS.composerAttachmentClear}
            >
              ×
            </Button>
          </div>
        ) : null}
        <div
          id="chat-compose-context"
          className="muted"
          data-agent-id={CHAT_AGENT_IDS.composerContext}
          style={CHAT_AGENT_STATUS_STYLE}
        >
          {screenContext}
        </div>
        <Button type="submit" disabled={!hasActiveRoom || activeTopicIsArchived} data-agent-id={CHAT_AGENT_IDS.composerSubmit}>{editingMessageId ? t("chat.saveEdit") : t("chat.send")}</Button>
      </form>
    </>
  );
}
