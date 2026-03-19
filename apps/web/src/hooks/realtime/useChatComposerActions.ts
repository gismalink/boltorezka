import {
  useCallback,
  type ClipboardEvent,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type SetStateAction
} from "react";
import { api } from "../../api";
import type { Message, MessagesCursor, User } from "../../domain";
import type { ChatController } from "../../services";
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
  setChatRoomSlug: (value: string) => void;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setMessagesHasMore: (value: boolean) => void;
  setMessagesNextCursor: (cursor: MessagesCursor | null) => void;
  user: User | null;
  authToken: string;
  objectStorageWriteEnabled: boolean;
  chatText: string;
  setChatText: (value: string) => void;
  editingMessageId: string | null;
  setEditingMessageId: (value: string | null) => void;
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
};

export function useChatComposerActions({
  chatRoomSlug,
  setChatRoomSlug,
  messages,
  setMessages,
  setMessagesHasMore,
  setMessagesNextCursor,
  user,
  authToken,
  objectStorageWriteEnabled,
  chatText,
  setChatText,
  editingMessageId,
  setEditingMessageId,
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
  chatImageTooLargeMessage
}: UseChatComposerActionsParams) {
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
      if (!chatRoomSlug) {
        pushToast(selectChannelPlaceholderMessage);
        return;
      }

      if (editingMessageId) {
        const nextText = chatText.trim();
        if (!nextText) {
          return;
        }

        const requestId = sendWsEvent(
          "chat.edit",
          {
            messageId: editingMessageId,
            text: nextText,
            roomSlug: chatRoomSlug
          },
          { withIdempotency: true, maxRetries: maxChatRetries }
        );

        if (!requestId) {
          pushToast(serverErrorMessage);
          return;
        }

        setChatText("");
        setEditingMessageId(null);
        sendChatTypingState(chatRoomSlug, false);
        return;
      }

      let baseText = chatText.trim();
      const extractedInlineImageSource = !pendingChatImageDataUrl
        ? extractImageSourceFromClipboardText(baseText)
        : "";
      const imageSource = pendingChatImageDataUrl || extractedInlineImageSource;

      if (imageSource.startsWith("data:image/") && imageSource.length > serverChatImagePolicy.maxDataUrlLength) {
        pushToast(chatImageTooLargeMessage);
        return;
      }

      if (extractedInlineImageSource) {
        baseText = baseText
          .replace(extractedInlineImageSource, "")
          .replace(/!\[[^\]]*\]\(\s*\)/g, "")
          .replace(/\(\s*\)/g, "")
          .trim();
      }

      if (objectStorageWriteEnabled && imageSource.startsWith("data:image/")) {
        try {
          const imageResponse = await fetch(imageSource);
          const imageBlob = await imageResponse.blob();
          const mimeType = String(imageBlob.type || "image/jpeg").trim().toLowerCase();
          const sizeBytes = Number(imageBlob.size || 0);
          if (!mimeType || sizeBytes <= 0) {
            pushToast(serverErrorMessage);
            return;
          }

          const initUpload = await api.chatUploadInit(authToken, {
            roomSlug: chatRoomSlug,
            mimeType,
            sizeBytes
          });

          await api.uploadChatObject(initUpload.uploadUrl, imageBlob, initUpload.requiredHeaders || { "content-type": mimeType });

          await api.chatUploadFinalize(authToken, {
            uploadId: initUpload.uploadId,
            roomSlug: chatRoomSlug,
            storageKey: initUpload.storageKey,
            mimeType,
            sizeBytes,
            text: baseText
          });

          setChatText("");
          setPendingChatImageDataUrl(null);
          sendChatTypingState(chatRoomSlug, false);
          return;
        } catch {
          pushToast(serverErrorMessage);
          return;
        }
      }

      const imageMarkdown = imageSource ? `![скриншот](${imageSource})` : "";
      const outgoingText = [baseText, imageMarkdown].filter(Boolean).join("\n");
      if (!outgoingText) {
        return;
      }

      const result = chatController.sendMessage(outgoingText, chatRoomSlug, user, maxChatRetries);
      if (!result.sent) {
        return;
      }

      setChatText("");
      setPendingChatImageDataUrl(null);
      sendChatTypingState(chatRoomSlug, false);
    })();
  }, [
    authToken,
    chatController,
    chatImageTooLargeMessage,
    chatRoomSlug,
    chatText,
    editingMessageId,
    maxChatRetries,
    objectStorageWriteEnabled,
    pendingChatImageDataUrl,
    pushToast,
    selectChannelPlaceholderMessage,
    sendChatTypingState,
    sendWsEvent,
    serverChatImagePolicy.maxDataUrlLength,
    serverErrorMessage,
    setChatText,
    setEditingMessageId,
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
          return;
        }

        if (htmlImageSource.startsWith("data:image/")) {
          const response = await fetch(htmlImageSource);
          const blob = await response.blob();
          const synthesizedFile = new File([blob], "clipboard-image", { type: blob.type || "image/png" });
          const dataUrl = await compressImageToDataUrl(synthesizedFile, serverChatImagePolicy);
          setPendingChatImageDataUrl(dataUrl);
          return;
        }

        if (/^https?:\/\//i.test(htmlImageSource)) {
          setPendingChatImageDataUrl(htmlImageSource);
          return;
        }

        if (textImageSource.startsWith("data:image/")) {
          const response = await fetch(textImageSource);
          const blob = await response.blob();
          const synthesizedFile = new File([blob], "clipboard-image", { type: blob.type || "image/png" });
          const dataUrl = await compressImageToDataUrl(synthesizedFile, serverChatImagePolicy);
          setPendingChatImageDataUrl(dataUrl);
          return;
        }

        pushToast(chatImageTooLargeMessage);
      } catch {
        pushToast(chatImageTooLargeMessage);
      }
    })();
  }, [chatImageTooLargeMessage, chatRoomSlug, pushToast, serverChatImagePolicy, setPendingChatImageDataUrl]);

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
    setChatText(lastOwn.text);
  }, [canManageOwnMessage, chatText, messages, setChatText, setEditingMessageId, user?.id]);

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
    setChatText(targetMessage.text);
  }, [canManageOwnMessage, chatRoomSlug, messages, pushToast, selectChannelPlaceholderMessage, setChatText, setEditingMessageId]);

  const deleteOwnMessage = useCallback((messageId: string) => {
    if (!chatRoomSlug) {
      pushToast(selectChannelPlaceholderMessage);
      return;
    }

    const targetMessage = messages.find((item) => item.id === messageId);
    if (!targetMessage || !canManageOwnMessage(targetMessage)) {
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
  }, [canManageOwnMessage, chatRoomSlug, messages, pushToast, selectChannelPlaceholderMessage, sendWsEvent, serverErrorMessage]);

  const openRoomChat = useCallback((slug: string) => {
    const normalized = String(slug || "").trim();
    if (!normalized) {
      return;
    }

    if (normalized !== chatRoomSlug) {
      setMessages([]);
      setMessagesHasMore(false);
      setMessagesNextCursor(null);
    }

    setChatRoomSlug(normalized);
  }, [chatRoomSlug, setChatRoomSlug, setMessages, setMessagesHasMore, setMessagesNextCursor]);

  return {
    sendMessage,
    handleChatPaste,
    handleChatInputKeyDown,
    startEditingMessage,
    deleteOwnMessage,
    openRoomChat
  };
}
