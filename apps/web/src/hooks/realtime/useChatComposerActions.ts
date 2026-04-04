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
import { api } from "../../api";
import type { Message, MessagesCursor, User } from "../../domain";
import { sendChatMessage, type ChatController } from "../../services";
import {
  compressImageToDataUrl,
  extractImageSourceFromClipboardHtml,
  extractImageSourceFromClipboardText,
  normalizeImageSource,
  type ChatImagePolicy
} from "../../utils/chatImagePayload";

type SendWsEventFn = (
  eventType: string,
  payload: Record<string, unknown>,
  options?: { withIdempotency?: boolean; maxRetries?: number }
) => string | null;

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
};

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
  attachmentUnsupportedTypeMessage
}: UseChatComposerActionsParams) {
  const [pinnedByMessageId, setPinnedByMessageId] = useState<Record<string, boolean>>({});
  const [thumbsUpByMessageId, setThumbsUpByMessageId] = useState<Record<string, boolean>>({});
  const [pendingChatAttachmentFile, setPendingChatAttachmentFile] = useState<File | null>(null);

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

    setThumbsUpByMessageId((prev) => {
      const next: Record<string, boolean> = {};
      Object.entries(prev).forEach(([messageId, active]) => {
        if (existingIds.has(messageId) && active) {
          next[messageId] = true;
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
        editingMessageId,
        pendingChatImageDataUrl,
        pendingChatAttachmentFile,
        user,
        maxChatRetries,
        maxDataUrlLength: serverChatImagePolicy.maxDataUrlLength,
        chatController,
        sendWsEvent
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
      setPendingChatAttachmentFile(null);
      if (result.mode === "edit") {
        setEditingMessageId(null);
      }
      if (result.mode === "reply") {
        setReplyingToMessageId(null);
      }
      sendChatTypingState(chatRoomSlug, false);
    })();
  }, [
    authToken,
    chatController,
    chatImageTooLargeMessage,
    attachmentTooLargeMessage,
    attachmentUnsupportedTypeMessage,
    topicImageUploadUnsupportedMessage,
    activeTopicId,
    replyingToMessageId,
    chatRoomSlug,
    chatText,
    editingMessageId,
    maxChatRetries,
    pendingChatAttachmentFile,
    pendingChatImageDataUrl,
    pushToast,
    selectChannelPlaceholderMessage,
    sendChatTypingState,
    sendWsEvent,
    serverChatImagePolicy,
    serverErrorMessage,
    setChatText,
    setEditingMessageId,
    setReplyingToMessageId,
    setPendingChatAttachmentFile,
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
          setPendingChatAttachmentFile(null);
          return;
        }

        if (htmlImageSource.startsWith("data:image/")) {
          const response = await fetch(htmlImageSource);
          const blob = await response.blob();
          const synthesizedFile = new File([blob], "clipboard-image", { type: blob.type || "image/png" });
          const dataUrl = await compressImageToDataUrl(synthesizedFile, serverChatImagePolicy);
          setPendingChatImageDataUrl(dataUrl);
          setPendingChatAttachmentFile(null);
          return;
        }

        if (/^https?:\/\//i.test(htmlImageSource)) {
          setPendingChatImageDataUrl(htmlImageSource);
          setPendingChatAttachmentFile(null);
          return;
        }

        if (textImageSource.startsWith("data:image/")) {
          const response = await fetch(textImageSource);
          const blob = await response.blob();
          const synthesizedFile = new File([blob], "clipboard-image", { type: blob.type || "image/png" });
          const dataUrl = await compressImageToDataUrl(synthesizedFile, serverChatImagePolicy);
          setPendingChatImageDataUrl(dataUrl);
          setPendingChatAttachmentFile(null);
          return;
        }

        pushToast(chatImageTooLargeMessage);
      } catch {
        pushToast(chatImageTooLargeMessage);
      }
    })();
  }, [chatImageTooLargeMessage, chatRoomSlug, pushToast, serverChatImagePolicy, setPendingChatAttachmentFile, setPendingChatImageDataUrl]);

  const selectAttachmentFile = useCallback((file: File | null) => {
    if (!file) {
      setPendingChatAttachmentFile(null);
      return;
    }

    setPendingChatImageDataUrl(null);
    setPendingChatAttachmentFile(file);
  }, [setPendingChatAttachmentFile, setPendingChatImageDataUrl]);

  const clearPendingAttachment = useCallback(() => {
    setPendingChatAttachmentFile(null);
    setPendingChatImageDataUrl(null);
  }, [setPendingChatAttachmentFile, setPendingChatImageDataUrl]);

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

    if (activeTopicId) {
      void (async () => {
        try {
          await api.deleteMessage(authToken, messageId);
          setMessages((prev) => prev.filter((item) => item.id !== messageId));
        } catch {
          pushToast(serverErrorMessage);
        }
      })();
      return;
    }

    const requestId = sendWsEvent(
      "chat.delete",
      {
        messageId,
        roomSlug: chatRoomSlug
      },
      { withIdempotency: true, maxRetries: 1 }
    );

    if (!requestId) {
      pushToast(serverErrorMessage);
    }
  }, [activeTopicId, authToken, canManageOwnMessage, chatRoomSlug, messages, pushToast, selectChannelPlaceholderMessage, sendWsEvent, serverErrorMessage, setMessages]);

  const openRoomChat = useCallback((slug: string) => {
    const normalized = String(slug || "").trim();
    if (!normalized) {
      return;
    }

    startTransition(() => {
      if (normalized !== chatRoomSlug) {
        setMessages([]);
        setMessagesHasMore(false);
        setMessagesNextCursor(null);
      }

      setChatRoomSlug(normalized);
    });
  }, [chatRoomSlug, setChatRoomSlug, setMessages, setMessagesHasMore, setMessagesNextCursor]);

  const togglePinMessage = useCallback((messageId: string) => {
    if (!activeTopicId) {
      pushToast(topicOnlyActionMessage);
      return;
    }

    const currentlyPinned = Boolean(pinnedByMessageId[messageId]);
    void (async () => {
      try {
        if (currentlyPinned) {
          await api.unpinMessage(authToken, messageId);
          setPinnedByMessageId((prev) => ({ ...prev, [messageId]: false }));
          return;
        }

        await api.pinMessage(authToken, messageId);
        setPinnedByMessageId((prev) => ({ ...prev, [messageId]: true }));
      } catch {
        pushToast(serverErrorMessage);
      }
    })();
  }, [activeTopicId, authToken, pinnedByMessageId, pushToast, serverErrorMessage, topicOnlyActionMessage]);

  const toggleThumbsUpReaction = useCallback((messageId: string) => {
    if (!activeTopicId) {
      pushToast(topicOnlyActionMessage);
      return;
    }

    const currentlyActive = Boolean(thumbsUpByMessageId[messageId]);
    void (async () => {
      try {
        if (currentlyActive) {
          await api.removeMessageReaction(authToken, messageId, "👍");
          setThumbsUpByMessageId((prev) => ({ ...prev, [messageId]: false }));
          return;
        }

        await api.addMessageReaction(authToken, messageId, "👍");
        setThumbsUpByMessageId((prev) => ({ ...prev, [messageId]: true }));
      } catch {
        pushToast(serverErrorMessage);
      }
    })();
  }, [activeTopicId, authToken, pushToast, serverErrorMessage, thumbsUpByMessageId, topicOnlyActionMessage]);

  const reportMessage = useCallback((messageId: string) => {
    if (!activeTopicId) {
      pushToast(topicOnlyActionMessage);
      return;
    }

    void (async () => {
      try {
        await api.reportMessage(authToken, messageId, {
          reason: "spam_or_abuse"
        });
        pushToast(reportMessageSentMessage);
      } catch (error) {
        const code = String((error as { code?: string } | null)?.code || "").trim();
        if (code === "MessageAlreadyReported") {
          pushToast(reportMessageExistsMessage);
          return;
        }

        pushToast(serverErrorMessage);
      }
    })();
  }, [activeTopicId, authToken, pushToast, reportMessageExistsMessage, reportMessageSentMessage, serverErrorMessage, topicOnlyActionMessage]);

  const applyRemotePinState = useCallback((messageId: string, pinned: boolean) => {
    const normalizedId = String(messageId || "").trim();
    if (!normalizedId) {
      return;
    }

    setPinnedByMessageId((prev) => ({
      ...prev,
      [normalizedId]: Boolean(pinned)
    }));
  }, []);

  const applyRemoteThumbsUpReactionState = useCallback((messageId: string, active: boolean) => {
    const normalizedId = String(messageId || "").trim();
    if (!normalizedId) {
      return;
    }

    setThumbsUpByMessageId((prev) => ({
      ...prev,
      [normalizedId]: Boolean(active)
    }));
  }, []);

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
    thumbsUpByMessageId,
    togglePinMessage,
    toggleThumbsUpReaction,
    reportMessage,
    pendingChatAttachmentFile,
    selectAttachmentFile,
    clearPendingAttachment,
    applyRemotePinState,
    applyRemoteThumbsUpReactionState
  };
}
