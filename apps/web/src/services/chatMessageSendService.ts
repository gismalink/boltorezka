/**
 * chatMessageSendService.ts — отправка сообщений чата (WS-first c HTTP fallback).
 *
 * Назначение:
 * - Принимает текст/вложения/reply/mentions, валидирует и формирует payload.
 * - Сначала пытается отправить по WebSocket; при недоступности падает в HTTP API.
 * - Возвращает `SendChatMessageResult` с маркером успеха/business-кода ошибки.
 *
 * Используется хуком `useChatSend` и компонентами composer’а.
 */
import { api } from "../api";
import type { User } from "../domain";
import type { ChatController } from "./chatController";
import {
  runChatEdit,
  runChatSend,
  type SendWsEventAwaitAckFn,
  type SendWsEventFn
} from "./chatTransportCommands";
import { getErrorCode } from "./chatErrorUtils";
import { extractImageSourceFromClipboardText } from "../utils/chatImagePayload";

type SendChatMessageParams = {
  authToken: string;
  chatRoomSlug: string;
  activeTopicId: string | null;
  replyingToMessageId: string | null;
  chatText: string;
  mentionUserIds: string[];
  editingMessageId: string | null;
  pendingChatImageDataUrl: string | null;
  pendingChatAttachmentFile: File | null;
  user: User | null;
  maxChatRetries: number;
  maxDataUrlLength: number;
  chatController: ChatController;
  sendWsEvent: SendWsEventFn;
  sendWsEventAwaitAck: SendWsEventAwaitAckFn;
};

export type SendChatMessageResult =
  | { kind: "no-room" }
  | { kind: "empty" }
  | { kind: "too-large" }
  | { kind: "attachment-too-large" }
  | { kind: "attachment-unsupported-type" }
  | { kind: "topic-image-unsupported" }
  | { kind: "server-error" }
  | { kind: "sent"; mode: "edit" | "upload" | "text" | "reply" };

export async function sendChatMessage(params: SendChatMessageParams): Promise<SendChatMessageResult> {
  const {
    authToken,
    chatRoomSlug,
    activeTopicId,
    replyingToMessageId,
    chatText,
    mentionUserIds,
    editingMessageId,
    pendingChatImageDataUrl,
    pendingChatAttachmentFile,
    user,
    maxChatRetries,
    maxDataUrlLength,
    chatController,
    sendWsEvent,
    sendWsEventAwaitAck
  } = params;

  if (!chatRoomSlug) {
    return { kind: "no-room" };
  }

  if (editingMessageId) {
    const nextText = chatText.trim();
    if (!nextText) {
      return { kind: "empty" };
    }

    const editResult = await runChatEdit({
      authToken,
      messageId: editingMessageId,
      text: nextText,
      roomSlug: chatRoomSlug,
      topicId: activeTopicId || undefined,
      maxRetries: maxChatRetries,
      sendWsEvent,
      sendWsEventAwaitAck
    });

    if (editResult.kind !== "failed") {
      return { kind: "sent", mode: "edit" };
    }

    return { kind: "server-error" };
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
        topicId: activeTopicId || undefined,
        mimeType,
        sizeBytes
      });

      await api.uploadChatObject(initUpload.uploadUrl, imageBlob, initUpload.requiredHeaders || { "content-type": mimeType });

      await api.chatUploadFinalize(authToken, {
        uploadId: initUpload.uploadId,
        roomSlug: chatRoomSlug,
        topicId: activeTopicId || undefined,
        storageKey: initUpload.storageKey,
        mimeType,
        sizeBytes,
        text: baseText,
        mentionUserIds
      });

      return { kind: "sent", mode: "upload" };
    } catch (error) {
      const code = getErrorCode(error);
      if (code === "UnsupportedMimeType") {
        return { kind: "attachment-unsupported-type" };
      }

      if (code === "AttachmentTooLarge") {
        return { kind: "attachment-too-large" };
      }

      return { kind: "server-error" };
    }
  }

  if (pendingChatAttachmentFile) {
    try {
      const mimeType = String(pendingChatAttachmentFile.type || "application/octet-stream").trim().toLowerCase();
      const sizeBytes = Number(pendingChatAttachmentFile.size || 0);
      if (!mimeType || sizeBytes <= 0) {
        return { kind: "server-error" };
      }

      const initUpload = await api.chatUploadInit(authToken, {
        roomSlug: chatRoomSlug,
        topicId: activeTopicId || undefined,
        mimeType,
        sizeBytes
      });

      await api.uploadChatObject(initUpload.uploadUrl, pendingChatAttachmentFile, initUpload.requiredHeaders || { "content-type": mimeType });

      await api.chatUploadFinalize(authToken, {
        uploadId: initUpload.uploadId,
        roomSlug: chatRoomSlug,
        topicId: activeTopicId || undefined,
        storageKey: initUpload.storageKey,
        mimeType,
        sizeBytes,
        text: baseText,
        mentionUserIds
      });

      return { kind: "sent", mode: "upload" };
    } catch (error) {
      const code = getErrorCode(error);
      if (code === "UnsupportedMimeType") {
        return { kind: "attachment-unsupported-type" };
      }

      if (code === "AttachmentTooLarge") {
        return { kind: "attachment-too-large" };
      }

      return { kind: "server-error" };
    }
  }

  if (!baseText) {
    return { kind: "empty" };
  }

  if (activeTopicId) {
    const topicSendResult = await runChatSend({
      authToken,
      text: baseText,
      roomSlug: chatRoomSlug,
      topicId: activeTopicId,
      replyToMessageId: replyingToMessageId || undefined,
      mentionUserIds,
      maxRetries: maxChatRetries,
      sendWsEvent,
      sendWsEventAwaitAck
    });

    if (topicSendResult.kind === "failed") {
      return { kind: "server-error" };
    }

    if (replyingToMessageId) {
      return { kind: "sent", mode: "reply" };
    }

    return { kind: "sent", mode: "text" };
  }

  const result = chatController.sendMessage(baseText, chatRoomSlug, user, maxChatRetries, mentionUserIds);
  if (result.sent) {
    return { kind: "sent", mode: "text" };
  }

  const roomSendFallback = await runChatSend({
    authToken,
    text: baseText,
    roomSlug: chatRoomSlug,
    mentionUserIds,
    maxRetries: maxChatRetries,
    sendWsEvent,
    sendWsEventAwaitAck
  });

  if (roomSendFallback.kind === "failed") {
    return { kind: "server-error" };
  }

  return { kind: "sent", mode: "text" };
}