/** @typedef {import("./config.types.ts").AppConfig} AppConfig */
/** @typedef {import("./config.types.ts").AuthMode} AuthMode */

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
const parseCsv = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

/** @type {AuthMode} */
const authMode = (process.env.AUTH_MODE || "sso").toLowerCase() === "local" ? "local" : "sso";

/** @type {AppConfig} */
export const config = {
  port: Number(process.env.PORT || 8080),
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  authMode,
  authSsoBaseUrl: (process.env.AUTH_SSO_BASE_URL || "http://localhost:3000").replace(
    /\/+$/,
    ""
  ),
  allowedReturnHosts: parseCsv(process.env.ALLOWED_RETURN_HOSTS),
  superAdminEmail: String(process.env.SUPER_ADMIN_EMAIL || "gismalink@gmail.com")
    .trim()
    .toLowerCase()
};
