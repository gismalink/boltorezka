import type { AppConfig, AuthMode } from "./config.types.ts";

const requiredKeys = ["DATABASE_URL", "REDIS_URL", "JWT_SECRET"];

for (const key of requiredKeys) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
const parseCsv = (value: unknown): string[] =>
  String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const toTrimmed = (value: unknown): string => {
  const raw = typeof value === "string" ? value : String(value ?? "");
  return raw.trim();
};
const toTrimmedLower = (value: unknown): string => toTrimmed(value).toLowerCase();

/**
 * @param {unknown} value
 * @param {boolean} defaultValue
 * @returns {boolean}
 */
const parseBoolean = (value: unknown, defaultValue: boolean): boolean => {
  if (value === undefined || value === null || toTrimmed(value) === "") {
    return defaultValue;
  }

  const normalized = toTrimmedLower(value);
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return defaultValue;
};

const authMode = (process.env.AUTH_MODE || "sso").toLowerCase() === "local" ? "local" : "sso";
const livekitEnabledRaw = parseBoolean(process.env.LIVEKIT_ENABLED, true);
const livekitTokenTtlSecRaw = Number.parseInt(String(process.env.LIVEKIT_TOKEN_TTL_SEC || "1800"), 10);
const authSsoRequestTimeoutMsRaw = Number.parseInt(String(process.env.AUTH_SSO_REQUEST_TIMEOUT_MS || "5000"), 10);
const authSessionCookieSameSiteRaw = toTrimmedLower(process.env.AUTH_SESSION_COOKIE_SAMESITE || "Lax");
const authSessionCookieSameSite: "Lax" | "Strict" | "None" = authSessionCookieSameSiteRaw === "strict"
  ? "Strict"
  : authSessionCookieSameSiteRaw === "none"
    ? "None"
    : "Lax";
const authSessionCookieMaxAgeSecRaw = Number.parseInt(String(process.env.AUTH_SESSION_COOKIE_MAX_AGE_SEC || `${60 * 60 * 24 * 30}`), 10);
const chatUploadMaxSizeBytesRaw = Number.parseInt(String(process.env.CHAT_UPLOAD_MAX_SIZE_BYTES || `${5 * 1024 * 1024}`), 10);
const chatUploadInitTtlSecRaw = Number.parseInt(String(process.env.CHAT_UPLOAD_INIT_TTL_SEC || "600"), 10);
const chatUploadAllowedMimeTypes = parseCsv(
  process.env.CHAT_UPLOAD_ALLOWED_MIME_TYPES
  || "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/csv,application/zip,audio/mpeg,audio/wav,audio/ogg,audio/mp4"
);
const chatStorageProvider = toTrimmedLower(process.env.CHAT_STORAGE_PROVIDER || "localfs") === "minio"
  ? "minio"
  : "localfs";
const webPushPublicKey = toTrimmed(process.env.WEB_PUSH_PUBLIC_KEY || "");
const webPushPrivateKey = toTrimmed(process.env.WEB_PUSH_PRIVATE_KEY || "");
const webPushSubject = toTrimmed(process.env.WEB_PUSH_SUBJECT || "mailto:ops@datowave.local") || "mailto:ops@datowave.local";
const webPushEnabled = parseBoolean(process.env.WEB_PUSH_ENABLED, false)
  && Boolean(webPushPublicKey)
  && Boolean(webPushPrivateKey);

