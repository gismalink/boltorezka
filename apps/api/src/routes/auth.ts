import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../config.js";
import type { UserCompactRow, UserRow } from "../db.types.ts";
import type {
  AuthModeResponse,
  LivekitTokenResponse,
  MeResponse,
  SsoSessionResponse,
  WsTicketResponse
} from "../api-contract.types.ts";

const ssoProviderSchema = z.enum(["google", "yandex"]);
const uiThemeSchema = z.enum(["8-neon-bit", "material-classic"]);
const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  uiTheme: uiThemeSchema.optional()
});
const livekitTokenSchema = z.object({
  roomSlug: z.string().trim().min(1).max(80),
  canPublish: z.boolean().optional().default(true),
  canSubscribe: z.boolean().optional().default(true),
  canPublishData: z.boolean().optional().default(true)
});

const safeHostSet = new Set(config.allowedReturnHosts);
const AUTH_SESSION_PREFIX = "auth:session:";
const AUTH_SESSION_TTL_SEC = 60 * 60 * 24 * 30;
const AUTH_RATE_LIMIT_PREFIX = "auth:rl:";

type AuthRateLimitPolicy = {
  namespace: string;
  max: number;
  windowSec: number;
};

function resolveRateLimitSubject(request: FastifyRequest): string {
  const userId = String(request.user?.sub || "").trim();
  if (userId) {
    return `u:${userId}`;
  }

  const ip = String(request.ip || request.headers["x-forwarded-for"] || "unknown")
    .split(",")[0]
    .trim();
  return `ip:${ip || "unknown"}`;
}

function makeAuthRateLimiter(policy: AuthRateLimitPolicy) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const nowWindow = Math.floor(Date.now() / 1000 / policy.windowSec);
    const key = `${AUTH_RATE_LIMIT_PREFIX}${policy.namespace}:${resolveRateLimitSubject(request)}:${nowWindow}`;

    const current = await request.server.redis.incr(key);
    if (current === 1) {
      await request.server.redis.expire(key, policy.windowSec);
    }

    if (current > policy.max) {
      reply.header("Retry-After", String(policy.windowSec));
      return reply.code(429).send({
        error: "RateLimitExceeded",
        message: `Too many requests for ${policy.namespace}`
      });
    }

    return undefined;
  };
}

function appendSetCookie(reply: FastifyReply, value: string) {
  const current = reply.getHeader("set-cookie");
  if (!current) {
    reply.header("set-cookie", value);
    return;
  }

  if (Array.isArray(current)) {
    reply.header("set-cookie", [...current.map((item) => String(item)), value]);
    return;
  }

  reply.header("set-cookie", [String(current), value]);
}

