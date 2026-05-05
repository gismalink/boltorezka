/**
 * ChatComposerSection.tsx — секция ввода сообщения (композер с вложениями/mentions/quotes).
 *
 * Назначение:
 * - Рендерит textarea, предвьюхи вложений, статусы отправки, mention picker.
 * - Обрабатывает paste/clipboard и выводит сообщения об ошибках (`CHAT_AGENT_FAILURE_REASONS`).
 */
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import {
  CHAT_AGENT_FAILURE_REASONS,
  CHAT_AGENT_IDS,
  CHAT_AGENT_STATUS_STYLE,
  buildChatAgentStatus,
  normalizeChatAgentFailureReason,
  chatAgentMentionOptionId
} from "../../../constants/chatAgentSemantics";
import { Button } from "../../uicomponents";
import { useChatPanelCtx } from "../ChatPanelContext";
import { asTrimmedString } from "../../../utils/stringUtils";

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
  hasActiveRoom: boolean;
  activeTopicIsArchived: boolean;
  editingMessageId: string | null;
  replyingToMessage: { id: string; userName: string; text: string } | null;
  quotedMessage: { userName: string; text: string } | null;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  onCancelQuote: () => void;
  onSendMessage: (event: FormEvent) => void | Promise<void>;
  onSelectAttachmentFiles: (files: File[]) => void;
  onRemovePendingAttachmentAt: (index: number) => void;
  onRetryPendingAttachmentAt: (index: number) => void;
  onClearPendingAttachment: () => void;
  onSetChatText: (value: string) => void;
  onChatPaste: (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onChatInputKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  chatText: string;
  mentionCandidates: MentionCandidate[];
  composePreviewImage: string | null;
  composePendingAttachments: Array<{
    id: string;
    name: string;
    sizeBytes: number;
    uploadState: "queued" | "uploading" | "uploaded" | "failed";
    uploadProgress: number;
  }>;
  attachmentInputRef: RefObject<HTMLInputElement>;
  screenContext: string;
};

