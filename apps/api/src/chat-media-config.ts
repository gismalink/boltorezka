const MB = 1024 * 1024;
const GB = 1024 * 1024 * 1024;

export const DEFAULT_CHAT_IMAGE_MAX_DATA_URL_LENGTH = 102400;
export const DEFAULT_CHAT_IMAGE_MAX_SIDE = 1200;
export const DEFAULT_CHAT_IMAGE_JPEG_QUALITY = 0.6;

export const DEFAULT_CHAT_UPLOAD_MAX_SIZE_BYTES = 1 * GB;
export const DEFAULT_CHAT_LARGE_FILE_THRESHOLD_BYTES = 25 * MB;
export const DEFAULT_CHAT_LARGE_FILE_RETENTION_DAYS = 7;
export const DEFAULT_CHAT_BACKUP_MAX_FILE_SIZE_BYTES = 25 * MB;

export const DEFAULT_CHAT_UPLOAD_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/vnd.rar",
  "application/gzip",
  "application/x-gzip",
  "application/x-tar",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/rtf",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
  "application/x-msdownload",
  "application/vnd.microsoft.portable-executable",
  "application/x-apple-diskimage"
];

const toTrimmed = (value: unknown): string => {
  const raw = typeof value === "string" ? value : String(value ?? "");
  return raw.trim();
};

const parseCsv = (value: unknown): string[] =>
  String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

function readIntEnv(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = Number.parseInt(toTrimmed(env[name]), 10);
  if (!Number.isFinite(raw)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, raw));
}

function readFloatEnv(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = Number.parseFloat(toTrimmed(env[name]));
  if (!Number.isFinite(raw)) {
    return fallback;
  }

  const bounded = Math.max(min, Math.min(max, raw));
  return Number(bounded.toFixed(2));
}

export type ChatMediaConfig = {
  chatImageMaxDataUrlLength: number;
  chatImageMaxSide: number;
  chatImageJpegQuality: number;
  chatUploadMaxSizeBytes: number;
  chatLargeFileThresholdBytes: number;
  chatLargeFileRetentionDays: number;
  chatBackupMaxFileSizeBytes: number;
  chatUploadAllowedMimeTypes: string[];
};

export function readChatMediaConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ChatMediaConfig {
  const maxUpload = readIntEnv(env, "CHAT_UPLOAD_MAX_SIZE_BYTES", DEFAULT_CHAT_UPLOAD_MAX_SIZE_BYTES, 1024, 10 * GB);
  const largeThreshold = readIntEnv(
    env,
    "CHAT_LARGE_FILE_THRESHOLD_BYTES",
    DEFAULT_CHAT_LARGE_FILE_THRESHOLD_BYTES,
    1024,
    maxUpload
  );

  const allowedMimeTypes = parseCsv(env.CHAT_UPLOAD_ALLOWED_MIME_TYPES);

  return {
    chatImageMaxDataUrlLength: readIntEnv(env, "CHAT_IMAGE_MAX_DATA_URL_LENGTH", DEFAULT_CHAT_IMAGE_MAX_DATA_URL_LENGTH, 8000, 250000),
    chatImageMaxSide: readIntEnv(env, "CHAT_IMAGE_MAX_SIDE", DEFAULT_CHAT_IMAGE_MAX_SIDE, 256, 4096),
    chatImageJpegQuality: readFloatEnv(env, "CHAT_IMAGE_JPEG_QUALITY", DEFAULT_CHAT_IMAGE_JPEG_QUALITY, 0.3, 0.95),
    chatUploadMaxSizeBytes: maxUpload,
    chatLargeFileThresholdBytes: largeThreshold,
    chatLargeFileRetentionDays: readIntEnv(env, "CHAT_LARGE_FILE_RETENTION_DAYS", DEFAULT_CHAT_LARGE_FILE_RETENTION_DAYS, 1, 365),
    chatBackupMaxFileSizeBytes: readIntEnv(
      env,
      "CHAT_BACKUP_MAX_FILE_SIZE_BYTES",
      DEFAULT_CHAT_BACKUP_MAX_FILE_SIZE_BYTES,
      1024,
      maxUpload
    ),
    chatUploadAllowedMimeTypes: allowedMimeTypes.length > 0
      ? allowedMimeTypes
      : [...DEFAULT_CHAT_UPLOAD_ALLOWED_MIME_TYPES]
  };
}
