import { api } from "../api";
import type { User } from "../domain";
import type { ChatController } from "./chatController";
import { extractImageSourceFromClipboardText } from "../utils/chatImagePayload";

type SendWsEventFn = (
  eventType: string,
  payload: Record<string, unknown>,
  options?: { withIdempotency?: boolean; maxRetries?: number }
) => string | null;

type SendChatMessageParams = {
  authToken: string;
  chatRoomSlug: string;
  chatText: string;
  editingMessageId: string | null;
  pendingChatImageDataUrl: string | null;
  user: User | null;
  maxChatRetries: number;
  maxDataUrlLength: number;
  chatController: ChatController;
  sendWsEvent: SendWsEventFn;
};

export type SendChatMessageResult =
  | { kind: "no-room" }
  | { kind: "empty" }
  | { kind: "too-large" }
  | { kind: "server-error" }
  | { kind: "sent"; mode: "edit" | "upload" | "text" };

export async function sendChatMessage(params: SendChatMessageParams): Promise<SendChatMessageResult> {
  const {
    authToken,
    chatRoomSlug,
    chatText,
    editingMessageId,
    pendingChatImageDataUrl,
    user,
    maxChatRetries,
    maxDataUrlLength,
    chatController,
    sendWsEvent
  } = params;

  if (!chatRoomSlug) {
    return { kind: "no-room" };
  }

  if (editingMessageId) {
    const nextText = chatText.trim();
    if (!nextText) {
      return { kind: "empty" };
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
      return { kind: "server-error" };
    }

    return { kind: "sent", mode: "edit" };
  }

  let baseText = chatText.trim();
  const extractedInlineImageSource = !pendingChatImageDataUrl
    ? extractImageSourceFromClipboardText(baseText)
    : "";
  const imageSource = pendingChatImageDataUrl || extractedInlineImageSource;

  if (imageSource.startsWith("data:image/") && imageSource.length > maxDataUrlLength) {
    return { kind: "too-large" };
  }

  if (extractedInlineImageSource) {
    baseText = baseText
      .replace(extractedInlineImageSource, "")
      .replace(/!\[[^\]]*\]\(\s*\)/g, "")
      .replace(/\(\s*\)/g, "")
      .trim();
  }

  if (imageSource) {
    try {
      const imageResponse = await fetch(imageSource);
      const imageBlob = await imageResponse.blob();
      const mimeType = String(imageBlob.type || "image/jpeg").trim().toLowerCase();
      const sizeBytes = Number(imageBlob.size || 0);
      if (!mimeType || sizeBytes <= 0) {
        return { kind: "server-error" };
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

      return { kind: "sent", mode: "upload" };
    } catch {
      return { kind: "server-error" };
    }
  }

  if (!baseText) {
    return { kind: "empty" };
  }

  const result = chatController.sendMessage(baseText, chatRoomSlug, user, maxChatRetries);
  if (!result.sent) {
    return { kind: "server-error" };
  }

  return { kind: "sent", mode: "text" };
}