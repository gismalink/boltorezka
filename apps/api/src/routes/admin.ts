import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { loadCurrentUser, requireAuth, requireRole } from "../middleware/auth.js";
import type { ServerSettingsRow, UserRow } from "../db.types.ts";
import type { AdminUsersResponse, PromoteUserResponse, ServerAudioQualityResponse } from "../api-contract.types.ts";

const promoteSchema = z.object({
  role: z.literal("admin").default("admin")
});

const demoteSchema = z.object({
  role: z.literal("user").default("user")
});

const audioQualitySchema = z.enum(["retro", "low", "standard", "high"]);

const serverAudioQualitySchema = z.object({
  audioQuality: audioQualitySchema
});

async function loadUserById(userId: string) {
  const result = await db.query<UserRow>(
    "SELECT id, email, name, role, is_banned, created_at FROM users WHERE id = $1",
    [userId]
  );
  return result.rows[0] || null;
}

function validateTargetUserId(userIdRaw: string) {
  const userId = String(userIdRaw || "").trim();
  return userId;
}

async function loadServerAudioQuality() {
  const result = await db.query<ServerSettingsRow>(
    "SELECT id, audio_quality, updated_at, updated_by FROM server_settings WHERE id = TRUE"
  );

  if ((result.rowCount || 0) === 0) {
    await db.query(
      `INSERT INTO server_settings (id, audio_quality)
       VALUES (TRUE, 'standard')
       ON CONFLICT (id) DO NOTHING`
    );
    return "standard" as const;
  }

  const value = String(result.rows[0]?.audio_quality || "standard").trim();
  if (value === "retro" || value === "low" || value === "high" || value === "standard") {
    return value;
  }

  return "standard" as const;
}

export async function adminRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/v1/admin/server/audio-quality",
    {
      preHandler: [requireAuth]
    },
    async () => {
      const audioQuality = await loadServerAudioQuality();
      const response: ServerAudioQualityResponse = { audioQuality };
      return response;
    }
  );

  fastify.put<{ Body: { audioQuality: "retro" | "low" | "standard" | "high" } }>(
    "/v1/admin/server/audio-quality",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["super_admin"])]
    },
    async (request, reply) => {
      const parsed = serverAudioQualitySchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const actorId = String(request.currentUser?.id || "").trim() || null;
      const updated = await db.query<ServerSettingsRow>(
        `INSERT INTO server_settings (id, audio_quality, updated_by, updated_at)
         VALUES (TRUE, $1, $2, NOW())
         ON CONFLICT (id) DO UPDATE
         SET audio_quality = EXCLUDED.audio_quality,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()
         RETURNING id, audio_quality, updated_at, updated_by`,
        [parsed.data.audioQuality, actorId]
      );

      const audioQuality = String(updated.rows[0]?.audio_quality || "standard").trim();
      const response: ServerAudioQualityResponse = {
        audioQuality: audioQuality === "retro" || audioQuality === "low" || audioQuality === "high" ? audioQuality : "standard"
      };
      return response;
    }
  );

  fastify.get(
    "/v1/admin/users",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["super_admin", "admin"])]
    },
    async () => {
      const result = await db.query<UserRow>(
        `SELECT id, email, name, role, is_banned, created_at
         FROM users
         ORDER BY created_at ASC`
      );

      const response: AdminUsersResponse = { users: result.rows };
      return response;
    }
  );

  fastify.post<{ Params: { userId: string }; Body: { role?: "admin" } }>(
    "/v1/admin/users/:userId/promote",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["super_admin"])]
    },
    async (request, reply) => {
      const parsed = promoteSchema.safeParse(request.body || {});

      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const userId = String(request.params.userId || "").trim();
      if (!userId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "userId is required"
        });
      }

      const targetUser = await loadUserById(userId);

      if (!targetUser) {
        return reply.code(404).send({
          error: "UserNotFound",
          message: "Target user does not exist"
        });
      }

      if (targetUser.role === "super_admin") {
        const response: PromoteUserResponse = { user: targetUser };
        return reply.code(200).send(response);
      }

      const updated = await db.query<UserRow>(
        `UPDATE users
         SET role = 'admin'
         WHERE id = $1
         RETURNING id, email, name, role, is_banned, created_at`,
        [userId]
      );

      const response: PromoteUserResponse = { user: updated.rows[0] };
      return response;
    }
  );

  fastify.post<{ Params: { userId: string }; Body: { role?: "user" } }>(
    "/v1/admin/users/:userId/demote",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["super_admin"])]
    },
    async (request, reply) => {
      const parsed = demoteSchema.safeParse(request.body || {});

      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const userId = validateTargetUserId(request.params.userId);
      if (!userId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "userId is required"
        });
      }

      const actorId = String(request.currentUser?.id || "").trim();
      if (actorId && actorId === userId) {
        return reply.code(400).send({
          error: "InvalidAction",
          message: "Self-demote is not allowed"
        });
      }

      const targetUser = await loadUserById(userId);
      if (!targetUser) {
        return reply.code(404).send({
          error: "UserNotFound",
          message: "Target user does not exist"
        });
      }

      if (targetUser.role === "super_admin") {
        return reply.code(403).send({
          error: "ProtectedUser",
          message: "Super admin cannot be demoted"
        });
      }

      const updated = await db.query<UserRow>(
        `UPDATE users
         SET role = 'user'
         WHERE id = $1
         RETURNING id, email, name, role, is_banned, created_at`,
        [userId]
      );

      const response: PromoteUserResponse = { user: updated.rows[0] };
      return response;
    }
  );

  fastify.post<{ Params: { userId: string } }>(
    "/v1/admin/users/:userId/ban",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["super_admin"])]
    },
    async (request, reply) => {
      const userId = validateTargetUserId(request.params.userId);
      if (!userId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "userId is required"
        });
      }

      const actorId = String(request.currentUser?.id || "").trim();
      if (actorId && actorId === userId) {
        return reply.code(400).send({
          error: "InvalidAction",
          message: "Self-ban is not allowed"
        });
      }

      const targetUser = await loadUserById(userId);
      if (!targetUser) {
        return reply.code(404).send({
          error: "UserNotFound",
          message: "Target user does not exist"
        });
      }

      if (targetUser.role === "super_admin") {
        return reply.code(403).send({
          error: "ProtectedUser",
          message: "Super admin cannot be banned"
        });
      }

      const updated = await db.query<UserRow>(
        `UPDATE users
         SET is_banned = TRUE
         WHERE id = $1
         RETURNING id, email, name, role, is_banned, created_at`,
        [userId]
      );

      const response: PromoteUserResponse = { user: updated.rows[0] };
      return response;
    }
  );

  fastify.post<{ Params: { userId: string } }>(
    "/v1/admin/users/:userId/unban",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["super_admin"])]
    },
    async (request, reply) => {
      const userId = validateTargetUserId(request.params.userId);
      if (!userId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "userId is required"
        });
      }

      const targetUser = await loadUserById(userId);
      if (!targetUser) {
        return reply.code(404).send({
          error: "UserNotFound",
          message: "Target user does not exist"
        });
      }

      const updated = await db.query<UserRow>(
        `UPDATE users
         SET is_banned = FALSE
         WHERE id = $1
         RETURNING id, email, name, role, is_banned, created_at`,
        [userId]
      );

      const response: PromoteUserResponse = { user: updated.rows[0] };
      return response;
    }
  );
}
