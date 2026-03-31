import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
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
  makeAuthRateLimiter
} from "./auth.helpers.js";
import {
  enforceCompactUserAccess,
  enforceUserLifecycleAccess
} from "./auth-access.js";
import { deleteAuthSession, issueAuthSessionToken } from "./auth-session.js";
import { proxyAuthGetJson, resolveSafeReturnUrl } from "./auth-sso.js";
import { upsertSsoUser } from "./auth-user-upsert.js";
import { issueWsTicket } from "./auth-ws-ticket.js";
import { registerAuthDesktopHandoffRoutes } from "./auth-desktop-handoff-routes.js";
import { registerAuthLivekitRoutes } from "./auth-livekit-routes.js";
import { registerAuthProfileRoutes } from "./auth-profile-routes.js";
import type {
  AuthModeResponse,
  SsoSessionResponse,
  WsTicketResponse
} from "../api-contract.types.ts";

const ssoProviderSchema = z.enum(["google", "yandex"]);

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

      if (!enforceUserLifecycleAccess(reply, localUser)) {
        return;
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
        if (!enforceUserLifecycleAccess(reply, localUser)) {
          return;
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

  registerAuthDesktopHandoffRoutes(fastify, {
    limitDesktopHandoffCreate,
    limitDesktopHandoffExchange,
    limitDesktopHandoffAttemptCreate,
    limitDesktopHandoffAttemptStatus,
    limitDesktopHandoffAttemptComplete
  });

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
      if (!enforceCompactUserAccess(reply, user)) {
        return;
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

  registerAuthLivekitRoutes(fastify);

  registerAuthProfileRoutes(fastify);
}
