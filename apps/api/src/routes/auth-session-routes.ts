import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../config.js";
import type { UserCompactRow } from "../db.types.ts";
import { appendSetCookie, buildAuthAuditContext, buildSessionCookieClearValue, buildSessionCookieValue } from "./auth.helpers.js";
import { enforceCompactUserAccess } from "./auth-access.js";
import { deleteAuthSession, issueAuthSessionToken } from "./auth-session.js";
import { issueWsTicket } from "./auth-ws-ticket.js";
import { upsertSsoUser } from "./auth-user-upsert.js";
import type { WsTicketResponse } from "../api-contract.types.ts";

type AuthRateLimitHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void;

type AuthSessionRouteDeps = {
  limitRefresh: AuthRateLimitHandler;
  limitLogout: AuthRateLimitHandler;
  limitWsTicket: AuthRateLimitHandler;
};

export function registerAuthSessionRoutes(fastify: FastifyInstance, deps: AuthSessionRouteDeps) {
  const { limitRefresh, limitLogout, limitWsTicket } = deps;
  const smokeBootstrapSchema = z.object({
    email: z.string().email().toLowerCase().trim()
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

  fastify.post<{ Body: { email?: string } }>(
    "/v1/auth/smoke/bootstrap",
    {
      preHandler: [limitRefresh]
    },
    async (request, reply) => {
      if (!config.smokeAuthBootstrapEnabled) {
        return reply.code(404).send({
          error: "NotFound",
          message: "Route is not available"
        });
      }

      const parsed = smokeBootstrapSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "email is required"
        });
      }

      const email = String(parsed.data.email || "").trim().toLowerCase();
      if (!email.endsWith("@example.test")) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Only test users are allowed"
        });
      }

      const user = await upsertSsoUser({ email });
      const { token, sessionId } = await issueAuthSessionToken(fastify, user, "sso");
      if (config.authCookieMode) {
        appendSetCookie(reply, buildSessionCookieValue(token));
      }

      fastify.log.info(
        buildAuthAuditContext(request, {
          event: "auth.smoke.bootstrap",
          userId: user.id,
          authMode: "sso",
          sessionId
        }),
        "smoke auth bootstrap issued"
      );

      return {
        authenticated: true,
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
      const requestedServerId = String((request.query as { serverId?: unknown } | undefined)?.serverId || "").trim();
      let resolvedServerId: string | null = null;

      if (requestedServerId) {
        const membership = await db.query<{ server_id: string }>(
          `SELECT sm.server_id
           FROM server_members sm
           JOIN servers s ON s.id = sm.server_id
           WHERE sm.server_id = $1
             AND sm.user_id = $2
             AND sm.status = 'active'
             AND s.is_archived = FALSE
             AND s.is_blocked = FALSE
           LIMIT 1`,
          [requestedServerId, user.id]
        );
        resolvedServerId = String(membership.rows[0]?.server_id || "").trim() || null;
      }

      const response: WsTicketResponse = await issueWsTicket(
        fastify.redis,
        user,
        resolvedServerId
      );

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
}