export const config: AppConfig = {
  port: Number(process.env.PORT || 8080),
  databaseUrl: String(process.env.DATABASE_URL),
  redisUrl: String(process.env.REDIS_URL),
  jwtSecret: String(process.env.JWT_SECRET),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  authMode,
  authSsoBaseUrl: (process.env.AUTH_SSO_BASE_URL || "http://localhost:3000").replace(
    /\/+$/,
    ""
  ),
  authSsoRequestTimeoutMs: Number.isFinite(authSsoRequestTimeoutMsRaw) && authSsoRequestTimeoutMsRaw > 0
    ? authSsoRequestTimeoutMsRaw
    : 5000,
  authCookieMode: parseBoolean(process.env.AUTH_COOKIE_MODE, false),
  authSessionCookieName: toTrimmed(process.env.AUTH_SESSION_COOKIE_NAME || "datowave_session") || "datowave_session",
  authSessionCookieSecure: parseBoolean(process.env.AUTH_SESSION_COOKIE_SECURE, true),
  authSessionCookieSameSite,
  authSessionCookieDomain: toTrimmed(process.env.AUTH_SESSION_COOKIE_DOMAIN || ""),
  authSessionCookiePath: toTrimmed(process.env.AUTH_SESSION_COOKIE_PATH || "/") || "/",
  authSessionCookieMaxAgeSec: Number.isFinite(authSessionCookieMaxAgeSecRaw) && authSessionCookieMaxAgeSecRaw > 0
    ? authSessionCookieMaxAgeSecRaw
    : 60 * 60 * 24 * 30,
  smokeAuthBootstrapEnabled: parseBoolean(
    process.env.SMOKE_AUTH_BOOTSTRAP_ENABLED,
    String(process.env.AUTH_SESSION_COOKIE_NAME || "datowave_session").includes("_test")
  ),
  allowedReturnHosts: parseCsv(process.env.ALLOWED_RETURN_HOSTS),
  superAdminEmail: toTrimmedLower(process.env.SUPER_ADMIN_EMAIL || "gismalink@gmail.com"),
  appVersion: toTrimmed(process.env.APP_VERSION || process.env.npm_package_version || "0.1.0"),
  appBuildSha: toTrimmed(process.env.APP_BUILD_SHA || ""),
  apiServeStatic: parseBoolean(process.env.API_SERVE_STATIC, true),
  rtcFeatureInitialStateReplay: parseBoolean(process.env.RTC_FEATURE_INITIAL_STATE_REPLAY, true),
  rtcMediaTopologyDefault: "livekit",
  livekitEnabled: livekitEnabledRaw,
  livekitUrl: toTrimmed(process.env.LIVEKIT_URL || ""),
  livekitApiKey: toTrimmed(process.env.LIVEKIT_API_KEY || ""),
  livekitApiSecret: toTrimmed(process.env.LIVEKIT_API_SECRET || ""),
  livekitTokenTtlSec: Number.isFinite(livekitTokenTtlSecRaw) && livekitTokenTtlSecRaw > 0
    ? livekitTokenTtlSecRaw
    : 1800,
  chatUploadMaxSizeBytes: Number.isFinite(chatUploadMaxSizeBytesRaw) && chatUploadMaxSizeBytesRaw > 0
    ? chatUploadMaxSizeBytesRaw
    : 5 * 1024 * 1024,
  chatUploadAllowedMimeTypes: chatUploadAllowedMimeTypes.length > 0
    ? chatUploadAllowedMimeTypes
    : [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "application/pdf",
      "text/plain",
      "text/csv",
      "application/zip",
      "audio/mpeg",
      "audio/wav",
      "audio/ogg",
      "audio/mp4"
    ],
  chatUploadInitTtlSec: Number.isFinite(chatUploadInitTtlSecRaw) && chatUploadInitTtlSecRaw > 0
    ? chatUploadInitTtlSecRaw
    : 600,
  chatStorageProvider,
  chatMinioEndpoint: toTrimmed(process.env.CHAT_MINIO_ENDPOINT || ""),
  chatMinioRegion: toTrimmed(process.env.CHAT_MINIO_REGION || "us-east-1") || "us-east-1",
  chatMinioAccessKey: toTrimmed(process.env.CHAT_MINIO_ACCESS_KEY || ""),
  chatMinioSecretKey: toTrimmed(process.env.CHAT_MINIO_SECRET_KEY || ""),
  chatMinioBucket: toTrimmed(process.env.CHAT_MINIO_BUCKET || ""),
  chatMinioForcePathStyle: parseBoolean(process.env.CHAT_MINIO_FORCE_PATH_STYLE, true),
  chatObjectStoragePublicBaseUrl: toTrimmed(process.env.CHAT_OBJECT_STORAGE_PUBLIC_BASE_URL || "").replace(/\/+$/, ""),
  webPushEnabled,
  webPushSubject,
  webPushPublicKey,
  webPushPrivateKey
};
