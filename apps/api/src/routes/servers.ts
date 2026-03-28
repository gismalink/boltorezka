import type { FastifyInstance } from "fastify";
import { z } from "zod";
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
import { createServerInvite } from "../services/invite-service.js";
import { applyServerBan, revokeServerBan } from "../services/ban-service.js";
import { makeRateLimiter } from "../middleware/rate-limit.js";
import { confirmServerAge, getServerAgeConfirmation } from "../services/age-verification-service.js";
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
  ServerOwnerTransferResponse,
  ServerMembersResponse,
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

export async function serversRoutes(fastify: FastifyInstance) {
  const limitInviteCreate = makeRateLimiter({
    namespace: "server.invite.create",
    max: 20,
    windowSec: 60,
    message: "Too many invite create attempts"
  });

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

  fastify.post<{ Params: { serverId: string }; Body: { source?: string } }>(
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

      const confirmation = await confirmServerAge({
        serverId,
        userId,
        source
      });

      const response: ServerAgeConfirmResponse = {
        ok: true,
        serverId,
        confirmedAt: confirmation.confirmedAt
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
}