export function ChatComposerSection({
  hasActiveRoom,
  activeTopicIsArchived,
  editingMessageId,
  replyingToMessage,
  quotedMessage,
  onCancelEdit,
  onCancelReply,
  onCancelQuote,
  onSendMessage,
  onSelectAttachmentFiles,
  onRemovePendingAttachmentAt,
  onRetryPendingAttachmentAt,
  onClearPendingAttachment,
  onSetChatText,
  onChatPaste,
  onChatInputKeyDown,
  chatText,
  mentionCandidates,
  composePreviewImage,
  composePendingAttachments,
  attachmentInputRef,
  screenContext
}: ChatComposerSectionProps) {
  const COMPOSER_MIN_ROWS = 2;
  const COMPOSER_MAX_ROWS = 5;
  const { t, setPreviewImageUrl, formatAttachmentSize } = useChatPanelCtx();
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [mentionContext, setMentionContext] = useState<MentionContext | null>(null);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [composerStatusText, setComposerStatusText] = useState("");
  const mentionListboxId = "chat-compose-mention-listbox";

  const mentionSuggestions = useMemo(() => {
    if (!mentionContext) {
      return [];
    }

    const normalizedQuery = asTrimmedString(mentionContext.query).toLowerCase();
    const deduped = new Map<string, MentionCandidate>();
    (Array.isArray(mentionCandidates) ? mentionCandidates : []).forEach((candidate) => {
      const key = asTrimmedString(candidate.key);
      const handle = asTrimmedString(candidate.handle).toLowerCase();
      const label = asTrimmedString(candidate.label);
      if (!key || !handle || !label || deduped.has(key)) {
        return;
      }

      deduped.set(key, {
        ...candidate,
        key,
        handle,
        label,
        subtitle: asTrimmedString(candidate.subtitle) || null
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

  const autosizeComposerInput = (input: HTMLTextAreaElement | null) => {
    if (!input) {
      return;
    }

    const style = window.getComputedStyle(input);
    const lineHeight = Number.parseFloat(style.lineHeight || "0") || 20;
    const paddingTop = Number.parseFloat(style.paddingTop || "0") || 0;
    const paddingBottom = Number.parseFloat(style.paddingBottom || "0") || 0;
    const borderTop = Number.parseFloat(style.borderTopWidth || "0") || 0;
    const borderBottom = Number.parseFloat(style.borderBottomWidth || "0") || 0;
    const boxExtras = paddingTop + paddingBottom + borderTop + borderBottom;
    const minHeight = lineHeight * COMPOSER_MIN_ROWS + boxExtras;
    const maxHeight = lineHeight * COMPOSER_MAX_ROWS + boxExtras;

    input.style.height = "auto";
    const targetHeight = Math.min(maxHeight, Math.max(minHeight, input.scrollHeight));
    input.style.height = `${Math.ceil(targetHeight)}px`;
    input.style.overflowY = input.scrollHeight > maxHeight ? "auto" : "hidden";
  };

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
    autosizeComposerInput(messageInputRef.current);
  }, [chatText]);

  const normalizedPendingAttachments = useMemo(
    () => (Array.isArray(composePendingAttachments) ? composePendingAttachments : []).map((item) => ({
      id: asTrimmedString(item?.id),
      name: asTrimmedString(item?.name),
      sizeBytes: Number(item?.sizeBytes || 0),
      uploadState: (item?.uploadState || "queued") as "queued" | "uploading" | "uploaded" | "failed",
      uploadProgress: Math.max(0, Math.min(100, Number(item?.uploadProgress || 0)))
    })).filter((item) => item.name.length > 0),
    [composePendingAttachments]
  );

  const hasPendingComposerAttachment = Boolean(normalizedPendingAttachments.length > 0 || composePreviewImage);

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
        className="chat-compose chat-compose-modern mt-3"
        onSubmit={async (event) => {
          if (!hasActiveRoom || activeTopicIsArchived) {
            event.preventDefault();
            setComposerStatusText(
              buildChatAgentStatus(
                "send",
                "failed",
                !hasActiveRoom ? CHAT_AGENT_FAILURE_REASONS.noActiveRoom : CHAT_AGENT_FAILURE_REASONS.topicArchived
              )
            );
            return;
          }

          const hasText = asTrimmedString(chatText).length > 0;
          const hasAttachment = Boolean(normalizedPendingAttachments.length > 0 || composePreviewImage);
          if (!hasText && !hasAttachment) {
            event.preventDefault();
            setComposerStatusText(buildChatAgentStatus("send", "failed", CHAT_AGENT_FAILURE_REASONS.emptyMessage));
            return;
          }

          const action = editingMessageId ? "edit" : "send";
          setComposerStatusText(buildChatAgentStatus(action, "requested"));
          try {
            await Promise.resolve(onSendMessage(event));
            setComposerStatusText(buildChatAgentStatus(action, "accepted"));
          } catch (error) {
            setComposerStatusText(buildChatAgentStatus(action, "failed", normalizeChatAgentFailureReason(error)));
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
            const files = Array.from(event.currentTarget.files || []);
            onSelectAttachmentFiles(files);
            event.currentTarget.value = "";
            setComposerStatusText(files.length > 0 ? `${t("chat.attach")}: ${files.length}` : `${t("chat.attach")}: cleared`);
          }}
          multiple
          accept="image/*,audio/*,.pdf,.txt,.md,.csv,.zip,.rar,.7z,.tar,.gz,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.exe,.dmg"
          data-agent-id={CHAT_AGENT_IDS.composerAttachmentInput}
        />
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
          <div className="chat-compose-surface">
            {hasPendingComposerAttachment ? (
              <div className="chat-compose-chips" aria-live="polite">
                {composePreviewImage ? (
                  <div className="chat-compose-chip" title={t("chat.openImagePreview")}>
                    <button
                      type="button"
                      className="chat-compose-chip-main"
                      onClick={() => setPreviewImageUrl(composePreviewImage)}
                      aria-label={t("chat.openImagePreview")}
                    >
                      <span className="chat-compose-chip-ext">IMG</span>
                      <span className="chat-compose-chip-name">{t("chat.attachmentDocument")}</span>
                    </button>
                    <Button
                      type="button"
                      className="secondary tiny chat-compose-chip-remove"
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
                {normalizedPendingAttachments.map((attachment, index) => {
                  const dotIndex = attachment.name.lastIndexOf(".");
                  const extensionLabel = dotIndex < 0 || dotIndex === attachment.name.length - 1
                    ? "FILE"
                    : attachment.name.slice(dotIndex).toLowerCase();
                  const sizeLabel = Number.isFinite(attachment.sizeBytes) && attachment.sizeBytes > 0
                    ? formatAttachmentSize(attachment.sizeBytes)
                    : "";
                  const progressLabel = `${Math.max(0, Math.min(100, Math.round(attachment.uploadProgress || 0)))}%`;
                  const showProgress = attachment.uploadState === "uploading" || attachment.uploadState === "uploaded" || attachment.uploadState === "failed";
                  const canRetry = attachment.uploadState === "failed";

                  return (
                    <div className="chat-compose-chip" data-upload-state={attachment.uploadState} key={attachment.id || `${attachment.name}-${index}`} title={attachment.name}>
                      <span className="chat-compose-chip-main">
                        <span className="chat-compose-chip-ext">{extensionLabel}</span>
                        <span className="chat-compose-chip-name">{attachment.name}</span>
                        {sizeLabel ? <span className="chat-compose-chip-size">{sizeLabel}</span> : null}
                        {showProgress ? <span className="chat-compose-chip-progress">{progressLabel}</span> : null}
                      </span>
                      {showProgress ? (
                        <span className="chat-compose-chip-progressbar" aria-hidden="true">
                          <span style={{ width: progressLabel }} />
                        </span>
                      ) : null}
                      {canRetry ? (
                        <Button
                          type="button"
                          className="secondary tiny chat-compose-chip-retry"
                          onClick={() => {
                            onRetryPendingAttachmentAt(index);
                            setComposerStatusText(`${t("chat.retryUpload")}: ${attachment.name}`);
                          }}
                          aria-label={t("chat.retryUpload")}
                          title={t("chat.retryUpload")}
                        >
                          <i className="bi bi-arrow-clockwise" aria-hidden="true" />
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        className="secondary tiny chat-compose-chip-remove"
                        onClick={() => {
                          onRemovePendingAttachmentAt(index);
                          setComposerStatusText(`${t("chat.attach")}: cleared`);
                        }}
                        aria-label={t("chat.clearAttachment")}
                        title={t("chat.clearAttachment")}
                        data-agent-id={CHAT_AGENT_IDS.composerAttachmentClear}
                      >
                        ×
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className="chat-compose-main-row">
              <Button
                type="button"
                className="secondary chat-compose-attach-btn"
                onClick={() => attachmentInputRef.current?.click()}
                disabled={!hasActiveRoom || activeTopicIsArchived}
                aria-label={t("chat.attach")}
                title={t("chat.attach")}
                data-agent-id={CHAT_AGENT_IDS.composerAttach}
              >
                <i className="bi bi-paperclip" aria-hidden="true" />
              </Button>

              <div className="chat-compose-editor-shell">
                <textarea
                  ref={messageInputRef}
                  value={chatText}
                  data-agent-id={CHAT_AGENT_IDS.composerInput}
                  data-agent-state={!hasActiveRoom || activeTopicIsArchived ? "disabled" : "active"}
                  onChange={(event) => {
                    const target = event.target;
                    onSetChatText(target.value);
                    autosizeComposerInput(target);
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

              <Button
                type="submit"
                className="chat-compose-send-btn"
                disabled={!hasActiveRoom || activeTopicIsArchived}
                data-agent-id={CHAT_AGENT_IDS.composerSubmit}
                aria-label={editingMessageId ? t("chat.saveEdit") : t("chat.send")}
                title={editingMessageId ? t("chat.saveEdit") : t("chat.send")}
              >
                {editingMessageId ? t("chat.saveEdit") : <i className="bi bi-send-fill" aria-hidden="true" />}
              </Button>
            </div>
          </div>
        </div>
        <div
          id="chat-compose-context"
          className="muted"
          data-agent-id={CHAT_AGENT_IDS.composerContext}
          style={CHAT_AGENT_STATUS_STYLE}
        >
          {screenContext}
        </div>
      </form>
    </>
  );
}
