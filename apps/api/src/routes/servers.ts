import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import {
  loadCurrentUser,
  requireAuth,
  requireNotServerBanned,
  requireNotServiceBanned,
  requireServerMembership,
  requireServiceAccess
} from "../middleware/auth.js";
import {
  createServerForUser,
  deleteServerForUser,
  getDefaultServerContextForUser,
  getServerForUser,
  leaveServerForUser,
  listServerMembers,
  listUserServers,
  removeServerMemberForUser,
  renameServerForUser,
  transferServerOwnershipForUser
} from "../services/server-service.js";
import { disconnectRealtimeSocketsForUser } from "../realtime-broadcast.js";
import { createServerInvite } from "../services/invite-service.js";
import { applyServerBan, revokeServerBan } from "../services/ban-service.js";
import { makeRateLimiter } from "../middleware/rate-limit.js";
import { confirmServerAge, getServerAgeConfirmation, revokeServerAgeConfirmation } from "../services/age-verification-service.js";
import type {
  InviteCreateResponse,
  ServerAgeConfirmResponse,
  ServerAgeStatusResponse,
  ServerCreateResponse,
  ServerDeleteResponse,
  ServerBanResponse,
  ServerBanRevokeResponse,
  ServerGetResponse,
  ServerMemberLeaveResponse,
  ServerMemberRemoveResponse,
  ServerMemberProfileResponse,
  ServerOwnerTransferResponse,
  ServerMembersResponse,
  ServerRolesResponse,
  ServerRenameResponse,
  ServersListResponse
} from "../api-contract.types.ts";

const createServerSchema = z.object({
  name: z.string().trim().min(3).max(64)
});

const renameServerSchema = z.object({
  name: z.string().trim().min(3).max(64)
});

const createInviteSchema = z.object({
  ttlHours: z.number().int().min(1).max(24 * 30).optional(),
  maxUses: z.number().int().min(1).max(1000).optional()
});

const createServerBanSchema = z.object({
  userId: z.string().trim().uuid(),
  reason: z.string().trim().min(1).max(500).optional(),
  expiresAt: z.string().datetime().optional()
});

const transferServerOwnerSchema = z.object({
  userId: z.string().trim().uuid()
});

const serverRoleUpsertSchema = z.object({
  name: z.string().trim().min(2).max(64)
});

const serverMemberCustomRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()).max(100)
});

const serverMemberHiddenAccessSchema = z.object({
  roomIds: z.array(z.string().uuid()).max(500)
});

