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
import { upsertSsoUser } from "./auth-user-upsert.js";
import { resolveLivekitClientUrl } from "./auth-livekit.js";
import {
  completeDesktopHandoffAttempt,
  consumeDesktopHandoffCode,
  createDesktopHandoffAttempt,
  desktopHandoffTtlSec,
  issueDesktopHandoffCode,
  readDesktopHandoffAttempt
} from "./auth-desktop-handoff-store.js";
import { issueWsTicket } from "./auth-ws-ticket.js";
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

      const attempt = await createDesktopHandoffAttempt(fastify.redis, userId);

      fastify.log.info(
        buildAuthAuditContext(request, {
          event: "auth.desktop_handoff.attempt_created",
          userId,
          attemptId: attempt.attemptId,
          ttlSec: attempt.expiresInSec
        }),
        "desktop handoff attempt created"
      );

      return {
        ok: true,
        attemptId: attempt.attemptId,
        expiresInSec: attempt.expiresInSec
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

      const state = await readDesktopHandoffAttempt(fastify.redis, parsed.data.attemptId);
      if (!state) {
        return {
          status: "expired"
        };
      }

      if (state.status === "completed") {
        return {
          status: "completed"
        };
      }

      return {
        status: "pending"
      };
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

      const state = await readDesktopHandoffAttempt(fastify.redis, parsed.data.attemptId);
      if (!state) {
        return reply.code(404).send({
          error: "DesktopHandoffAttemptExpired",
          message: "Desktop handoff attempt is expired or invalid"
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

      const completionStatus = await completeDesktopHandoffAttempt(
        fastify.redis,
        parsed.data.attemptId,
        state
      );
      if (completionStatus === "expired") {
        return {
          status: "expired"
        };
      }

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

      const handoffCode = await issueDesktopHandoffCode(fastify.redis, userId);

      fastify.log.info(
        buildAuthAuditContext(request, {
          event: "auth.desktop_handoff.issued",
          userId,
          ttlSec: handoffCode.expiresInSec
        }),
        "desktop handoff code issued"
      );

      return {
        ok: true,
        code: handoffCode.code,
        expiresInSec: handoffCode.expiresInSec
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

      const consumed = await consumeDesktopHandoffCode(fastify.redis, parsed.data.code);
      if (consumed.status === "missing") {
        return reply.code(404).send({
          error: "DesktopHandoffExpired",
          message: "Desktop handoff code is expired or invalid"
        });
      }

      if (consumed.status === "invalid") {
        return reply.code(400).send({
          error: "DesktopHandoffInvalid",
          message: "Desktop handoff payload is invalid"
        });
      }

      const userResult = await db.query<UserRow>(
        "SELECT id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, deleted_at, purge_scheduled_at, created_at FROM users WHERE id = $1 LIMIT 1",
        [consumed.userId]
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
      const response: WsTicketResponse = await issueWsTicket(fastify.redis, user);

      fastify.log.info(
        buildAuthAuditContext(request, {
          event: "auth.ws_ticket.issued",
          ticketTtlSec: response.expiresInSec,
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
