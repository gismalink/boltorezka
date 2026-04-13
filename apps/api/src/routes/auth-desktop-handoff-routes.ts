import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../config.js";
import { normalizeBoundedString } from "../validators.js";
import type { UserRow } from "../db.types.ts";
import { appendSetCookie, buildAuthAuditContext, buildSessionCookieValue } from "./auth.helpers.js";
import { enforceUserLifecycleAccess } from "./auth-access.js";
import {
  completeDesktopHandoffAttempt,
  consumeDesktopHandoffCode,
  createDesktopHandoffAttempt,
  issueDesktopHandoffCode,
  readDesktopHandoffAttempt
} from "./auth-desktop-handoff-store.js";
import { issueAuthSessionToken } from "./auth-session.js";

const desktopHandoffExchangeSchema = z.object({
  code: z.string().trim().min(10).max(128)
});
const desktopHandoffAttemptIdSchema = z.object({
  attemptId: z.string().uuid()
});

type AuthRateLimitHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void> | void;

type AuthDesktopHandoffRouteDeps = {
  limitDesktopHandoffCreate: AuthRateLimitHandler;
  limitDesktopHandoffExchange: AuthRateLimitHandler;
  limitDesktopHandoffAttemptCreate: AuthRateLimitHandler;
  limitDesktopHandoffAttemptStatus: AuthRateLimitHandler;
  limitDesktopHandoffAttemptComplete: AuthRateLimitHandler;
};

export function registerAuthDesktopHandoffRoutes(
  fastify: FastifyInstance,
  deps: AuthDesktopHandoffRouteDeps
) {
  const {
    limitDesktopHandoffCreate,
    limitDesktopHandoffExchange,
    limitDesktopHandoffAttemptCreate,
    limitDesktopHandoffAttemptStatus,
    limitDesktopHandoffAttemptComplete
  } = deps;

  fastify.post(
    "/v1/auth/desktop-handoff/attempt",
    {
      preHandler: [requireAuth, limitDesktopHandoffAttemptCreate]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = normalizeBoundedString(request.user?.sub, 128);
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
      const userId = normalizeBoundedString(request.user?.sub, 128);
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
      const userId = normalizeBoundedString(request.user?.sub, 128);
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
      if (!enforceUserLifecycleAccess(reply, user)) {
        return;
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
}
