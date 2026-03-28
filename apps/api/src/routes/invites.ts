import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadCurrentUser, requireAuth, requireNotServiceBanned, requireServiceAccess } from "../middleware/auth.js";
import { makeRateLimiter } from "../middleware/rate-limit.js";
import { acceptServerInvite } from "../services/invite-service.js";
import type { InviteAcceptResponse } from "../api-contract.types.ts";

const acceptInviteSchema = z.object({
  token: z.string().trim().min(16).max(512)
});

export async function invitesRoutes(fastify: FastifyInstance) {
  const limitInviteAccept = makeRateLimiter({
    namespace: "server.invite.accept",
    max: 30,
    windowSec: 60,
    message: "Too many invite accept attempts"
  });

  fastify.post<{ Params: { token: string } }>(
    "/v1/invites/:token/accept",
    {
      preHandler: [requireAuth, requireServiceAccess, requireNotServiceBanned, loadCurrentUser, limitInviteAccept]
    },
    async (request, reply) => {
      const parsed = acceptInviteSchema.safeParse({ token: request.params.token });
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const userId = String(request.currentUser?.id || "").trim();

      try {
        const server = await acceptServerInvite({
          token: parsed.data.token,
          userId
        });

        const response: InviteAcceptResponse = { server };
        return reply.code(200).send(response);
      } catch (error) {
        const message = String((error as Error)?.message || "");
        if (message === "invite_not_found") {
          return reply.code(404).send({
            error: "InviteNotFound",
            message: "Invite not found"
          });
        }

        if (message === "invite_revoked" || message === "invite_expired" || message === "invite_limit_reached") {
          return reply.code(410).send({
            error: "InviteUnavailable",
            message: "Invite is no longer valid"
          });
        }

        if (message === "server_banned") {
          return reply.code(403).send({
            error: "server_banned",
            message: "User is banned on this server"
          });
        }

        throw error;
      }
    }
  );
}
