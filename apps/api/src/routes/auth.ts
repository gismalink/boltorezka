import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../config.js";
import type { UserCompactRow, UserRow } from "../db.types.ts";
import {
  appendSetCookie,
  buildAccountDeletionState,
  buildAuthAuditContext,
  buildSessionCookieClearValue,
  buildSessionCookieValue,
  makeAuthRateLimiter,
  sendAccountDeleted
} from "./auth.helpers.js";
import { deleteAuthSession, issueAuthSessionToken } from "./auth-session.js";
import { proxyAuthGetJson, resolveSafeReturnUrl } from "./auth-sso.js";
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
const desktopHandoffExchangeSchema = z.object({
  code: z.string().trim().min(10).max(128)
});
const desktopHandoffAttemptIdSchema = z.object({
  attemptId: z.string().uuid()
});

const AUTH_DESKTOP_HANDOFF_PREFIX = "auth:desktop-handoff:";
const AUTH_DESKTOP_HANDOFF_TTL_SEC = 120;
const AUTH_DESKTOP_HANDOFF_ATTEMPT_PREFIX = "auth:desktop-handoff-attempt:";

type DesktopHandoffAttemptState = {
  status: "pending" | "completed";
  userId: string;
  createdAt: string;
  completedAt: string | null;
};

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
    const sourceHost = (forwardedHostRaw || requestHostRaw).split(",")[0]?.trim() || "";
    const normalizedHost = sourceHost.includes(":") ? sourceHost.split(":")[0] : sourceHost;
    const requestProto = forwardedProto || String((request as { protocol?: string }).protocol || "").trim().toLowerCase();
    const isHttps = requestProto === "https";
    const isIpHost = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(parsed.hostname);
    const isLegacyLivekitHost = parsed.hostname === "test.boltorezka.gismalink.art"
      || parsed.hostname === "boltorezka.gismalink.art";

    // If config still points to legacy host, prefer current ingress host from forwarded headers.
    if (normalizedHost && isLegacyLivekitHost) {
      parsed.hostname = normalizedHost;
      parsed.port = "";
    }

    if (isHttps && isIpHost) {
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

async function upsertSsoUser(profile: Record<string, unknown> | null | undefined) {
  const normalizedEmail = String(profile?.email || "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail) {
    throw new Error("SSO profile does not contain email");
  }

  const emailLocalPart = normalizedEmail.split("@")[0] || "";
  const normalizedUsername = emailLocalPart || null;
  const displayName = emailLocalPart || "SSO User";
  const isSuperAdmin = normalizedEmail === config.superAdminEmail;
  const isSmokeRtcBot = /^smoke-rtc-\d+@example\.test$/.test(normalizedEmail);
  const isPrimarySmokeAdmin = normalizedEmail === "smoke-rtc-1@example.test";
  const shouldForceActiveAccess = isSuperAdmin || isSmokeRtcBot;

  const existing = await db.query<UserRow>(
    "SELECT id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, deleted_at, purge_scheduled_at, created_at FROM users WHERE email = $1",
    [normalizedEmail]
  );

  if ((existing.rowCount || 0) > 0) {
    const updated = await db.query<UserRow>(
      `UPDATE users
       SET
         username = COALESCE(username, $4),
         name = CASE
           WHEN name IS NULL OR BTRIM(name) = '' THEN $2
           ELSE name
         END,
         role = CASE
           WHEN $3 THEN 'super_admin'
           WHEN $7 THEN 'admin'
           ELSE role
         END,
         access_state = CASE WHEN $6 THEN 'active' ELSE access_state END,
         is_bot = CASE WHEN $5 THEN TRUE ELSE is_bot END
       WHERE email = $1
      RETURNING id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, deleted_at, purge_scheduled_at, created_at`,
      [
        normalizedEmail,
        displayName,
        isSuperAdmin,
        normalizedUsername,
        isSmokeRtcBot,
        shouldForceActiveAccess,
        isPrimarySmokeAdmin
      ]
    );

    return updated.rows[0];
  }

  const newRole = isSuperAdmin ? "super_admin" : isPrimarySmokeAdmin ? "admin" : "user";

  const created = await db.query<UserRow>(
    `INSERT INTO users (email, password_hash, username, name, role, access_state, is_bot)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, deleted_at, purge_scheduled_at, created_at`,
    [
      normalizedEmail,
      "__sso_only__",
      normalizedUsername,
      displayName,
      newRole,
      shouldForceActiveAccess ? "active" : "pending",
      isSmokeRtcBot
    ]
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
  const limitDesktopHandoffCreate = makeAuthRateLimiter({
    namespace: "desktop-handoff-create",
    max: 20,
    windowSec: 60
  });
  const limitDesktopHandoffExchange = makeAuthRateLimiter({
    namespace: "desktop-handoff-exchange",
    max: 40,
    windowSec: 60
  });
  const limitDesktopHandoffAttemptCreate = makeAuthRateLimiter({
    namespace: "desktop-handoff-attempt-create",
    max: 20,
    windowSec: 60
  });
  const limitDesktopHandoffAttemptStatus = makeAuthRateLimiter({
    namespace: "desktop-handoff-attempt-status",
    max: 80,
    windowSec: 60
  });
  const limitDesktopHandoffAttemptComplete = makeAuthRateLimiter({
    namespace: "desktop-handoff-attempt-complete",
    max: 40,
    windowSec: 60
  });
  const limitSsoRestore = makeAuthRateLimiter({
    namespace: "sso-restore",
    max: 20,
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

      if (localUser.deleted_at) {
        return sendAccountDeleted(reply, localUser);
      }

      const { token } = await issueAuthSessionToken(fastify, localUser, "sso");
      if (config.authCookieMode) {
        appendSetCookie(reply, buildSessionCookieValue(token));
      }

      fastify.log.info(
        buildAuthAuditContext(request, {
          event: "auth.session.issued",
          flow: "sso-session",
          userId: localUser.id,
          authMode: "sso"
        }),
        "auth session issued"
      );

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
        fastify.log.error(
          {
            err: error,
            ...buildAuthAuditContext(request, {
              event: "auth.session.exchange_failed",
              flow: "sso-session"
            })
          },
          "sso session exchange failed"
        );
        return reply.code(503).send({
          authenticated: false,
          error: "SsoUnavailable",
          message: "Central SSO is temporarily unavailable"
        });
      }
    }
  );

  fastify.post(
    "/v1/auth/sso/restore",
    {
      preHandler: [limitSsoRestore]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const currentUserResult = await proxyAuthGetJson(request, "/auth/current-user");
        const normalizedEmail = String(currentUserResult.data?.user?.email || "")
          .trim()
          .toLowerCase();

        if (!normalizedEmail) {
          return reply.code(401).send({
            error: "Unauthorized",
            message: "SSO authentication is required to restore account"
          });
        }

        const result = await db.query<UserRow>(
          `UPDATE users
           SET deleted_at = NULL,
               purge_scheduled_at = NULL
           WHERE email = $1
           RETURNING id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, deleted_at, purge_scheduled_at, created_at`,
          [normalizedEmail]
        );

        if ((result.rowCount || 0) === 0) {
          return reply.code(404).send({
            error: "AccountNotFound",
            message: "Local account not found"
          });
        }

        const localUser = result.rows[0];
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

        return {
          authenticated: true,
          restored: true,
          token,
          user: localUser
        };
      } catch (error) {
        fastify.log.error(
          {
            err: error,
            ...buildAuthAuditContext(request, {
              event: "auth.restore.exchange_failed",
              flow: "sso-restore"
            })
          },
          "sso restore failed"
        );

        return reply.code(503).send({
          authenticated: false,
          error: "SsoUnavailable",
          message: "Central SSO is temporarily unavailable"
        });
      }
    }
  );

  fastify.post(
    "/v1/auth/desktop-handoff/attempt",
    {
      preHandler: [requireAuth, limitDesktopHandoffAttemptCreate]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = String(request.user?.sub || "").trim();
      if (!userId) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Valid bearer token is required"
        });
      }

      const attemptId = randomUUID();
      const state: DesktopHandoffAttemptState = {
        status: "pending",
        userId,
        createdAt: new Date().toISOString(),
        completedAt: null
      };

      await fastify.redis.setEx(
        `${AUTH_DESKTOP_HANDOFF_ATTEMPT_PREFIX}${attemptId}`,
        AUTH_DESKTOP_HANDOFF_TTL_SEC,
        JSON.stringify(state)
      );

      fastify.log.info(
        buildAuthAuditContext(request, {
          event: "auth.desktop_handoff.attempt_created",
          userId,
          attemptId,
          ttlSec: AUTH_DESKTOP_HANDOFF_TTL_SEC
        }),
        "desktop handoff attempt created"
      );

      return {
        ok: true,
        attemptId,
        expiresInSec: AUTH_DESKTOP_HANDOFF_TTL_SEC
      };
    }
  );

  fastify.get(
    "/v1/auth/desktop-handoff/attempt/:attemptId",
    {
      preHandler: [limitDesktopHandoffAttemptStatus]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = (request.params || {}) as { attemptId?: string };
      const parsed = desktopHandoffAttemptIdSchema.safeParse({
        attemptId: params.attemptId
      });
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const key = `${AUTH_DESKTOP_HANDOFF_ATTEMPT_PREFIX}${parsed.data.attemptId}`;
      const raw = await fastify.redis.get(key);
      if (!raw) {
        return {
          status: "expired"
        };
      }

      try {
        const state = JSON.parse(raw) as DesktopHandoffAttemptState;
        if (state.status === "completed") {
          return {
            status: "completed"
          };
        }

        return {
          status: "pending"
        };
      } catch {
        return {
          status: "expired"
        };
      }
    }
  );

  fastify.post(
    "/v1/auth/desktop-handoff/complete",
    {
      preHandler: [requireAuth, limitDesktopHandoffAttemptComplete]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = String(request.user?.sub || "").trim();
      if (!userId) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Valid bearer token is required"
        });
      }

      const parsed = desktopHandoffAttemptIdSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const key = `${AUTH_DESKTOP_HANDOFF_ATTEMPT_PREFIX}${parsed.data.attemptId}`;
      const raw = await fastify.redis.get(key);
      if (!raw) {
        return reply.code(404).send({
          error: "DesktopHandoffAttemptExpired",
          message: "Desktop handoff attempt is expired or invalid"
        });
      }

      let state: DesktopHandoffAttemptState | null = null;
      try {
        state = JSON.parse(raw) as DesktopHandoffAttemptState;
      } catch {
        state = null;
      }

      if (!state || !state.userId) {
        return reply.code(400).send({
          error: "DesktopHandoffAttemptInvalid",
          message: "Desktop handoff attempt payload is invalid"
        });
      }

      if (state.userId !== userId) {
        return reply.code(403).send({
          error: "DesktopHandoffAttemptForbidden",
          message: "Desktop handoff attempt belongs to another user"
        });
      }

      if (state.status === "completed") {
        return {
          ok: true,
          status: "completed"
        };
      }

      const ttlSec = await fastify.redis.ttl(key);
      if (ttlSec <= 0) {
        return {
          status: "expired"
        };
      }

      const nextState: DesktopHandoffAttemptState = {
        ...state,
        status: "completed",
        completedAt: new Date().toISOString()
      };

      await fastify.redis.setEx(key, ttlSec, JSON.stringify(nextState));

      fastify.log.info(
        buildAuthAuditContext(request, {
          event: "auth.desktop_handoff.attempt_completed",
          userId,
          attemptId: parsed.data.attemptId
        }),
        "desktop handoff attempt completed"
      );

      return {
        ok: true,
        status: "completed"
      };
    }
  );

  fastify.post(
    "/v1/auth/desktop-handoff",
    {
      preHandler: [requireAuth, limitDesktopHandoffCreate]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = String(request.user?.sub || "").trim();
      if (!userId) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Valid bearer token is required"
        });
      }

      const code = randomUUID();
      await fastify.redis.setEx(
        `${AUTH_DESKTOP_HANDOFF_PREFIX}${code}`,
        AUTH_DESKTOP_HANDOFF_TTL_SEC,
        JSON.stringify({
          userId,
          issuedAt: new Date().toISOString()
        })
      );

      fastify.log.info(
        buildAuthAuditContext(request, {
          event: "auth.desktop_handoff.issued",
          userId,
          ttlSec: AUTH_DESKTOP_HANDOFF_TTL_SEC
        }),
        "desktop handoff code issued"
      );

      return {
        ok: true,
        code,
        expiresInSec: AUTH_DESKTOP_HANDOFF_TTL_SEC
      };
    }
  );

  fastify.post(
    "/v1/auth/desktop-handoff/exchange",
    {
      preHandler: [limitDesktopHandoffExchange]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = desktopHandoffExchangeSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const key = `${AUTH_DESKTOP_HANDOFF_PREFIX}${parsed.data.code}`;
      const raw = await fastify.redis.get(key);
      if (!raw) {
        return reply.code(404).send({
          error: "DesktopHandoffExpired",
          message: "Desktop handoff code is expired or invalid"
        });
      }

      await fastify.redis.del(key);

      let handoffUserId = "";
      try {
        const payload = JSON.parse(raw) as { userId?: string };
        handoffUserId = String(payload.userId || "").trim();
      } catch {
        handoffUserId = "";
      }

      if (!handoffUserId) {
        return reply.code(400).send({
          error: "DesktopHandoffInvalid",
          message: "Desktop handoff payload is invalid"
        });
      }

      const userResult = await db.query<UserRow>(
        "SELECT id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, deleted_at, purge_scheduled_at, created_at FROM users WHERE id = $1 LIMIT 1",
        [handoffUserId]
      );

      if ((userResult.rowCount || 0) === 0) {
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

      if (user.deleted_at) {
        return sendAccountDeleted(reply, user);
      }

      const { token } = await issueAuthSessionToken(fastify, user, "sso");
      if (config.authCookieMode) {
        appendSetCookie(reply, buildSessionCookieValue(token));
      }

      return {
        authenticated: true,
        token,
        user
      };
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
        fastify.log.warn(
          buildAuthAuditContext(request, {
            event: "auth.session.refresh_denied",
            reason: "missing_session_id"
          }),
          "auth refresh denied"
        );
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Session refresh requires re-login"
        });
      }

      const { token, sessionId } = await issueAuthSessionToken(fastify, user, "sso", previousSessionId);
      if (config.authCookieMode) {
        appendSetCookie(reply, buildSessionCookieValue(token));
      }

      fastify.log.info(
        buildAuthAuditContext(request, {
          event: "auth.session.refreshed",
          previousSessionId,
          nextSessionId: sessionId,
          authMode: "sso"
        }),
        "auth session refreshed"
      );

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
        await deleteAuthSession(fastify, sessionId);
      }

      if (config.authCookieMode) {
        appendSetCookie(reply, buildSessionCookieClearValue());
      }

      fastify.log.info(
        buildAuthAuditContext(request, {
          event: "auth.session.logout",
          revokedSessionId: sessionId || null,
          authMode: "sso"
        }),
        "auth session logout"
      );

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
        "SELECT id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, deleted_at, purge_scheduled_at FROM users WHERE id = $1",
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
      if (user.deleted_at) {
        return sendAccountDeleted(reply, user);
      }
      if (user.role !== "admin" && user.role !== "super_admin" && user.access_state !== "active") {
        return reply.code(403).send({
          error: user.access_state === "blocked" ? "ServiceAccessBlocked" : "ServiceAccessPending",
          message: user.access_state === "blocked" ? "Service access is blocked" : "Service access requires admin approval"
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

      fastify.log.info(
        buildAuthAuditContext(request, {
          event: "auth.ws_ticket.issued",
          ticketTtlSec: expiresInSec,
          authMode: "sso"
        }),
        "ws ticket issued"
      );

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

      const currentUser = request.currentUser;
      if (currentUser && currentUser.role !== "admin" && currentUser.role !== "super_admin" && currentUser.access_state !== "active") {
        return reply.code(403).send({
          error: currentUser.access_state === "blocked" ? "ServiceAccessBlocked" : "ServiceAccessPending",
          message: currentUser.access_state === "blocked" ? "Service access is blocked" : "Service access requires admin approval"
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
        "SELECT id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, deleted_at, purge_scheduled_at, created_at FROM users WHERE id = $1",
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
         RETURNING id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, deleted_at, purge_scheduled_at, created_at`,
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

  fastify.delete(
    "/v1/auth/me",
    {
      preHandler: [requireAuth]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = String(request.user?.sub || "").trim();
      if (!userId) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Valid bearer token is required"
        });
      }

      const updated = await db.query<UserRow>(
        `UPDATE users
         SET deleted_at = NOW(),
             purge_scheduled_at = NOW() + INTERVAL '30 days'
         WHERE id = $1
         RETURNING id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, deleted_at, purge_scheduled_at, created_at`,
        [userId]
      );

      if ((updated.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "UserNotFound",
          message: "User does not exist"
        });
      }

      const sessionId = String(request.user?.sid || "").trim();
      if (sessionId) {
        await deleteAuthSession(fastify, sessionId);
      }
      if (config.authCookieMode) {
        appendSetCookie(reply, buildSessionCookieClearValue());
      }

      const deletionState = buildAccountDeletionState(updated.rows[0]);
      return {
        ok: true,
        purgeScheduledAt: deletionState.purgeScheduledAt,
        daysRemaining: deletionState.daysRemaining
      };
    }
  );
}
