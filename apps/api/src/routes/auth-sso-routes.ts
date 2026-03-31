import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { config } from "../config.js";
import type { UserRow } from "../db.types.ts";
import type { SsoSessionResponse } from "../api-contract.types.ts";
import {
  appendSetCookie,
  buildAuthAuditContext,
  buildSessionCookieClearValue,
  buildSessionCookieValue
} from "./auth.helpers.js";
import { enforceUserLifecycleAccess } from "./auth-access.js";
import { issueAuthSessionToken } from "./auth-session.js";
import { proxyAuthGetJson, resolveSafeReturnUrl } from "./auth-sso.js";
import { upsertSsoUser } from "./auth-user-upsert.js";

type AuthRateLimitHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void;

type AuthSsoRouteDeps = {
  limitSsoStart: AuthRateLimitHandler;
  limitSsoSession: AuthRateLimitHandler;
  limitSsoRestore: AuthRateLimitHandler;
};

const ssoProviderSchema = z.enum(["google", "yandex"]);

export function registerAuthSsoRoutes(fastify: FastifyInstance, deps: AuthSsoRouteDeps) {
  const { limitSsoStart, limitSsoSession, limitSsoRestore } = deps;

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
}
