import { config } from "./config.js";
import type { MessageAttachmentRow, RoomMessageRow } from "./db.types.ts";
import { normalizeBoundedString } from "./validators.js";

export type AttachmentSizeClass = "small" | "large";

type AttachmentDerivedMetadata = {
  sizeClass: AttachmentSizeClass;
  expiresAt: string | null;
};

function normalizeSizeBytes(value: unknown): number {
  const sizeBytes = Number(value || 0);
  if (!Number.isFinite(sizeBytes)) {
    return 0;
  }
  return Math.max(0, Math.floor(sizeBytes));
}

function toIsoOrNull(value: unknown): string | null {
  const createdAt = normalizeBoundedString(value, 128) || "";
  if (!createdAt) {
    return null;
  }

  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) {
    return null;
  }

  return new Date(createdAtMs).toISOString();
}

function normalizeSizeClass(value: unknown): AttachmentSizeClass | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "small" || normalized === "large") {
    return normalized;
  }
  return null;
}

export function deriveAttachmentMetadata(sizeBytesInput: unknown, createdAtInput: unknown): AttachmentDerivedMetadata {
  const sizeBytes = normalizeSizeBytes(sizeBytesInput);
  const sizeClass: AttachmentSizeClass = sizeBytes > config.chatLargeFileThresholdBytes ? "large" : "small";

  if (sizeClass !== "large") {
    return {
      sizeClass,
      expiresAt: null
    };
  }

  const createdAtIso = toIsoOrNull(createdAtInput);
  if (!createdAtIso) {
    return {
      sizeClass,
      expiresAt: null
    };
  }

  const createdAtMs = Date.parse(createdAtIso);
  const expiresAtMs = createdAtMs + config.chatLargeFileRetentionDays * 24 * 60 * 60 * 1000;

  return {
    sizeClass,
    expiresAt: new Date(expiresAtMs).toISOString()
  };
}

export function enrichMessageAttachmentRow(attachment: MessageAttachmentRow): MessageAttachmentRow {
  const computed = deriveAttachmentMetadata(attachment.size_bytes, attachment.created_at);
  const persistedSizeClass = normalizeSizeClass(attachment.size_class);
  const persistedExpiresAt = toIsoOrNull(attachment.expires_at);

  const sizeClass = persistedSizeClass || computed.sizeClass;
  const expiresAt = sizeClass === "large"
    ? (persistedExpiresAt || computed.expiresAt)
    : null;

  return {
    ...attachment,
    size_class: sizeClass,
    expires_at: expiresAt
  };
}

export function enrichRoomMessageAttachments(message: RoomMessageRow): RoomMessageRow {
  const attachments = Array.isArray(message.attachments)
    ? message.attachments.map((item) => enrichMessageAttachmentRow(item as MessageAttachmentRow))
    : [];

  return {
    ...message,
    attachments
  };
}

export function enrichDmAttachmentsJson(attachmentsJson: unknown): unknown {
  if (!Array.isArray(attachmentsJson)) {
    return attachmentsJson;
  }

  return attachmentsJson.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return item;
    }

    const record = item as Record<string, unknown>;
    const sizeBytes = normalizeSizeBytes(record.size_bytes ?? record.sizeBytes);
    const createdAt = toIsoOrNull(record.created_at ?? record.createdAt);
    const computed = deriveAttachmentMetadata(sizeBytes, createdAt);
    const persistedSizeClass = normalizeSizeClass(record.size_class ?? record.sizeClass);
    const persistedExpiresAt = toIsoOrNull(record.expires_at ?? record.expiresAt);
    const sizeClass = persistedSizeClass || computed.sizeClass;
    const expiresAt = sizeClass === "large"
      ? (persistedExpiresAt || computed.expiresAt)
      : null;

    return {
      ...record,
      size_bytes: sizeBytes,
      size_class: sizeClass,
      expires_at: expiresAt,
      sizeClass: sizeClass,
      expiresAt: expiresAt
    };
  });
}