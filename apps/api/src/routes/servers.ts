import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadCurrentUser, requireAuth, requireNotServiceBanned, requireServiceAccess } from "../middleware/auth.js";
import {
  createServerForUser,
  getDefaultServerContextForUser,
  getServerForUser,
  listUserServers,
  renameServerForUser
} from "../services/server-service.js";
import type {
  ServerCreateResponse,
  ServerGetResponse,
  ServerRenameResponse,
  ServersListResponse
} from "../api-contract.types.ts";

const createServerSchema = z.object({
  name: z.string().trim().min(3).max(64)
});

const renameServerSchema = z.object({
  name: z.string().trim().min(3).max(64)
});

export async function serversRoutes(fastify: FastifyInstance) {
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

      try {
        const server = await createServerForUser({
          name: parsed.data.name,
          ownerUserId: userId
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
}
