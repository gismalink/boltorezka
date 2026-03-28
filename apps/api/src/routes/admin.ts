import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { broadcastRealtimeEnvelope } from "../realtime-broadcast.js";
import { loadCurrentUser, requireAuth, requireRole } from "../middleware/auth.js";
import { applyServiceBan, revokeServiceBan } from "../services/ban-service.js";
import { writeServerAuditEvent } from "../services/server-audit-service.js";
import type { ServerSettingsRow, UserRow } from "../db.types.ts";
import type {
  AdminServerOverviewResponse,
  AdminServersResponse,
  AdminUsersResponse,
  PromoteUserResponse,
  ServiceBanResponse,
  ServiceBanRevokeResponse,
  ServerAudioQualityResponse,
  ServerChatImagePolicyResponse
} from "../api-contract.types.ts";

const promoteSchema = z.object({
  role: z.literal("admin").default("admin")
});

const demoteSchema = z.object({
  role: z.literal("user").default("user")
});

const accessStateSchema = z.object({
  accessState: z.enum(["pending", "active", "blocked"])
});

const audioQualitySchema = z.enum(["retro", "low", "standard", "high"]);

const serverAudioQualitySchema = z.object({
  audioQuality: audioQualitySchema
});

const serviceBanSchema = z.object({
  userId: z.string().trim().uuid(),
  reason: z.string().trim().min(1).max(500).optional(),
  expiresAt: z.string().datetime().optional()
});

const serverBlockSchema = z.object({
  blocked: z.boolean()
});

async function loadUserById(userId: string) {
  const result = await db.query<UserRow>(
    "SELECT id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, created_at FROM users WHERE id = $1",
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

function readIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(raw)));
}

function readFloatEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) {
    return fallback;
  }

  const normalized = Math.max(min, Math.min(max, raw));
  return Number(normalized.toFixed(2));
}

