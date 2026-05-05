// Purpose: keep composer behavior/state transitions in one hook (send/edit/delete/reply/paste/typing).
import {
  startTransition,
  useCallback,
  useEffect,
  useState,
  type ClipboardEvent,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type SetStateAction
} from "react";
import type { Message, MessagesCursor, User } from "../../domain";
import { sendChatMessage, type ChatController } from "../../services";
import {
  runChatDelete,
  runChatReport,
  runChatTogglePin,
  runChatToggleReaction,
  type SendWsEventAwaitAckFn,
  type SendWsEventFn
} from "../../services/chatTransportCommands";
import {
  compressImageToDataUrl,
  extractImageSourceFromClipboardHtml,
  extractImageSourceFromClipboardText,
  normalizeImageSource,
  type ChatImagePolicy
} from "../../utils/chatImagePayload";
import { getErrorCode } from "../../services/chatErrorUtils";
import { asTrimmedString } from "../../utils/stringUtils";

type UseChatComposerActionsParams = {
  chatRoomSlug: string;
  activeTopicId: string | null;
  setChatRoomSlug: (value: string) => void;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setMessagesHasMore: (value: boolean) => void;
  setMessagesNextCursor: (cursor: MessagesCursor | null) => void;
  user: User | null;
  authToken: string;
  chatText: string;
  setChatText: (value: string) => void;
  editingMessageId: string | null;
  setEditingMessageId: (value: string | null) => void;
  replyingToMessageId: string | null;
  setReplyingToMessageId: (value: string | null) => void;
  pendingChatImageDataUrl: string | null;
  setPendingChatImageDataUrl: (value: string | null) => void;
  chatController: ChatController;
  sendWsEvent: SendWsEventFn;
  sendWsEventAwaitAck: SendWsEventAwaitAckFn;
  sendChatTypingState: (targetRoomSlug: string, isTyping: boolean) => void;
  pushToast: (message: string) => void;
  selectChannelPlaceholderMessage: string;
  serverErrorMessage: string;
  maxChatRetries: number;
  messageEditDeleteWindowMs: number;
  serverChatImagePolicy: ChatImagePolicy;
  chatImageTooLargeMessage: string;
  topicImageUploadUnsupportedMessage: string;
  topicOnlyActionMessage: string;
  reportMessageSentMessage: string;
  reportMessageExistsMessage: string;
  attachmentTooLargeMessage: string;
  attachmentUnsupportedTypeMessage: string;
  mentionCandidates: Array<{
    key: string;
    kind: "user" | "tag" | "all";
    handle: string;
    label: string;
    userId?: string;
    userIds?: string[];
  }>;
};

type MentionCandidate = UseChatComposerActionsParams["mentionCandidates"][number];

function resolveMentionUserIdsFromText(
  text: string,
  candidates: MentionCandidate[]
): string[] {
  const normalizedText = String(text || "");
  if (!normalizedText.trim()) {
    return [];
  }

  const handlePattern = /@([\p{L}\p{N}._-]{2,32})/gu;
  const handles = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = handlePattern.exec(normalizedText)) !== null) {
    const handle = asTrimmedString(match[1]).toLowerCase();
    if (handle && handle !== "all" && handle !== "here") {
      handles.add(handle);
    }
  }

  if (handles.size === 0) {
    return [];
  }

  const mentionedUserIds = new Set<string>();
  const seen = new Set<string>();
  candidates.forEach((candidate) => {
    const handle = asTrimmedString(candidate.handle).toLowerCase();
    if (!handle || !handles.has(handle)) {
      return;
    }

    if (candidate.kind === "all") {
      return;
    }

    if (candidate.kind === "user") {
      const userId = asTrimmedString(candidate.userId);
      if (!userId || seen.has(userId)) {
        return;
      }

      seen.add(userId);
      mentionedUserIds.add(userId);
      return;
    }

    const targetUserIds = Array.isArray(candidate.userIds) ? candidate.userIds : [];
    targetUserIds.forEach((value) => {
      const userId = asTrimmedString(value);
      if (!userId || seen.has(userId)) {
        return;
      }

      seen.add(userId);
      mentionedUserIds.add(userId);
    });
  });

  return Array.from(mentionedUserIds);
}