function buildSessionCookieValue(token: string) {
  const parts = [
    `${config.authSessionCookieName}=${encodeURIComponent(token)}`,
    `Path=${config.authSessionCookiePath}`,
    `Max-Age=${config.authSessionCookieMaxAgeSec}`,
    "HttpOnly",
    `SameSite=${config.authSessionCookieSameSite}`
  ];

  if (config.authSessionCookieDomain) {
    parts.push(`Domain=${config.authSessionCookieDomain}`);
  }

  if (config.authSessionCookieSecure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function buildSessionCookieClearValue() {
  const parts = [
    `${config.authSessionCookieName}=`,
    `Path=${config.authSessionCookiePath}`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    `SameSite=${config.authSessionCookieSameSite}`
  ];

  if (config.authSessionCookieDomain) {
    parts.push(`Domain=${config.authSessionCookieDomain}`);
  }

  if (config.authSessionCookieSecure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

async function issueAuthSessionToken(
  fastify: FastifyInstance,
  user: UserRow,
  authMode: "sso" = "sso",
  previousSessionId: string | null = null
) {
  const sessionId = randomUUID();

  await fastify.redis.setEx(
    `${AUTH_SESSION_PREFIX}${sessionId}`,
    AUTH_SESSION_TTL_SEC,
    JSON.stringify({
      userId: user.id,
      authMode,
      issuedAt: new Date().toISOString(),
      rotatedFrom: previousSessionId || null
    })
  );

  if (previousSessionId && previousSessionId !== sessionId) {
    await fastify.redis.del(`${AUTH_SESSION_PREFIX}${previousSessionId}`);
  }

  const token = await fastify.jwt.sign(
    {
      sub: user.id,
      sid: sessionId,
      email: user.email,
      name: user.name,
      role: user.role,
      authMode
    },
    {
      expiresIn: fastify.jwtExpiresIn
    }
  );

  return { token, sessionId };
}

function resolveLivekitClientUrl(request: FastifyRequest): string {
  const raw = String(config.livekitUrl || "").trim();
  if (!raw) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    const forwardedProto = String(request.headers["x-forwarded-proto"] || "").trim().toLowerCase();
    const forwardedHostRaw = String(request.headers["x-forwarded-host"] || "").trim();
    const requestHostRaw = String(request.headers.host || "").trim();
    const requestProto = forwardedProto || String((request as { protocol?: string }).protocol || "").trim().toLowerCase();
    const isHttps = requestProto === "https";
    const isIpHost = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(parsed.hostname);

    if (isHttps && isIpHost) {
      const sourceHost = (forwardedHostRaw || requestHostRaw).split(",")[0]?.trim() || "";
      const normalizedHost = sourceHost.includes(":") ? sourceHost.split(":")[0] : sourceHost;
      if (normalizedHost) {
        parsed.hostname = normalizedHost;
        parsed.port = "";
      }
    }

    if (isHttps && parsed.protocol === "ws:") {
      parsed.protocol = "wss:";
    }

    return parsed.toString();
  } catch {
    return raw;
  }
}

function resolveSafeReturnUrl(value: unknown, request: FastifyRequest): string {
  if (!value || typeof value !== "string") {
    return "/";
  }

  if (value.startsWith("/")) {
    return value;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const requestHost = String(request.headers.host || "")
      .split(":")[0]
      .toLowerCase();

    if (host === requestHost || safeHostSet.has(host)) {
      return parsed.toString();
    }
  } catch {
    return "/";
  }

  return "/";
}

async function proxyAuthGetJson(request: FastifyRequest, path: string) {
  const url = `${config.authSsoBaseUrl}${path}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      cookie: request.headers.cookie || "",
      accept: "application/json",
      "user-agent": String(request.headers["user-agent"] || "")
    },
    redirect: "manual"
  });

  const contentType = response.headers.get("content-type") || "";
  const bodyText = await response.text();

  if (contentType.includes("application/json")) {
    try {
      return {
        ok: response.ok,
        status: response.status,
        data: JSON.parse(bodyText)
      };
    } catch {
      return {
        ok: false,
        status: response.status,
        data: { error: "InvalidJsonFromSso" }
      };
    }
  }

  return {
    ok: false,
    status: response.status,
    data: { error: bodyText || "UnexpectedSsoResponse" }
  };
}

async function upsertSsoUser(profile: Record<string, unknown> | null | undefined) {
  const normalizedEmail = String(profile?.email || "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail) {
    throw new Error("SSO profile does not contain email");
  }

  const normalizedUsername =
    String(profile?.username || "").trim() || normalizedEmail.split("@")[0] || null;
  const displayName =
    String(profile?.username || "").trim() || normalizedEmail.split("@")[0] || "SSO User";
  const isSuperAdmin = normalizedEmail === config.superAdminEmail;

  const existing = await db.query<UserRow>(
    "SELECT id, email, username, name, ui_theme, role, is_banned, created_at FROM users WHERE email = $1",
    [normalizedEmail]
  );

  if ((existing.rowCount || 0) > 0) {
    const updated = await db.query<UserRow>(
      `UPDATE users
       SET
         username = COALESCE($4, username),
         name = $2,
         role = CASE WHEN $3 THEN 'super_admin' ELSE role END
       WHERE email = $1
       RETURNING id, email, username, name, ui_theme, role, is_banned, created_at`,
      [normalizedEmail, displayName, isSuperAdmin, normalizedUsername]
    );

    return updated.rows[0];
  }

  const newRole = isSuperAdmin ? "super_admin" : "user";

  const created = await db.query<UserRow>(
    `INSERT INTO users (email, password_hash, username, name, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, username, name, ui_theme, role, is_banned, created_at`,
    [normalizedEmail, "__sso_only__", normalizedUsername, displayName, newRole]
  );

  return created.rows[0];
}

export async function authRoutes(fastify: FastifyInstance) {
  const limitSsoStart = makeAuthRateLimiter({
    namespace: "sso-start",
    max: 30,
    windowSec: 60
  });
  const limitSsoSession = makeAuthRateLimiter({
    namespace: "sso-session",
    max: 20,
    windowSec: 60
  });
  const limitRefresh = makeAuthRateLimiter({
    namespace: "refresh",
    max: 20,
    windowSec: 60
  });
  const limitLogout = makeAuthRateLimiter({
    namespace: "logout",
    max: 20,
    windowSec: 60
  });
  const limitWsTicket = makeAuthRateLimiter({
    namespace: "ws-ticket",
    max: 60,
    windowSec: 60
  });

  fastify.get("/v1/auth/mode", async () => {
    const response: AuthModeResponse = {
      mode: config.authMode,
      ssoBaseUrl: config.authSsoBaseUrl
    };
    return response;
  });

  fastify.get(
    "/v1/auth/sso/start",
    async (
      request: FastifyRequest<{ Querystring: { provider?: string; returnUrl?: string } }>,
      reply: FastifyReply
    ) => {
      await limitSsoStart(request, reply);
      if (reply.sent) {
        return;
      }

      const providerRaw = String(request.query.provider || "google").toLowerCase();
    const parsedProvider = ssoProviderSchema.safeParse(providerRaw);

    if (!parsedProvider.success) {
      return reply.code(400).send({
        error: "ValidationError",
        message: "provider must be google or yandex"
      });
    }

      const returnUrl = resolveSafeReturnUrl(String(request.query.returnUrl || "/"), request);
    const redirectUrl = `${config.authSsoBaseUrl}/auth/${parsedProvider.data}?returnUrl=${encodeURIComponent(returnUrl)}`;
    return reply.redirect(redirectUrl, 302);
    }
  );

  fastify.get(
    "/v1/auth/sso/logout",
    async (request: FastifyRequest<{ Querystring: { returnUrl?: string } }>, reply: FastifyReply) => {
      const returnUrl = resolveSafeReturnUrl(String(request.query.returnUrl || "/"), request);
    const redirectUrl = `${config.authSsoBaseUrl}/auth/logout?returnUrl=${encodeURIComponent(returnUrl)}`;
    return reply.redirect(redirectUrl, 302);
    }
  );

  fastify.get(
    "/v1/auth/sso/session",
    {
      preHandler: [limitSsoSession]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const ssoTokenResult = await proxyAuthGetJson(request, "/auth/get-token");

      if (!ssoTokenResult.ok || !ssoTokenResult.data?.authenticated) {
        if (config.authCookieMode) {
          appendSetCookie(reply, buildSessionCookieClearValue());
        }
        const response: SsoSessionResponse = {
          authenticated: false,
          user: null,
          token: null
        };
        return response;
      }

      const currentUserResult = await proxyAuthGetJson(request, "/auth/current-user");
      const ssoUser = currentUserResult.data?.user || {
        email: ssoTokenResult.data?.email,
        username: ssoTokenResult.data?.username
      };

      const localUser = await upsertSsoUser(ssoUser);

      if (localUser.is_banned) {
        return reply.code(403).send({
          authenticated: false,
          error: "UserBanned",
          message: "User is banned"
        });
      }

      const { token } = await issueAuthSessionToken(fastify, localUser, "sso");
      if (config.authCookieMode) {
        appendSetCookie(reply, buildSessionCookieValue(token));
      }

      const response: SsoSessionResponse = {
        authenticated: true,
        user: localUser,
        token,
        sso: {
          id: ssoUser.id || null,
          email: ssoUser.email || null,
          username: ssoUser.username || null,
          role: localUser.role || ssoUser.role || ssoTokenResult.data?.role || "user"
        }
      };
        return response;
      } catch (error) {
        fastify.log.error(error, "sso session exchange failed");
        return reply.code(503).send({
          authenticated: false,
          error: "SsoUnavailable",
          message: "Central SSO is temporarily unavailable"
        });
      }
    }
  );

  fastify.post("/v1/auth/register", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(410).send({
      error: "SsoOnly",
      message: "Local registration is disabled. Use SSO login."
    });
  });

  fastify.post("/v1/auth/login", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(410).send({
      error: "SsoOnly",
      message: "Local login is disabled. Use SSO login."
    });
  });

  fastify.post(
    "/v1/auth/refresh",
    {
      preHandler: [requireAuth, limitRefresh]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Valid bearer token is required"
        });
      }

      const previousSessionId = String(request.user?.sid || "").trim() || null;
      if (!previousSessionId) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Session refresh requires re-login"
        });
      }

      const { token } = await issueAuthSessionToken(fastify, user, "sso", previousSessionId);
      if (config.authCookieMode) {
        appendSetCookie(reply, buildSessionCookieValue(token));
      }
      return {
        token,
        user
      };
    }
  );

  fastify.post(
    "/v1/auth/logout",
    {
      preHandler: [requireAuth, limitLogout]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sessionId = String(request.user?.sid || "").trim();
      if (sessionId) {
        await fastify.redis.del(`${AUTH_SESSION_PREFIX}${sessionId}`);
      }

      if (config.authCookieMode) {
        appendSetCookie(reply, buildSessionCookieClearValue());
      }

      return { ok: true };
    }
  );

  fastify.get(
    "/v1/auth/ws-ticket",
    {
      preHandler: [requireAuth, limitWsTicket]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = String(request.user?.sub || "").trim();
      if (!userId) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Valid bearer token is required"
        });
      }

      const userResult = await db.query<UserCompactRow>(
        "SELECT id, email, username, name, ui_theme, role, is_banned FROM users WHERE id = $1",
        [userId]
      );

      if (userResult.rowCount === 0) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "User does not exist"
        });
      }

      const user = userResult.rows[0];
      if (user.is_banned) {
        return reply.code(403).send({
          error: "UserBanned",
          message: "User is banned"
        });
      }
      const ticket = randomUUID();
      const expiresInSec = 45;

      await fastify.redis.setEx(
        `ws:ticket:${ticket}`,
        expiresInSec,
        JSON.stringify({
          userId: user.id,
          userName: user.name || user.email || "unknown",
          email: user.email,
          role: user.role || "user",
          issuedAt: new Date().toISOString()
        })
      );

      const response: WsTicketResponse = {
        ticket,
        expiresInSec
      };
      return response;
    }
  );

  fastify.post(
    "/v1/auth/livekit-token",
    {
      preHandler: [requireAuth]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!config.livekitEnabled) {
        return reply.code(503).send({
          error: "LiveKitDisabled",
          message: "LiveKit token minting is disabled for this environment"
        });
      }

      if (!config.livekitApiKey || !config.livekitApiSecret || !config.livekitUrl) {
        return reply.code(503).send({
          error: "LiveKitConfigError",
          message: "LiveKit is not fully configured"
        });
      }

      const parsed = livekitTokenSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const userId = String(request.user?.sub || "").trim();
      if (!userId) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Valid bearer token is required"
        });
      }

      const roomResult = await db.query<Pick<UserRow, never> & {
        id: string;
        slug: string;
        title: string;
        is_public: boolean;
      }>(
        `SELECT id, slug, title, is_public
         FROM rooms
         WHERE slug = $1 AND is_archived = FALSE
         LIMIT 1`,
        [parsed.data.roomSlug]
      );

      if (roomResult.rowCount === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      const room = roomResult.rows[0];
      if (!room.is_public) {
        const memberResult = await db.query<{ is_member: boolean }>(
          `SELECT EXISTS(
             SELECT 1 FROM room_members
             WHERE room_id = $1 AND user_id = $2
           ) AS is_member`,
          [room.id, userId]
        );

        if (!memberResult.rows[0]?.is_member) {
          return reply.code(403).send({
            error: "Forbidden",
            message: "Room membership is required"
          });
        }
      }

      const currentUser = request.currentUser;
      const identity = userId;
      const participantName = String(currentUser?.name || currentUser?.email || identity).trim();
      const issuedAt = new Date().toISOString();
      const traceId = randomUUID();

      const accessToken = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
        identity,
        name: participantName,
        ttl: `${config.livekitTokenTtlSec}s`,
        metadata: JSON.stringify({
          userId: identity,
          roomSlug: room.slug,
          issuedAt
        })
      });

      accessToken.addGrant({
        roomJoin: true,
        room: room.slug,
        canPublish: parsed.data.canPublish,
        canSubscribe: parsed.data.canSubscribe,
        canPublishData: parsed.data.canPublishData
      });

      const token = await accessToken.toJwt();
      const response: LivekitTokenResponse = {
        token,
        url: resolveLivekitClientUrl(request),
        room: room.slug,
        roomId: room.id,
        identity,
        expiresInSec: config.livekitTokenTtlSec,
        issuedAt,
        mediaTopology: "livekit",
        traceId
      };

      fastify.log.info(
        {
          userId: identity,
          roomId: room.id,
          roomSlug: room.slug,
          traceId,
          expiresInSec: config.livekitTokenTtlSec,
          canPublish: parsed.data.canPublish,
          canSubscribe: parsed.data.canSubscribe,
          canPublishData: parsed.data.canPublishData
        },
        "livekit token minted"
      );

      return response;
    }
  );

  fastify.get(
    "/v1/auth/me",
    {
      preHandler: [requireAuth]
    },
    async (request: FastifyRequest) => {
      const userId = String(request.user?.sub || "").trim();
      const result = await db.query<UserRow>(
        "SELECT id, email, username, name, ui_theme, role, is_banned, created_at FROM users WHERE id = $1",
        [userId]
      );

      if (result.rowCount === 0) {
        const response: MeResponse = {
          user: null
        };
        return response;
      }

      const response: MeResponse = { user: result.rows[0] };
      return response;
    }
  );

  fastify.patch(
    "/v1/auth/me",
    {
      preHandler: [requireAuth]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = updateProfileSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "name is required"
        });
      }

      const userId = String(request.user?.sub || "").trim();
      if (!userId) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Valid bearer token is required"
        });
      }

      const updated = await db.query<UserRow>(
        `UPDATE users
         SET name = $2,
             ui_theme = COALESCE($3, ui_theme)
         WHERE id = $1
         RETURNING id, email, username, name, ui_theme, role, is_banned, created_at`,
        [userId, parsed.data.name, parsed.data.uiTheme ?? null]
      );

      if (updated.rowCount === 0) {
        const response: MeResponse = { user: null };
        return response;
      }

      const response: MeResponse = { user: updated.rows[0] };
      return response;
    }
  );
}