export async function serversRoutes(fastify: FastifyInstance) {
  const limitInviteCreate = makeRateLimiter({
    namespace: "server.invite.create",
    max: 20,
    windowSec: 60,
    message: "Too many invite create attempts"
  });

  const baseServerRoles = ["member", "admin", "owner"] as const;

  const canManageServerMeta = (role: string) => role === "owner" || role === "admin";

  const requireServerMetaManage = (request: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) => {
    const role = String(request.currentServer?.role || "").trim();
    if (canManageServerMeta(role)) {
      return true;
    }

    reply.code(403).send({
      error: "forbidden_role",
      message: "Insufficient server role"
    });
    return false;
  };

  fastify.post<{ Body: { name: string } }>(
    "/v1/servers",
    {
      preHandler: [requireAuth, requireServiceAccess, requireNotServiceBanned, loadCurrentUser]
    },
    async (request, reply) => {
      const parsed = createServerSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const userId = String(request.currentUser?.id || "").trim();
      const userRole = request.currentUser?.role || "user";

      try {
        const server = await createServerForUser({
          name: parsed.data.name,
          ownerUserId: userId,
          creatorRole: userRole
        });

        const response: ServerCreateResponse = { server };
        return reply.code(201).send(response);
      } catch (error) {
        const message = String((error as Error)?.message || "");
        if (message === "server_limit_reached") {
          return reply.code(409).send({
            error: "ServerLimitReached",
            message: "Free server limit reached"
          });
        }

        throw error;
      }
    }
  );

  fastify.get(
    "/v1/servers",
    {
      preHandler: [requireAuth, requireServiceAccess, requireNotServiceBanned, loadCurrentUser]
    },
    async (request) => {
      const userId = String(request.currentUser?.id || "").trim();
      const servers = await listUserServers(userId);
      const response: ServersListResponse = { servers };
      return response;
    }
  );

  fastify.get<{ Params: { serverId: string } }>(
    "/v1/servers/:serverId",
    {
      preHandler: [requireAuth, requireServiceAccess, requireNotServiceBanned, loadCurrentUser]
    },
    async (request, reply) => {
      const serverId = String(request.params.serverId || "").trim();
      const userId = String(request.currentUser?.id || "").trim();

      const server = await getServerForUser(serverId, userId);
      if (!server) {
        return reply.code(404).send({
          error: "ServerNotFound",
          message: "Server not found"
        });
      }

      const response: ServerGetResponse = { server };
      return response;
    }
  );

  fastify.get<{ Params: { serverId: string } }>(
    "/v1/servers/:serverId/members",
    {
      preHandler: [
        requireAuth,
        requireServiceAccess,
        requireNotServiceBanned,
        loadCurrentUser,
        requireServerMembership,
        requireNotServerBanned
      ]
    },
    async (request) => {
      const serverId = String(request.params.serverId || "").trim();
      const members = await listServerMembers(serverId);
      const response: ServerMembersResponse = {
        serverId,
        members
      };
      return response;
    }
  );

  fastify.get<{ Params: { serverId: string; userId: string } }>(
    "/v1/servers/:serverId/members/:userId/profile",
    {
      preHandler: [
        requireAuth,
        requireServiceAccess,
        requireNotServiceBanned,
        loadCurrentUser,
        requireServerMembership,
        requireNotServerBanned
      ]
    },
    async (request, reply) => {
      const serverId = String(request.params.serverId || "").trim();
      const userId = String(request.params.userId || "").trim();

      const memberResult = await db.query<{
        userId: string;
        name: string;
        email: string;
        joinedAt: string;
        role: "owner" | "admin" | "member";
      }>(
        `SELECT sm.user_id AS "userId", u.name, u.email, sm.joined_at AS "joinedAt", sm.role
         FROM server_members sm
         JOIN users u ON u.id = sm.user_id
         WHERE sm.server_id = $1
           AND sm.user_id = $2
           AND sm.status = 'active'
         LIMIT 1`,
        [serverId, userId]
      );

      if ((memberResult.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "ServerMemberNotFound",
          message: "Server member not found"
        });
      }

      const customRolesResult = await db.query<{ id: string; name: string }>(
        `SELECT scr.id, scr.name
         FROM server_member_custom_roles smcr
         JOIN server_custom_roles scr ON scr.id = smcr.role_id
         WHERE smcr.server_id = $1
           AND smcr.user_id = $2
         ORDER BY scr.name ASC`,
        [serverId, userId]
      );

      const hiddenAccessResult = await db.query<{ roomId: string; roomSlug: string; roomTitle: string }>(
        `SELECT r.id AS "roomId", r.slug AS "roomSlug", r.title AS "roomTitle"
         FROM room_visibility_grants rvg
         JOIN rooms r ON r.id = rvg.room_id
         WHERE r.server_id = $1
           AND r.is_archived = FALSE
           AND r.is_hidden = TRUE
           AND rvg.user_id = $2
         ORDER BY r.title ASC`,
        [serverId, userId]
      );

      const hiddenRoomsAvailableResult = await db.query<{
        roomId: string;
        roomSlug: string;
        roomTitle: string;
        hasAccess: boolean;
      }>(
        `SELECT
           r.id AS "roomId",
           r.slug AS "roomSlug",
           r.title AS "roomTitle",
           EXISTS (
             SELECT 1
             FROM room_visibility_grants rvg
             WHERE rvg.room_id = r.id
               AND rvg.user_id = $2
           ) AS "hasAccess"
         FROM rooms r
         WHERE r.server_id = $1
           AND r.is_archived = FALSE
           AND r.is_hidden = TRUE
         ORDER BY r.title ASC`,
        [serverId, userId]
      );

      const response: ServerMemberProfileResponse = {
        serverId,
        member: {
          ...memberResult.rows[0],
          customRoles: customRolesResult.rows,
          hiddenRoomAccess: hiddenAccessResult.rows,
          hiddenRoomsAvailable: hiddenRoomsAvailableResult.rows
        }
      };

      return response;
    }
  );

  fastify.put<{ Params: { serverId: string; userId: string }; Body: { roleIds: string[] } }>(
    "/v1/servers/:serverId/members/:userId/custom-roles",
    {
      preHandler: [
        requireAuth,
        requireServiceAccess,
        requireNotServiceBanned,
        loadCurrentUser,
        requireServerMembership,
        requireNotServerBanned
      ]
    },
    async (request, reply) => {
      if (!requireServerMetaManage(request, reply)) {
        return;
      }

      const parsed = serverMemberCustomRolesSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const serverId = String(request.params.serverId || "").trim();
      const userId = String(request.params.userId || "").trim();
      const roleIds = Array.from(new Set(parsed.data.roleIds.map((value) => String(value || "").trim()).filter(Boolean)));

      const roleCheck = await db.query<{ id: string }>(
        `SELECT id
         FROM server_custom_roles
         WHERE server_id = $1
           AND id = ANY($2::uuid[])`,
        [serverId, roleIds]
      );

      if (roleCheck.rows.length !== roleIds.length) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "Some roleIds are invalid for this server"
        });
      }

      await db.query(
        `DELETE FROM server_member_custom_roles
         WHERE server_id = $1
           AND user_id = $2`,
        [serverId, userId]
      );

      for (const roleId of roleIds) {
        await db.query(
          `INSERT INTO server_member_custom_roles (server_id, user_id, role_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (server_id, user_id, role_id) DO NOTHING`,
          [serverId, userId, roleId]
        );
      }

      return { ok: true, serverId, userId, roleIds };
    }
  );

  fastify.put<{ Params: { serverId: string; userId: string }; Body: { roomIds: string[] } }>(
    "/v1/servers/:serverId/members/:userId/hidden-room-access",
    {
      preHandler: [
        requireAuth,
        requireServiceAccess,
        requireNotServiceBanned,
        loadCurrentUser,
        requireServerMembership,
        requireNotServerBanned
      ]
    },
    async (request, reply) => {
      if (!requireServerMetaManage(request, reply)) {
        return;
      }

      const parsed = serverMemberHiddenAccessSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const serverId = String(request.params.serverId || "").trim();
      const userId = String(request.params.userId || "").trim();
      const roomIds = Array.from(new Set(parsed.data.roomIds.map((value) => String(value || "").trim()).filter(Boolean)));

      const roomCheck = await db.query<{ id: string }>(
        `SELECT id
         FROM rooms
         WHERE server_id = $1
           AND is_archived = FALSE
           AND is_hidden = TRUE
           AND id = ANY($2::uuid[])`,
        [serverId, roomIds]
      );

      if (roomCheck.rows.length !== roomIds.length) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "Some roomIds are invalid hidden rooms for this server"
        });
      }

      await db.query(
        `DELETE FROM room_visibility_grants rvg
         USING rooms r
         WHERE rvg.room_id = r.id
           AND r.server_id = $1
           AND r.is_hidden = TRUE
           AND rvg.user_id = $2`,
        [serverId, userId]
      );

      const actorId = String(request.currentUser?.id || "").trim() || null;
      for (const roomId of roomIds) {
        await db.query(
          `INSERT INTO room_visibility_grants (room_id, user_id, granted_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (room_id, user_id) DO UPDATE SET granted_by = EXCLUDED.granted_by`,
          [roomId, userId, actorId]
        );

        await db.query(
          `INSERT INTO room_members (room_id, user_id, role)
           VALUES ($1, $2, 'member')
           ON CONFLICT (room_id, user_id) DO NOTHING`,
          [roomId, userId]
        );
      }

      return { ok: true, serverId, userId, roomIds };
    }
  );

  fastify.delete<{ Params: { serverId: string } }>(
    "/v1/servers/:serverId/members/me",
    {
      preHandler: [
        requireAuth,
        requireServiceAccess,
        requireNotServiceBanned,
        loadCurrentUser,
        requireServerMembership,
        requireNotServerBanned
      ]
    },
    async (request, reply) => {
      const serverId = String(request.params.serverId || "").trim();
      const userId = String(request.currentUser?.id || "").trim();

      try {
        const result = await leaveServerForUser({
          serverId,
          userId
        });

        if (!result.left) {
          return reply.code(404).send({
            error: "ServerMemberNotFound",
            message: "Server member not found"
          });
        }

        const response: ServerMemberLeaveResponse = { left: true };
        return response;
      } catch (error) {
        const message = String((error as Error)?.message || "");
        if (message === "owner_cannot_leave") {
          return reply.code(409).send({
            error: "OwnerCannotLeave",
            message: "Owner cannot leave server"
          });
        }

        throw error;
      }
    }
  );

  fastify.delete<{ Params: { serverId: string; userId: string } }>(
    "/v1/servers/:serverId/members/:userId",
    {
      preHandler: [
        requireAuth,
        requireServiceAccess,
        requireNotServiceBanned,
        loadCurrentUser,
        requireServerMembership,
        requireNotServerBanned
      ]
    },
    async (request, reply) => {
      const serverId = String(request.params.serverId || "").trim();
      const actorUserId = String(request.currentUser?.id || "").trim();
      const targetUserId = String(request.params.userId || "").trim();

      try {
        const result = await removeServerMemberForUser({
          serverId,
          actorUserId,
          targetUserId
        });

        if (!result.removed) {
          return reply.code(404).send({
            error: "ServerMemberNotFound",
            message: "Server member not found"
          });
        }

        disconnectRealtimeSocketsForUser(targetUserId, 4009, "Removed from server");

        const response: ServerMemberRemoveResponse = { removed: true };
        return response;
      } catch (error) {
        const message = String((error as Error)?.message || "");
        if (message === "forbidden_role") {
          return reply.code(403).send({
            error: "forbidden_role",
            message: "Insufficient server role"
          });
        }

        if (message === "owner_cannot_be_removed") {
          return reply.code(409).send({
            error: "OwnerCannotBeRemoved",
            message: "Owner cannot be removed"
          });
        }

        if (message === "use_leave_for_self") {
          return reply.code(409).send({
            error: "UseLeaveForSelf",
            message: "Use leave endpoint to remove self"
          });
        }

        throw error;
      }
    }
  );

  fastify.post<{ Params: { serverId: string }; Body: { userId: string } }>(
    "/v1/servers/:serverId/owner",
    {
      preHandler: [
        requireAuth,
        requireServiceAccess,
        requireNotServiceBanned,
        loadCurrentUser,
        requireServerMembership,
        requireNotServerBanned
      ]
    },
    async (request, reply) => {
      const parsed = transferServerOwnerSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const serverId = String(request.params.serverId || "").trim();
      const actorUserId = String(request.currentUser?.id || "").trim();
      const targetUserId = String(parsed.data.userId || "").trim();

      try {
        const result = await transferServerOwnershipForUser({
          serverId,
          actorUserId,
          targetUserId
        });

        if (!result.transferred) {
          return reply.code(404).send({
            error: "ServerNotFound",
            message: "Server not found"
          });
        }

        const response: ServerOwnerTransferResponse = { transferred: true };
        return response;
      } catch (error) {
        const message = String((error as Error)?.message || "");
        if (message === "forbidden_role") {
          return reply.code(403).send({
            error: "forbidden_role",
            message: "Insufficient server role"
          });
        }

        if (message === "target_not_member") {
          return reply.code(404).send({
            error: "ServerMemberNotFound",
            message: "Target user is not an active server member"
          });
        }

        if (message === "transfer_to_self") {
          return reply.code(409).send({
            error: "OwnerTransferToSelf",
            message: "Owner transfer target must be another member"
          });
        }

        if (message === "owner_changed") {
          return reply.code(409).send({
            error: "OwnerChanged",
            message: "Server owner changed, retry operation"
          });
        }

        throw error;
      }
    }
  );

  fastify.patch<{ Params: { serverId: string }; Body: { name: string } }>(
    "/v1/servers/:serverId",
    {
      preHandler: [requireAuth, requireServiceAccess, requireNotServiceBanned, loadCurrentUser]
    },
    async (request, reply) => {
      const parsed = renameServerSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const serverId = String(request.params.serverId || "").trim();
      const actorUserId = String(request.currentUser?.id || "").trim();

      try {
        const server = await renameServerForUser({
          serverId,
          actorUserId,
          name: parsed.data.name
        });

        if (!server) {
          return reply.code(404).send({
            error: "ServerNotFound",
            message: "Server not found"
          });
        }

        const response: ServerRenameResponse = { server };
        return response;
      } catch (error) {
        const message = String((error as Error)?.message || "");
        if (message === "forbidden_role") {
          return reply.code(403).send({
            error: "forbidden_role",
            message: "Insufficient server role"
          });
        }

        throw error;
      }
    }
  );

  fastify.delete<{ Params: { serverId: string } }>(
    "/v1/servers/:serverId",
    {
      preHandler: [
        requireAuth,
        requireServiceAccess,
        requireNotServiceBanned,
        loadCurrentUser,
        requireServerMembership,
        requireNotServerBanned
      ]
    },
    async (request, reply) => {
      const serverId = String(request.params.serverId || "").trim();
      const actorUserId = String(request.currentUser?.id || "").trim();

      try {
        const result = await deleteServerForUser({
          serverId,
          actorUserId
        });

        if (!result.deleted) {
          return reply.code(404).send({
            error: "ServerNotFound",
            message: "Server not found"
          });
        }

        const response: ServerDeleteResponse = { deleted: true };
        return response;
      } catch (error) {
        const message = String((error as Error)?.message || "");
        if (message === "forbidden_role") {
          return reply.code(403).send({
            error: "forbidden_role",
            message: "Insufficient server role"
          });
        }

        if (message === "default_server_cannot_be_deleted") {
          return reply.code(409).send({
            error: "DefaultServerCannotBeDeleted",
            message: "Default server cannot be deleted"
          });
        }

        throw error;
      }
    }
  );

  fastify.get(
    "/v1/servers/default",
    {
      preHandler: [requireAuth, requireServiceAccess, requireNotServiceBanned, loadCurrentUser]
    },
    async (request, reply) => {
      const userId = String(request.currentUser?.id || "").trim();
      const server = await getDefaultServerContextForUser(userId);
      if (!server) {
        return reply.code(404).send({
          error: "ServerNotFound",
          message: "Default server not found"
        });
      }

      return { server };
    }
  );

  fastify.get<{ Params: { serverId: string } }>(
    "/v1/servers/:serverId/age-confirm",
    {
      preHandler: [
        requireAuth,
        requireServiceAccess,
        requireNotServiceBanned,
        loadCurrentUser,
        requireServerMembership,
        requireNotServerBanned
      ]
    },
    async (request) => {
      const serverId = String(request.params.serverId || "").trim();
      const userId = String(request.currentUser?.id || "").trim();
      const confirmation = await getServerAgeConfirmation(serverId, userId);

      const response: ServerAgeStatusResponse = {
        serverId,
        confirmed: Boolean(confirmation),
        confirmedAt: confirmation?.confirmedAt || null
      };

      return response;
    }
  );

  fastify.post<{ Params: { serverId: string }; Body: { source?: string; revoke?: boolean } }>(
    "/v1/servers/:serverId/age-confirm",
    {
      preHandler: [
        requireAuth,
        requireServiceAccess,
        requireNotServiceBanned,
        loadCurrentUser,
        requireServerMembership,
        requireNotServerBanned
      ]
    },
    async (request) => {
      const serverId = String(request.params.serverId || "").trim();
      const userId = String(request.currentUser?.id || "").trim();
      const payload = (request.body as { source?: unknown; revoke?: unknown } | undefined) || {};
      const source = String(payload.source || "").trim() || "explicit-ui";
      const revokeRequested = payload.revoke === true;

      if (revokeRequested) {
        await revokeServerAgeConfirmation({
          serverId,
          userId,
          source
        });

        const revokeResponse: ServerAgeConfirmResponse = {
          ok: true,
          serverId,
          confirmed: false,
          confirmedAt: null
        };

        return revokeResponse;
      }

      const confirmation = await confirmServerAge({
        serverId,
        userId,
        source
      });

      const response: ServerAgeConfirmResponse = {
        ok: true,
        serverId,
        confirmed: true,
        confirmedAt: confirmation.confirmedAt
      };

      return response;
    }
  );

  fastify.delete<{ Params: { serverId: string }; Body: { source?: string } }>(
    "/v1/servers/:serverId/age-confirm",
    {
      preHandler: [
        requireAuth,
        requireServiceAccess,
        requireNotServiceBanned,
        loadCurrentUser,
        requireServerMembership,
        requireNotServerBanned
      ]
    },
    async (request) => {
      const serverId = String(request.params.serverId || "").trim();
      const userId = String(request.currentUser?.id || "").trim();
      const source = String((request.body as { source?: unknown } | undefined)?.source || "").trim() || "explicit-ui";

      await revokeServerAgeConfirmation({
        serverId,
        userId,
        source
      });

      const response: ServerAgeConfirmResponse = {
        ok: true,
        serverId,
        confirmed: false,
        confirmedAt: null
      };

      return response;
    }
  );

  fastify.post<{ Params: { serverId: string }; Body: { ttlHours?: number; maxUses?: number } }>(
    "/v1/servers/:serverId/invites",
    {
      preHandler: [
        requireAuth,
        requireServiceAccess,
        requireNotServiceBanned,
        loadCurrentUser,
        requireServerMembership,
        requireNotServerBanned,
        limitInviteCreate
      ]
    },
    async (request, reply) => {
      const parsed = createInviteSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const serverId = String(request.params.serverId || "").trim();
      const actorUserId = String(request.currentUser?.id || "").trim();

      try {
        const invite = await createServerInvite({
          serverId,
          actorUserId,
          ttlHours: parsed.data.ttlHours,
          maxUses: parsed.data.maxUses
        });

        const inviteUrl = `/invite/${invite.token}`;
        const response: InviteCreateResponse = {
          inviteUrl,
          token: invite.token,
          expiresAt: invite.expiresAt
        };

        return reply.code(201).send(response);
      } catch (error) {
        const message = String((error as Error)?.message || "");
        if (message === "forbidden_role") {
          return reply.code(403).send({
            error: "forbidden_role",
            message: "Insufficient server role"
          });
        }

        if (message === "active_invite_limit_reached") {
          return reply.code(409).send({
            error: "ActiveInviteLimitReached",
            message: "Active invite links limit reached for this server"
          });
        }

        throw error;
      }
    }
  );

  fastify.post<{ Params: { serverId: string }; Body: { userId: string; reason?: string; expiresAt?: string } }>(
    "/v1/servers/:serverId/bans",
    {
      preHandler: [
        requireAuth,
        requireServiceAccess,
        requireNotServiceBanned,
        loadCurrentUser,
        requireServerMembership,
        requireNotServerBanned
      ]
    },
    async (request, reply) => {
      const parsed = createServerBanSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const serverId = String(request.params.serverId || "").trim();
      const actorUserId = String(request.currentUser?.id || "").trim();

      try {
        const ban = await applyServerBan({
          serverId,
          actorUserId,
          targetUserId: parsed.data.userId,
          reason: parsed.data.reason,
          expiresAt: parsed.data.expiresAt
        });

        const response: ServerBanResponse = {
          ban: {
            id: ban.id,
            serverId: ban.server_id,
            userId: ban.user_id,
            reason: ban.reason,
            expiresAt: ban.expires_at,
            createdAt: ban.created_at
          }
        };

        return reply.code(201).send(response);
      } catch (error) {
        const message = String((error as Error)?.message || "");
        if (message === "forbidden_role") {
          return reply.code(403).send({
            error: "forbidden_role",
            message: "Insufficient server role"
          });
        }

        if (message === "invalid_action") {
          return reply.code(400).send({
            error: "InvalidAction",
            message: "Invalid action"
          });
        }

        if (message === "protected_user") {
          return reply.code(403).send({
            error: "ProtectedUser",
            message: "Target user cannot be banned"
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

  fastify.delete<{ Params: { serverId: string; userId: string } }>(
    "/v1/servers/:serverId/bans/:userId",
    {
      preHandler: [
        requireAuth,
        requireServiceAccess,
        requireNotServiceBanned,
        loadCurrentUser,
        requireServerMembership,
        requireNotServerBanned
      ]
    },
    async (request, reply) => {
      const serverId = String(request.params.serverId || "").trim();
      const actorUserId = String(request.currentUser?.id || "").trim();
      const targetUserId = String(request.params.userId || "").trim();

      if (!targetUserId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "userId is required"
        });
      }

      try {
        const revoked = await revokeServerBan({
          serverId,
          actorUserId,
          targetUserId
        });

        const response: ServerBanRevokeResponse = { revoked };
        return reply.code(200).send(response);
      } catch (error) {
        const message = String((error as Error)?.message || "");
        if (message === "forbidden_role") {
          return reply.code(403).send({
            error: "forbidden_role",
            message: "Insufficient server role"
          });
        }

        throw error;
      }
    }
  );

  fastify.get<{ Params: { serverId: string } }>(
    "/v1/servers/:serverId/roles",
    {
      preHandler: [
        requireAuth,
        requireServiceAccess,
        requireNotServiceBanned,
        loadCurrentUser,
        requireServerMembership,
        requireNotServerBanned
      ]
    },
    async (request) => {
      const serverId = String(request.params.serverId || "").trim();
      const customRoles = await db.query<{ id: string; name: string }>(
        `SELECT id, name
         FROM server_custom_roles
         WHERE server_id = $1
         ORDER BY name ASC`,
        [serverId]
      );

      const response: ServerRolesResponse = {
        serverId,
        roles: [
          ...baseServerRoles.map((name) => ({ id: `base:${name}`, name, isBase: true })),
          ...customRoles.rows.map((role) => ({ ...role, isBase: false }))
        ]
      };

      return response;
    }
  );

  fastify.post<{ Params: { serverId: string }; Body: { name: string } }>(
    "/v1/servers/:serverId/roles",
    {
      preHandler: [
        requireAuth,
        requireServiceAccess,
        requireNotServiceBanned,
        loadCurrentUser,
        requireServerMembership,
        requireNotServerBanned
      ]
    },
    async (request, reply) => {
      if (!requireServerMetaManage(request, reply)) {
        return;
      }

      const parsed = serverRoleUpsertSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const serverId = String(request.params.serverId || "").trim();
      const actorId = String(request.currentUser?.id || "").trim() || null;

      const inserted = await db.query<{ id: string; name: string }>(
        `INSERT INTO server_custom_roles (server_id, name, created_by_user_id)
         VALUES ($1, $2, $3)
         RETURNING id, name`,
        [serverId, parsed.data.name, actorId]
      );

      return reply.code(201).send({ role: inserted.rows[0] });
    }
  );

  fastify.patch<{ Params: { serverId: string; roleId: string }; Body: { name: string } }>(
    "/v1/servers/:serverId/roles/:roleId",
    {
      preHandler: [
        requireAuth,
        requireServiceAccess,
        requireNotServiceBanned,
        loadCurrentUser,
        requireServerMembership,
        requireNotServerBanned
      ]
    },
    async (request, reply) => {
      if (!requireServerMetaManage(request, reply)) {
        return;
      }

      const parsed = serverRoleUpsertSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const serverId = String(request.params.serverId || "").trim();
      const roleId = String(request.params.roleId || "").trim();
      const updated = await db.query<{ id: string; name: string }>(
        `UPDATE server_custom_roles
         SET name = $3,
             updated_at = NOW()
         WHERE id = $1
           AND server_id = $2
         RETURNING id, name`,
        [roleId, serverId, parsed.data.name]
      );

      if ((updated.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "RoleNotFound",
          message: "Server role not found"
        });
      }

      return { role: updated.rows[0] };
    }
  );

  fastify.delete<{ Params: { serverId: string; roleId: string } }>(
    "/v1/servers/:serverId/roles/:roleId",
    {
      preHandler: [
        requireAuth,
        requireServiceAccess,
        requireNotServiceBanned,
        loadCurrentUser,
        requireServerMembership,
        requireNotServerBanned
      ]
    },
    async (request, reply) => {
      if (!requireServerMetaManage(request, reply)) {
        return;
      }

      const serverId = String(request.params.serverId || "").trim();
      const roleId = String(request.params.roleId || "").trim();
      const deleted = await db.query<{ id: string }>(
        `DELETE FROM server_custom_roles
         WHERE id = $1
           AND server_id = $2
         RETURNING id`,
        [roleId, serverId]
      );

      if ((deleted.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "RoleNotFound",
          message: "Server role not found"
        });
      }

      return { deleted: true, roleId };
    }
  );
}
