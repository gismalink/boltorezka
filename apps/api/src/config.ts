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

/**
 * @param {unknown} value
 * @param {boolean} defaultValue
 * @returns {boolean}
 */
const parseBoolean = (value: unknown, defaultValue: boolean): boolean => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
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
const authSessionCookieSameSiteRaw = String(process.env.AUTH_SESSION_COOKIE_SAMESITE || "Lax").trim().toLowerCase();
const authSessionCookieSameSite: "Lax" | "Strict" | "None" = authSessionCookieSameSiteRaw === "strict"
  ? "Strict"
  : authSessionCookieSameSiteRaw === "none"
    ? "None"
    : "Lax";
const authSessionCookieMaxAgeSecRaw = Number.parseInt(String(process.env.AUTH_SESSION_COOKIE_MAX_AGE_SEC || `${60 * 60 * 24 * 30}`), 10);
const chatUploadMaxSizeBytesRaw = Number.parseInt(String(process.env.CHAT_UPLOAD_MAX_SIZE_BYTES || `${5 * 1024 * 1024}`), 10);
const chatUploadInitTtlSecRaw = Number.parseInt(String(process.env.CHAT_UPLOAD_INIT_TTL_SEC || "600"), 10);
const chatUploadAllowedMimeTypes = parseCsv(
  process.env.CHAT_UPLOAD_ALLOWED_MIME_TYPES || "image/png,image/jpeg,image/webp,image/gif"
);
const chatStorageProvider = String(process.env.CHAT_STORAGE_PROVIDER || "localfs").trim().toLowerCase() === "minio"
  ? "minio"
  : "localfs";

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
  authCookieMode: parseBoolean(process.env.AUTH_COOKIE_MODE, false),
  authSessionCookieName: String(process.env.AUTH_SESSION_COOKIE_NAME || "boltorezka_session").trim() || "boltorezka_session",
  authSessionCookieSecure: parseBoolean(process.env.AUTH_SESSION_COOKIE_SECURE, true),
  authSessionCookieSameSite,
  authSessionCookieDomain: String(process.env.AUTH_SESSION_COOKIE_DOMAIN || "").trim(),
  authSessionCookiePath: String(process.env.AUTH_SESSION_COOKIE_PATH || "/").trim() || "/",
  authSessionCookieMaxAgeSec: Number.isFinite(authSessionCookieMaxAgeSecRaw) && authSessionCookieMaxAgeSecRaw > 0
    ? authSessionCookieMaxAgeSecRaw
    : 60 * 60 * 24 * 30,
  allowedReturnHosts: parseCsv(process.env.ALLOWED_RETURN_HOSTS),
  superAdminEmail: String(process.env.SUPER_ADMIN_EMAIL || "gismalink@gmail.com")
    .trim()
    .toLowerCase(),
  appVersion: String(process.env.APP_VERSION || process.env.npm_package_version || "0.1.0").trim(),
  appBuildSha: String(process.env.APP_BUILD_SHA || "").trim(),
  apiServeStatic: parseBoolean(process.env.API_SERVE_STATIC, true),
  rtcFeatureInitialStateReplay: parseBoolean(process.env.RTC_FEATURE_INITIAL_STATE_REPLAY, true),
  rtcMediaTopologyDefault: "livekit",
  livekitEnabled: livekitEnabledRaw,
  livekitUrl: String(process.env.LIVEKIT_URL || "").trim(),
  livekitApiKey: String(process.env.LIVEKIT_API_KEY || "").trim(),
  livekitApiSecret: String(process.env.LIVEKIT_API_SECRET || "").trim(),
  livekitTokenTtlSec: Number.isFinite(livekitTokenTtlSecRaw) && livekitTokenTtlSecRaw > 0
    ? livekitTokenTtlSecRaw
    : 1800,
  chatUploadMaxSizeBytes: Number.isFinite(chatUploadMaxSizeBytesRaw) && chatUploadMaxSizeBytesRaw > 0
    ? chatUploadMaxSizeBytesRaw
    : 5 * 1024 * 1024,
  chatUploadAllowedMimeTypes: chatUploadAllowedMimeTypes.length > 0
    ? chatUploadAllowedMimeTypes
    : ["image/png", "image/jpeg", "image/webp", "image/gif"],
  chatUploadInitTtlSec: Number.isFinite(chatUploadInitTtlSecRaw) && chatUploadInitTtlSecRaw > 0
    ? chatUploadInitTtlSecRaw
    : 600,
  chatStorageProvider,
  chatMinioEndpoint: String(process.env.CHAT_MINIO_ENDPOINT || "").trim(),
  chatMinioRegion: String(process.env.CHAT_MINIO_REGION || "us-east-1").trim() || "us-east-1",
  chatMinioAccessKey: String(process.env.CHAT_MINIO_ACCESS_KEY || "").trim(),
  chatMinioSecretKey: String(process.env.CHAT_MINIO_SECRET_KEY || "").trim(),
  chatMinioBucket: String(process.env.CHAT_MINIO_BUCKET || "").trim(),
  chatMinioForcePathStyle: parseBoolean(process.env.CHAT_MINIO_FORCE_PATH_STYLE, true),
  chatObjectStoragePublicBaseUrl: String(process.env.CHAT_OBJECT_STORAGE_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "")
};