export function useChatComposerActions({
  chatRoomSlug,
  activeTopicId,
  setChatRoomSlug,
  messages,
  setMessages,
  setMessagesHasMore,
  setMessagesNextCursor,
  user,
  authToken,
  chatText,
  setChatText,
  editingMessageId,
  setEditingMessageId,
  replyingToMessageId,
  setReplyingToMessageId,
  pendingChatImageDataUrl,
  setPendingChatImageDataUrl,
  chatController,
  sendWsEvent,
  sendWsEventAwaitAck,
  sendChatTypingState,
  pushToast,
  selectChannelPlaceholderMessage,
  serverErrorMessage,
  maxChatRetries,
  messageEditDeleteWindowMs,
  serverChatImagePolicy,
  chatImageTooLargeMessage,
  topicImageUploadUnsupportedMessage,
  topicOnlyActionMessage,
  reportMessageSentMessage,
  reportMessageExistsMessage,
  attachmentTooLargeMessage,
  attachmentUnsupportedTypeMessage,
  mentionCandidates
}: UseChatComposerActionsParams) {
  const [pinnedByMessageId, setPinnedByMessageId] = useState<Record<string, boolean>>({});
  const [reactionsByMessageId, setReactionsByMessageId] = useState<
    Record<string, Record<string, { count: number; reacted: boolean }>>
  >({});
  const [pendingChatAttachmentFiles, setPendingChatAttachmentFiles] = useState<File[]>([]);

  useEffect(() => {
    const existingIds = new Set(messages.map((item) => item.id));

    setPinnedByMessageId((prev) => {
      const next: Record<string, boolean> = {};
      Object.entries(prev).forEach(([messageId, pinned]) => {
        if (existingIds.has(messageId) && pinned) {
          next[messageId] = true;
        }
      });
      return next;
    });
  }, [messages]);

  useEffect(() => {
    setReactionsByMessageId((prev) => {
      const next: Record<string, Record<string, { count: number; reacted: boolean }>> = {};

      messages.forEach((message) => {
        const messageId = asTrimmedString(message.id);
        if (!messageId) {
          return;
        }

        const serverReactions = Array.isArray(message.reactions) ? message.reactions : null;
        if (!serverReactions) {
          if (prev[messageId]) {
            next[messageId] = prev[messageId];
          }
          return;
        }

        const normalized: Record<string, { count: number; reacted: boolean }> = {};
        serverReactions.forEach((reaction) => {
          const emoji = asTrimmedString(reaction?.emoji);
          if (!emoji) {
            return;
          }

          const count = Math.max(0, Number(reaction?.count || 0));
          if (count <= 0) {
            return;
          }

          normalized[emoji] = {
            count,
            reacted: Boolean(reaction?.reacted)
          };
        });

        if (Object.keys(normalized).length > 0) {
          next[messageId] = normalized;
        }
      });

      return next;
    });
  }, [messages]);
  const canManageOwnMessage = useCallback((message: Message) => {
    if (!user || message.user_id !== user.id) {
      return false;
    }

    const createdAtTs = Number(new Date(message.created_at));
    if (!Number.isFinite(createdAtTs)) {
      return false;
    }

    return Date.now() - createdAtTs <= messageEditDeleteWindowMs;
  }, [messageEditDeleteWindowMs, user]);

  const sendMessage = useCallback((event: FormEvent) => {
    event.preventDefault();
    void (async () => {
      const result = await sendChatMessage({
        authToken,
        chatRoomSlug,
        activeTopicId,
        replyingToMessageId,
        chatText,
        mentionUserIds: resolveMentionUserIdsFromText(chatText, mentionCandidates),
        editingMessageId,
        pendingChatImageDataUrl,
        pendingChatAttachmentFiles,
        user,
        maxChatRetries,
        maxDataUrlLength: serverChatImagePolicy.maxDataUrlLength,
        chatController,
        sendWsEvent,
        sendWsEventAwaitAck
      });

      if (result.kind === "no-room") {
        pushToast(selectChannelPlaceholderMessage);
        return;
      }

      if (result.kind === "empty") {
        return;
      }

      if (result.kind === "too-large") {
        pushToast(chatImageTooLargeMessage);
        return;
      }

      if (result.kind === "attachment-too-large") {
        pushToast(attachmentTooLargeMessage);
        return;
      }

      if (result.kind === "attachment-unsupported-type") {
        pushToast(attachmentUnsupportedTypeMessage);
        return;
      }

      if (result.kind === "topic-image-unsupported") {
        pushToast(topicImageUploadUnsupportedMessage);
        return;
      }

      if (result.kind === "server-error") {
        pushToast(serverErrorMessage);
        return;
      }

      setChatText("");
      setPendingChatImageDataUrl(null);
      setPendingChatAttachmentFiles((prev) => (prev.length > 1 ? prev.slice(1) : []));
      if (result.mode === "edit") {
        setEditingMessageId(null);
      }
      if (result.mode === "reply") {
        setReplyingToMessageId(null);
      }
      sendChatTypingState(chatRoomSlug, false);
      // B3: после успешной отправки своего сообщения сообщаем UI чата,
      // чтобы он принудительно проскроллил к низу (гейт shouldStickToBottom не должен мешать).
      if (typeof window !== "undefined" && result.mode !== "edit") {
        window.dispatchEvent(new CustomEvent("datowave:chat:own-send"));
      }
    })();
  }, [
    authToken,
    chatController,
    chatImageTooLargeMessage,
    attachmentTooLargeMessage,
    attachmentUnsupportedTypeMessage,
    topicImageUploadUnsupportedMessage,
    mentionCandidates,
    activeTopicId,
    replyingToMessageId,
    chatRoomSlug,
    chatText,
    editingMessageId,
    maxChatRetries,
    pendingChatAttachmentFiles,
    pendingChatImageDataUrl,
    pushToast,
    selectChannelPlaceholderMessage,
    sendChatTypingState,
    sendWsEvent,
    sendWsEventAwaitAck,
    serverChatImagePolicy,
    serverErrorMessage,
    setChatText,
    setEditingMessageId,
    setReplyingToMessageId,
    setPendingChatAttachmentFiles,
    setPendingChatImageDataUrl,
    user
  ]);

  const handleChatPaste = useCallback((event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!chatRoomSlug) {
      return;
    }

    const clipboard = event.clipboardData;
    const files = Array.from(clipboard?.files || []);
    const imageFile = files.find((file) => file.type.startsWith("image/"))
      || Array.from(clipboard?.items || [])
        .map((item) => item.getAsFile())
        .find((file): file is File => Boolean(file && file.type.startsWith("image/")));

    const htmlImageSource = normalizeImageSource(extractImageSourceFromClipboardHtml(String(clipboard?.getData("text/html") || "")));
    const textImageSource = normalizeImageSource(extractImageSourceFromClipboardText(String(clipboard?.getData("text/plain") || "")));
    const hasImagePayload = Boolean(imageFile || htmlImageSource || textImageSource);
    if (!hasImagePayload) {
      return;
    }

    event.preventDefault();
    void (async () => {
      try {
        if (imageFile) {
          const dataUrl = await compressImageToDataUrl(imageFile, serverChatImagePolicy);
          setPendingChatImageDataUrl(dataUrl);
          setPendingChatAttachmentFiles([]);
          return;
        }

        if (htmlImageSource.startsWith("data:image/")) {
          const response = await fetch(htmlImageSource);
          const blob = await response.blob();
          const synthesizedFile = new File([blob], "clipboard-image", { type: blob.type || "image/png" });
          const dataUrl = await compressImageToDataUrl(synthesizedFile, serverChatImagePolicy);
          setPendingChatImageDataUrl(dataUrl);
          setPendingChatAttachmentFiles([]);
          return;
        }

        if (/^https?:\/\//i.test(htmlImageSource)) {
          setPendingChatImageDataUrl(htmlImageSource);
          setPendingChatAttachmentFiles([]);
          return;
        }

        if (textImageSource.startsWith("data:image/")) {
          const response = await fetch(textImageSource);
          const blob = await response.blob();
          const synthesizedFile = new File([blob], "clipboard-image", { type: blob.type || "image/png" });
          const dataUrl = await compressImageToDataUrl(synthesizedFile, serverChatImagePolicy);
          setPendingChatImageDataUrl(dataUrl);
          setPendingChatAttachmentFiles([]);
          return;
        }

        pushToast(chatImageTooLargeMessage);
      } catch {
        pushToast(chatImageTooLargeMessage);
      }
    })();
  }, [chatImageTooLargeMessage, chatRoomSlug, pushToast, serverChatImagePolicy, setPendingChatAttachmentFiles, setPendingChatImageDataUrl]);

  const selectAttachmentFiles = useCallback((files: File[]) => {
    if (!Array.isArray(files) || files.length === 0) {
      return;
    }

    const normalizedFiles = files.filter((file): file is File => file instanceof File && Number(file.size || 0) > 0);
    if (normalizedFiles.length === 0) {
      return;
    }

    setPendingChatImageDataUrl(null);
    setPendingChatAttachmentFiles((prev) => {
      const byIdentity = new Set(prev.map((item) => `${item.name}::${item.size}::${item.lastModified}`));
      const appended = normalizedFiles.filter((item) => {
        const id = `${item.name}::${item.size}::${item.lastModified}`;
        if (byIdentity.has(id)) {
          return false;
        }
        byIdentity.add(id);
        return true;
      });

      return appended.length > 0 ? [...prev, ...appended] : prev;
    });
  }, [setPendingChatAttachmentFiles, setPendingChatImageDataUrl]);

  const selectAttachmentFile = useCallback((file: File | null) => {
    if (!file) {
      setPendingChatAttachmentFiles([]);
      return;
    }

    setPendingChatImageDataUrl(null);
    setPendingChatAttachmentFiles([file]);
  }, [setPendingChatAttachmentFiles, setPendingChatImageDataUrl]);

  const removePendingAttachmentAt = useCallback((index: number) => {
    const safeIndex = Number(index);
    if (!Number.isFinite(safeIndex) || safeIndex < 0) {
      return;
    }

    setPendingChatAttachmentFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== safeIndex));
  }, [setPendingChatAttachmentFiles]);

  const clearPendingAttachment = useCallback(() => {
    setPendingChatAttachmentFiles([]);
    setPendingChatImageDataUrl(null);
  }, [setPendingChatAttachmentFiles, setPendingChatImageDataUrl]);

  const handleChatInputKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
      return;
    }

    if (event.key !== "ArrowUp") {
      return;
    }

    const target = event.currentTarget;
    const selectionStart = typeof target.selectionStart === "number" ? target.selectionStart : 0;
    const selectionEnd = typeof target.selectionEnd === "number" ? target.selectionEnd : 0;
    if (selectionStart !== 0 || selectionEnd !== 0) {
      return;
    }

    if (chatText.trim().length > 0) {
      return;
    }

    const lastOwn = [...messages]
      .reverse()
      .find((message) => message.user_id === user?.id && canManageOwnMessage(message));

    if (!lastOwn) {
      return;
    }

    event.preventDefault();
    setEditingMessageId(lastOwn.id);
    setReplyingToMessageId(null);
    setChatText(lastOwn.text);
  }, [canManageOwnMessage, chatText, messages, setChatText, setEditingMessageId, setReplyingToMessageId, user?.id]);

  const startEditingMessage = useCallback((messageId: string) => {
    if (!chatRoomSlug) {
      pushToast(selectChannelPlaceholderMessage);
      return;
    }

    const targetMessage = messages.find((item) => item.id === messageId);
    if (!targetMessage || !canManageOwnMessage(targetMessage)) {
      return;
    }

    setEditingMessageId(messageId);
    setReplyingToMessageId(null);
    setChatText(targetMessage.text);
  }, [canManageOwnMessage, chatRoomSlug, messages, pushToast, selectChannelPlaceholderMessage, setChatText, setEditingMessageId, setReplyingToMessageId]);

  const replyToMessage = useCallback((messageId: string) => {
    if (!chatRoomSlug) {
      pushToast(selectChannelPlaceholderMessage);
      return;
    }

    const targetMessage = messages.find((item) => item.id === messageId);
    if (!targetMessage) {
      return;
    }

    setEditingMessageId(null);
    setReplyingToMessageId(messageId);
    sendChatTypingState(chatRoomSlug, true);
  }, [chatRoomSlug, messages, pushToast, selectChannelPlaceholderMessage, sendChatTypingState, setEditingMessageId, setReplyingToMessageId]);

  const cancelReply = useCallback(() => {
    setReplyingToMessageId(null);
  }, [setReplyingToMessageId]);

  const deleteOwnMessage = useCallback((messageId: string) => {
    if (!chatRoomSlug) {
      pushToast(selectChannelPlaceholderMessage);
      return;
    }

    const targetMessage = messages.find((item) => item.id === messageId);
    if (!targetMessage || !canManageOwnMessage(targetMessage)) {
      return;
    }

    void (async () => {
      const deleteResult = await runChatDelete({
        authToken,
        messageId,
        roomSlug: chatRoomSlug,
        topicId: activeTopicId || undefined,
        sendWsEvent,
        sendWsEventAwaitAck
      });

      if (deleteResult.kind === "ws") {
        return;
      }

      if (deleteResult.kind === "http") {
        setMessages((prev) => prev.filter((item) => item.id !== messageId));
        return;
      }

      if (deleteResult.kind === "failed") {
        pushToast(serverErrorMessage);
      }
    })();
  }, [activeTopicId, authToken, canManageOwnMessage, chatRoomSlug, messages, pushToast, selectChannelPlaceholderMessage, sendWsEvent, sendWsEventAwaitAck, serverErrorMessage, setMessages]);

  const openRoomChat = useCallback((slug: string) => {
    const normalized = asTrimmedString(slug);
    if (!normalized) {
      return;
    }

    startTransition(() => {
      if (normalized !== chatRoomSlug) {
        setMessagesHasMore(false);
        setMessagesNextCursor(null);
      }

      setChatRoomSlug(normalized);
    });
  }, [chatRoomSlug, setChatRoomSlug, setMessagesHasMore, setMessagesNextCursor]);

  const togglePinMessage = useCallback((messageId: string) => {
    if (!activeTopicId) {
      pushToast(topicOnlyActionMessage);
      return;
    }

    const currentlyPinned = Boolean(pinnedByMessageId[messageId]);
    void (async () => {
      const pinResult = await runChatTogglePin({
        authToken,
        messageId,
        currentlyPinned,
        roomSlug: chatRoomSlug,
        topicId: activeTopicId || undefined,
        sendWsEvent,
        sendWsEventAwaitAck
      });

      if (pinResult.kind === "failed") {
        pushToast(serverErrorMessage);
        return;
      }

      if (pinResult.kind !== "http") {
        return;
      }

      setPinnedByMessageId((prev) => ({ ...prev, [messageId]: pinResult.value }));
    })();
  }, [activeTopicId, authToken, chatRoomSlug, pinnedByMessageId, pushToast, sendWsEvent, sendWsEventAwaitAck, serverErrorMessage, topicOnlyActionMessage]);

  const toggleMessageReaction = useCallback((messageId: string, emoji: string = "👍") => {
    if (!activeTopicId) {
      pushToast(topicOnlyActionMessage);
      return;
    }

    const normalizedMessageId = asTrimmedString(messageId);
    const normalizedEmoji = asTrimmedString(emoji);
    if (!normalizedMessageId || !normalizedEmoji) {
      return;
    }

    const currentlyActive = Boolean(reactionsByMessageId[normalizedMessageId]?.[normalizedEmoji]?.reacted);
    void (async () => {
      const reactionResult = await runChatToggleReaction({
        authToken,
        messageId: normalizedMessageId,
        emoji: normalizedEmoji,
        currentlyActive,
        roomSlug: chatRoomSlug,
        topicId: activeTopicId || undefined,
        sendWsEvent,
        sendWsEventAwaitAck
      });

      if (reactionResult.kind === "failed") {
        pushToast(serverErrorMessage);
        return;
      }

      setReactionsByMessageId((prev) => {
        const messageReactions = { ...(prev[normalizedMessageId] || {}) };
        const current = messageReactions[normalizedEmoji] || { count: 0, reacted: false };

        // Realtime echo may already apply this exact toggle before the API call resolves.
        // In that case, keep the state as-is to avoid local double counting.
        if (current.reacted === !currentlyActive) {
          return prev;
        }

        const nextCount = currentlyActive
          ? Math.max(0, current.count - 1)
          : current.count + 1;

        if (nextCount <= 0) {
          delete messageReactions[normalizedEmoji];
        } else {
          messageReactions[normalizedEmoji] = {
            count: nextCount,
            reacted: !currentlyActive
          };
        }

        const next = { ...prev };
        if (Object.keys(messageReactions).length === 0) {
          delete next[normalizedMessageId];
        } else {
          next[normalizedMessageId] = messageReactions;
        }

        return next;
      });
    })();
  }, [activeTopicId, authToken, chatRoomSlug, pushToast, reactionsByMessageId, sendWsEvent, sendWsEventAwaitAck, serverErrorMessage, topicOnlyActionMessage]);

  const reportMessage = useCallback((messageId: string) => {
    if (!activeTopicId) {
      pushToast(topicOnlyActionMessage);
      return;
    }

    void (async () => {
      const reportResult = await runChatReport({
        authToken,
        messageId,
        sendWsEventAwaitAck
      });

      if (reportResult.kind === "ws" || reportResult.kind === "http") {
        pushToast(reportMessageSentMessage);
        return;
      }

      const code = getErrorCode(reportResult.error);
      if (code === "MessageAlreadyReported") {
        pushToast(reportMessageExistsMessage);
        return;
      }

      pushToast(serverErrorMessage);
    })();
  }, [activeTopicId, authToken, pushToast, reportMessageExistsMessage, reportMessageSentMessage, sendWsEventAwaitAck, serverErrorMessage, topicOnlyActionMessage]);

  const applyRemotePinState = useCallback((messageId: string, pinned: boolean) => {
    const normalizedId = asTrimmedString(messageId);
    if (!normalizedId) {
      return;
    }

    setPinnedByMessageId((prev) => ({
      ...prev,
      [normalizedId]: Boolean(pinned)
    }));
  }, []);

  const applyRemoteMessageReactionState = useCallback((messageId: string, emoji: string, active: boolean, actorUserId?: string) => {
    const normalizedId = asTrimmedString(messageId);
    const normalizedEmoji = asTrimmedString(emoji);
    if (!normalizedId || !normalizedEmoji) {
      return;
    }

    const currentUserId = asTrimmedString(user?.id);
    const normalizedActorUserId = asTrimmedString(actorUserId);
    const actorIsCurrentUser = Boolean(currentUserId && normalizedActorUserId && normalizedActorUserId === currentUserId);

    setReactionsByMessageId((prev) => {
      const messageReactions = { ...(prev[normalizedId] || {}) };
      const current = messageReactions[normalizedEmoji] || { count: 0, reacted: false };
      const shouldSkipOwnEchoDelta = actorIsCurrentUser && current.reacted === active;
      const nextCount = shouldSkipOwnEchoDelta
        ? current.count
        : active
          ? current.count + 1
          : Math.max(0, current.count - 1);
      const nextReacted = actorIsCurrentUser ? active : current.reacted;

      if (nextCount <= 0) {
        delete messageReactions[normalizedEmoji];
      } else {
        messageReactions[normalizedEmoji] = {
          count: nextCount,
          reacted: nextReacted
        };
      }

      const next = { ...prev };
      if (Object.keys(messageReactions).length === 0) {
        delete next[normalizedId];
      } else {
        next[normalizedId] = messageReactions;
      }

      return next;
    });
  }, [user?.id]);

  return {
    sendMessage,
    handleChatPaste,
    handleChatInputKeyDown,
    startEditingMessage,
    replyToMessage,
    cancelReply,
    deleteOwnMessage,
    openRoomChat,
    pinnedByMessageId,
    reactionsByMessageId,
    togglePinMessage,
    toggleMessageReaction,
    reportMessage,
    pendingChatAttachmentFile: pendingChatAttachmentFiles[0] || null,
    pendingChatAttachmentFiles,
    selectAttachmentFiles,
    selectAttachmentFile,
    removePendingAttachmentAt,
    clearPendingAttachment,
    applyRemotePinState,
    applyRemoteMessageReactionState
  };
}
