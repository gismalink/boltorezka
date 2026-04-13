import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadCurrentUser, requireAuth, requireServiceAccess } from "../middleware/auth.js";
import { searchMessages, type MessageSearchScope } from "../services/message-search-service.js";
import type { SearchMessagesResponse } from "../api-contract.types.ts";
import { normalizeBoundedString } from "../validators.js";

const searchMessagesQuerySchema = z.object({
  q: z.string().trim().min(1).max(400),
  scope: z.enum(["all", "server", "room", "topic"]).default("all"),
  serverId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  authorId: z.string().uuid().optional(),
  hasAttachment: z.coerce.boolean().optional(),
  attachmentType: z.enum(["image"]).optional(),
  hasLink: z.coerce.boolean().optional(),
  hasMention: z.coerce.boolean().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  beforeCreatedAt: z.string().datetime().optional(),
  beforeId: z.string().uuid().optional()
});

export async function searchRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: unknown }>(
    "/v1/search/messages",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsedQuery = searchMessagesQuerySchema.safeParse(request.query || {});
      if (!parsedQuery.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsedQuery.error.flatten()
        });
      }

      const userId = normalizeBoundedString(request.currentUser?.id, 128) || "";
      const scope = parsedQuery.data.scope as MessageSearchScope;

      if (parsedQuery.data.beforeCreatedAt && !parsedQuery.data.beforeId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "beforeId is required when beforeCreatedAt is provided"
        });
      }

      if (parsedQuery.data.beforeId && !parsedQuery.data.beforeCreatedAt) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "beforeCreatedAt is required when beforeId is provided"
        });
      }

      if (parsedQuery.data.attachmentType && parsedQuery.data.hasAttachment === false) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "attachmentType cannot be combined with hasAttachment=false"
        });
      }

      try {
        const result = await searchMessages({
          userId,
          q: parsedQuery.data.q,
          scope,
          serverId: parsedQuery.data.serverId,
          roomId: parsedQuery.data.roomId,
          topicId: parsedQuery.data.topicId,
          authorId: parsedQuery.data.authorId,
          hasAttachment: parsedQuery.data.hasAttachment,
          attachmentType: parsedQuery.data.attachmentType,
          hasLink: parsedQuery.data.hasLink,
          hasMention: parsedQuery.data.hasMention,
          from: parsedQuery.data.from,
          to: parsedQuery.data.to,
          limit: parsedQuery.data.limit ?? 50,
          beforeCreatedAt: parsedQuery.data.beforeCreatedAt || null,
          beforeId: parsedQuery.data.beforeId || null
        });

        const response: SearchMessagesResponse = {
          messages: result.messages,
          pagination: result.pagination
        };

        return reply.code(200).send(response);
      } catch (error) {
        const message = String((error as Error)?.message || "");
        if (message === "validation_error") {
          return reply.code(400).send({
            error: "ValidationError",
            message: "Invalid search filters for selected scope"
          });
        }

        throw error;
      }
    }
  );
}
