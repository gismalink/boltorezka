import type { Message } from "../domain";
import { asTrimmedString } from "./stringUtils";

export type ChatMessageViewModel = {
  id: string;
  userName: string;
  text: string;
  createdAt: string;
  editedAt: string | null;
  isOwn: boolean;
  showAuthor: boolean;
  showAvatar: boolean;
  canManageOwnMessage: boolean;
  deliveryClass: string;
  deliveryGlyph: string;
  replyPreview: {
    userName: string;
    text: string;
  } | null;
  attachmentImageUrls: string[];
  attachmentFiles: Array<{
    id: string;
    type: "document" | "audio";
    downloadUrl: string;
    mimeType: string;
    sizeBytes: number;
  }>;
};

function toDeliveryPresentation(status: Message["deliveryStatus"]): { cssClass: string; glyph: string } {
  if (status === "sending") {
    return { cssClass: "delivery-sending", glyph: "•" };
  }

  if (status === "delivered") {
    return { cssClass: "delivery-delivered", glyph: "✓✓" };
  }

  if (status === "failed") {
    return { cssClass: "text-[var(--pixel-danger)]", glyph: "!" };
  }

  return { cssClass: "", glyph: "" };
}

function collectAttachmentImageUrls(message: Message): string[] {
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const urls = attachments
    .filter((item) => String(item.type || "") === "image")
    .map((item) => asTrimmedString(item.download_url))
    .filter((url) => url.length > 0);

  return urls.filter((url, index, all) => all.indexOf(url) === index);
}

function collectAttachmentFiles(message: Message): Array<{
  id: string;
  type: "document" | "audio";
  downloadUrl: string;
  mimeType: string;
  sizeBytes: number;
}> {
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  return attachments
    .filter((item) => item.type === "document" || item.type === "audio")
    .map((item) => ({
      id: item.id,
      type: item.type,
      downloadUrl: asTrimmedString(item.download_url),
      mimeType: asTrimmedString(item.mime_type),
      sizeBytes: Number(item.size_bytes || 0)
    }))
    .filter((item) => item.downloadUrl.length > 0 && Number.isFinite(item.sizeBytes) && item.sizeBytes > 0);
}

export function buildChatMessageViewModels(
  messages: Message[],
  currentUserId: string | null,
  messageManageWindowMs: number
): ChatMessageViewModel[] {
  return messages.map((message, index) => {
    const previousMessage = index > 0 ? messages[index - 1] : null;
    const nextMessage = index + 1 < messages.length ? messages[index + 1] : null;
    const isOwn = currentUserId === message.user_id;
    const createdAtTs = Number(new Date(message.created_at));
    const canManageOwnMessage = isOwn
      && Number.isFinite(createdAtTs)
      && (Date.now() - createdAtTs) <= messageManageWindowMs;
    const deliveryPresentation = toDeliveryPresentation(message.deliveryStatus);

    return {
      id: message.id,
      userName: message.user_name,
      text: message.text,
      createdAt: message.created_at,
      editedAt: message.edited_at || null,
      isOwn,
      showAuthor: !previousMessage || previousMessage.user_id !== message.user_id,
      showAvatar: !isOwn && (!nextMessage || nextMessage.user_id !== message.user_id),
      canManageOwnMessage,
      deliveryClass: deliveryPresentation.cssClass,
      deliveryGlyph: deliveryPresentation.glyph,
      replyPreview: message.reply_to_message_id
        ? {
          userName: String(message.reply_to_user_name || "Unknown"),
          text: String(message.reply_to_text || "")
        }
        : null,
      attachmentImageUrls: collectAttachmentImageUrls(message),
      attachmentFiles: collectAttachmentFiles(message)
    };
  });
}