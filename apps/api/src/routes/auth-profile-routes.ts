import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../config.js";
import type { UserRow } from "../db.types.ts";
import type { MeResponse } from "../api-contract.types.ts";
import {
  appendSetCookie,
  buildAccountDeletionState,
  buildSessionCookieClearValue
} from "./auth.helpers.js";
import { deleteAuthSession } from "./auth-session.js";

const uiThemeSchema = z.enum(["8-neon-bit", "material-classic", "aka-dis", "alpha-strike"]);
const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  uiTheme: uiThemeSchema.optional()
});

export function registerAuthProfileRoutes(fastify: FastifyInstance) {
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