function loadServerChatImagePolicy(): ServerChatImagePolicyResponse {
  return {
    maxDataUrlLength: readIntEnv("CHAT_IMAGE_MAX_DATA_URL_LENGTH", 102400, 8000, 250000),
    maxImageSide: readIntEnv("CHAT_IMAGE_MAX_SIDE", 1200, 256, 4096),
    jpegQuality: readFloatEnv("CHAT_IMAGE_JPEG_QUALITY", 0.6, 0.3, 0.95)
  };
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

  fastify.get(
    "/v1/admin/server/chat-image-policy",
    {
      preHandler: [requireAuth]
    },
    async () => {
      return loadServerChatImagePolicy();
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

      broadcastRealtimeEnvelope({
        type: "audio.quality.updated",
        payload: {
          scope: "server",
          audioQuality: response.audioQuality,
          updatedAt: new Date().toISOString(),
          updatedByUserId: actorId
        }
      });

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
        `SELECT id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, created_at
         FROM users
         ORDER BY created_at ASC`
      );

      const response: AdminUsersResponse = { users: result.rows };
      return response;
    }
  );

  fastify.get(
    "/v1/admin/servers",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["super_admin", "admin"])]
    },
    async () => {
      const result = await db.query<{
        id: string;
        slug: string;
        name: string;
        isDefault: boolean;
        isBlocked: boolean;
        ownerUserId: string | null;
        ownerName: string | null;
        membersCount: number;
        roomsCount: number;
        messagesCount: number;
        activeServerBansCount: number;
        createdAt: string;
        updatedAt: string;
      }>(
        `SELECT
           s.id,
           s.slug,
           s.name,
           s.is_default AS "isDefault",
           s.is_blocked AS "isBlocked",
           s.owner_user_id AS "ownerUserId",
           owner_user.name AS "ownerName",
           COALESCE(members_stats.members_count, 0)::int AS "membersCount",
           COALESCE(rooms_stats.rooms_count, 0)::int AS "roomsCount",
           COALESCE(messages_stats.messages_count, 0)::int AS "messagesCount",
           COALESCE(bans_stats.active_bans_count, 0)::int AS "activeServerBansCount",
           s.created_at AS "createdAt",
           s.updated_at AS "updatedAt"
         FROM servers s
         LEFT JOIN users owner_user ON owner_user.id = s.owner_user_id
         LEFT JOIN (
           SELECT server_id, COUNT(*) AS members_count
           FROM server_members
           WHERE status = 'active'
           GROUP BY server_id
         ) members_stats ON members_stats.server_id = s.id
         LEFT JOIN (
           SELECT server_id, COUNT(*) AS rooms_count
           FROM rooms
           GROUP BY server_id
         ) rooms_stats ON rooms_stats.server_id = s.id
         LEFT JOIN (
           SELECT r.server_id, COUNT(*) AS messages_count
           FROM messages m
           JOIN rooms r ON r.id = m.room_id
           GROUP BY r.server_id
         ) messages_stats ON messages_stats.server_id = s.id
         LEFT JOIN (
           SELECT server_id, COUNT(*) AS active_bans_count
           FROM server_bans
           WHERE expires_at IS NULL OR expires_at > NOW()
           GROUP BY server_id
         ) bans_stats ON bans_stats.server_id = s.id
         WHERE s.is_archived = FALSE
         ORDER BY s.is_default DESC, s.created_at ASC`
      );

      const response: AdminServersResponse = { servers: result.rows };
      return response;
    }
  );

  fastify.post<{ Params: { serverId: string }; Body: { blocked: boolean } }>(
    "/v1/admin/servers/:serverId/block",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["super_admin"])]
    },
    async (request, reply) => {
      const serverId = String(request.params.serverId || "").trim();
      if (!serverId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "serverId is required"
        });
      }

      const parsed = serverBlockSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const state = await db.query<{ is_default: boolean }>(
        `SELECT is_default
         FROM servers
         WHERE id = $1
           AND is_archived = FALSE
         LIMIT 1`,
        [serverId]
      );

      if ((state.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "ServerNotFound",
          message: "Server not found"
        });
      }

      if (state.rows[0]?.is_default) {
        return reply.code(400).send({
          error: "DefaultServerCannotBeBlocked",
          message: "Default server cannot be blocked"
        });
      }

      const blocked = Boolean(parsed.data.blocked);
      await db.query(
        `UPDATE servers
         SET is_blocked = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [serverId, blocked]
      );

      await writeServerAuditEvent({
        action: blocked ? "server.blocked" : "server.unblocked",
        serverId,
        actorUserId: String(request.currentUser?.id || "").trim(),
        meta: {
          blocked
        }
      });

      return {
        serverId,
        isBlocked: blocked
      };
    }
  );

  fastify.delete<{ Params: { serverId: string } }>(
    "/v1/admin/servers/:serverId",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["super_admin"])]
    },
    async (request, reply) => {
      const serverId = String(request.params.serverId || "").trim();
      if (!serverId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "serverId is required"
        });
      }

      const state = await db.query<{ is_default: boolean; is_archived: boolean }>(
        `SELECT is_default, is_archived
         FROM servers
         WHERE id = $1
         LIMIT 1`,
        [serverId]
      );

      if ((state.rowCount || 0) === 0 || state.rows[0]?.is_archived) {
        return reply.code(404).send({
          error: "ServerNotFound",
          message: "Server not found"
        });
      }

      if (state.rows[0]?.is_default) {
        return reply.code(400).send({
          error: "DefaultServerCannotBeDeleted",
          message: "Default server cannot be deleted"
        });
      }

      const client = await db.connect();
      try {
        await client.query("BEGIN");

        const archived = await client.query(
          `UPDATE servers
           SET is_archived = TRUE,
               updated_at = NOW()
           WHERE id = $1
             AND is_archived = FALSE`,
          [serverId]
        );

        if ((archived.rowCount || 0) === 0) {
          await client.query("ROLLBACK");
          return reply.code(404).send({
            error: "ServerNotFound",
            message: "Server not found"
          });
        }

        await client.query(
          `UPDATE server_members
           SET status = 'removed'
           WHERE server_id = $1
             AND status = 'active'`,
          [serverId]
        );

        await writeServerAuditEvent({
          client,
          action: "server.deleted",
          serverId,
          actorUserId: String(request.currentUser?.id || "").trim(),
          meta: {
            actorRole: "super_admin"
          }
        });

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      return { deleted: true };
    }
  );

  fastify.get<{ Params: { serverId: string } }>(
    "/v1/admin/servers/:serverId/overview",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["super_admin", "admin"])]
    },
    async (request, reply) => {
      const serverId = String(request.params.serverId || "").trim();
      if (!serverId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "serverId is required"
        });
      }

      const base = await db.query<{
        id: string;
        slug: string;
        name: string;
        isDefault: boolean;
        ownerUserId: string | null;
        ownerName: string | null;
        createdAt: string;
        updatedAt: string;
      }>(
        `SELECT
           s.id,
           s.slug,
           s.name,
           s.is_default AS "isDefault",
           s.owner_user_id AS "ownerUserId",
           owner_user.name AS "ownerName",
           s.created_at AS "createdAt",
           s.updated_at AS "updatedAt"
         FROM servers s
         LEFT JOIN users owner_user ON owner_user.id = s.owner_user_id
         WHERE s.id = $1
           AND s.is_archived = FALSE
         LIMIT 1`,
        [serverId]
      );

      const server = base.rows[0];
      if (!server) {
        return reply.code(404).send({
          error: "ServerNotFound",
          message: "Server not found"
        });
      }

      const membersStats = await db.query<{
        total: number;
        active: number;
        invited: number;
        removed: number;
        left: number;
        owners: number;
        admins: number;
      }>(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'active')::int AS active,
           COUNT(*) FILTER (WHERE status = 'invited')::int AS invited,
           COUNT(*) FILTER (WHERE status = 'removed')::int AS removed,
           COUNT(*) FILTER (WHERE status = 'left')::int AS left,
           COUNT(*) FILTER (WHERE role = 'owner' AND status = 'active')::int AS owners,
           COUNT(*) FILTER (WHERE role = 'admin' AND status = 'active')::int AS admins
         FROM server_members
         WHERE server_id = $1`,
        [serverId]
      );

      const roomsStats = await db.query<{
        total: number;
        nsfw: number;
        archived: number;
      }>(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE nsfw = TRUE)::int AS nsfw,
           COUNT(*) FILTER (WHERE is_archived = TRUE)::int AS archived
         FROM rooms
         WHERE server_id = $1`,
        [serverId]
      );

      const messagesStats = await db.query<{ total: number }>(
        `SELECT COUNT(m.id)::int AS total
         FROM messages m
         JOIN rooms r ON r.id = m.room_id
         WHERE r.server_id = $1`,
        [serverId]
      );

      const invitesStats = await db.query<{
        total: number;
        active: number;
        revoked: number;
        expired: number;
      }>(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (
             WHERE is_revoked = FALSE
               AND (expires_at IS NULL OR expires_at > NOW())
               AND (max_uses IS NULL OR used_count < max_uses)
           )::int AS active,
           COUNT(*) FILTER (WHERE is_revoked = TRUE)::int AS revoked,
           COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= NOW())::int AS expired
         FROM server_invites
         WHERE server_id = $1`,
        [serverId]
      );

      const bansStats = await db.query<{
        total: number;
        active: number;
      }>(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE expires_at IS NULL OR expires_at > NOW())::int AS active
         FROM server_bans
         WHERE server_id = $1`,
        [serverId]
      );

      const response: AdminServerOverviewResponse = {
        server: {
          id: server.id,
          slug: server.slug,
          name: server.name,
          isDefault: server.isDefault,
          ownerUserId: server.ownerUserId,
          ownerName: server.ownerName,
          createdAt: server.createdAt,
          updatedAt: server.updatedAt,
          metrics: {
            members: membersStats.rows[0] || {
              total: 0,
              active: 0,
              invited: 0,
              removed: 0,
              left: 0,
              owners: 0,
              admins: 0
            },
            rooms: roomsStats.rows[0] || {
              total: 0,
              nsfw: 0,
              archived: 0
            },
            messages: {
              total: Number(messagesStats.rows[0]?.total || 0)
            },
            invites: invitesStats.rows[0] || {
              total: 0,
              active: 0,
              revoked: 0,
              expired: 0
            },
            serverBans: bansStats.rows[0] || {
              total: 0,
              active: 0
            }
          }
        }
      };

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
         RETURNING id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, created_at`,
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
         RETURNING id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, created_at`,
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
         RETURNING id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, created_at`,
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
         RETURNING id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, created_at`,
        [userId]
      );

      const response: PromoteUserResponse = { user: updated.rows[0] };
      return response;
    }
  );

  fastify.post<{ Params: { userId: string }; Body: { accessState?: "pending" | "active" | "blocked" } }>(
    "/v1/admin/users/:userId/access",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["super_admin", "admin"])]
    },
    async (request, reply) => {
      const parsed = accessStateSchema.safeParse(request.body || {});
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

      const targetUser = await loadUserById(userId);
      if (!targetUser) {
        return reply.code(404).send({
          error: "UserNotFound",
          message: "Target user does not exist"
        });
      }

      const actorRole = String(request.currentUser?.role || "user").trim();
      if (actorRole !== "super_admin" && targetUser.role === "super_admin") {
        return reply.code(403).send({
          error: "ProtectedUser",
          message: "Super admin access state can be changed only by super admin"
        });
      }

      const updated = await db.query<UserRow>(
        `UPDATE users
         SET access_state = $2
         WHERE id = $1
         RETURNING id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, created_at`,
        [userId, parsed.data.accessState]
      );

      const response: PromoteUserResponse = { user: updated.rows[0] };
      return response;
    }
  );

  fastify.post<{ Body: { userId: string; reason?: string; expiresAt?: string } }>(
    "/v1/admin/service-bans",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["super_admin"])]
    },
    async (request, reply) => {
      const parsed = serviceBanSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const actorUserId = String(request.currentUser?.id || "").trim();

      try {
        const ban = await applyServiceBan({
          actorUserId,
          targetUserId: parsed.data.userId,
          reason: parsed.data.reason,
          expiresAt: parsed.data.expiresAt
        });

        const response: ServiceBanResponse = {
          ban: {
            id: ban.id,
            userId: ban.user_id,
            reason: ban.reason,
            expiresAt: ban.expires_at,
            createdAt: ban.created_at
          }
        };

        return reply.code(201).send(response);
      } catch (error) {
        const message = String((error as Error)?.message || "");
        if (message === "invalid_action") {
          return reply.code(400).send({
            error: "InvalidAction",
            message: "Invalid action"
          });
        }

        if (message === "invalid_expires_at") {
          return reply.code(400).send({
            error: "ValidationError",
            message: "expiresAt must be valid ISO datetime"
          });
        }

        throw error;
      }
    }
  );

  fastify.delete<{ Params: { userId: string } }>(
    "/v1/admin/service-bans/:userId",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["super_admin"])]
    },
    async (request, reply) => {
      const targetUserId = validateTargetUserId(request.params.userId);
      if (!targetUserId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "userId is required"
        });
      }

      const actorUserId = String(request.currentUser?.id || "").trim();

      try {
        const revoked = await revokeServiceBan({
          actorUserId,
          targetUserId
        });

        const response: ServiceBanRevokeResponse = { revoked };
        return reply.code(200).send(response);
      } catch (error) {
        const message = String((error as Error)?.message || "");
        if (message === "invalid_action") {
          return reply.code(400).send({
            error: "InvalidAction",
            message: "Invalid action"
          });
        }

        throw error;
      }
    }
  );
}
