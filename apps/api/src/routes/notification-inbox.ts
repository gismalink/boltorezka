import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadCurrentUser, requireAuth, requireServiceAccess } from "../middleware/auth.js";
import { db } from "../db.js";
import {
  listNotificationInbox,
  listTopicUnreadMentions,
  markNotificationInboxItemRead,
  markNotificationInboxReadAll,
  markTopicUnreadMentionsReadAll
} from "../services/notification-inbox-service.js";
import type {
  NotificationInboxClaimResponse,
  NotificationInboxListResponse,
  NotificationInboxReadAllResponse,
  NotificationInboxReadResponse,
  TopicUnreadMentionsListResponse,
  TopicUnreadMentionsReadAllResponse
} from "../api-contract.types.ts";

const listInboxQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  unreadOnly: z.coerce.boolean().optional(),
  beforeCreatedAt: z.string().datetime().optional(),
  beforeId: z.string().uuid().optional()
});

const inboxEventParamsSchema = z.object({
  eventId: z.string().uuid()
});

const topicParamsSchema = z.object({
  topicId: z.string().uuid()
});

const listTopicUnreadMentionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  beforeCreatedAt: z.string().datetime().optional(),
  beforeId: z.string().uuid().optional()
});

const NOTIFICATION_CLAIM_TTL_SEC = 45;

export async function notificationInboxRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: unknown }>(
    "/v1/notifications/inbox",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsed = listInboxQuerySchema.safeParse(request.query || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      if (parsed.data.beforeCreatedAt && !parsed.data.beforeId) {
        return reply.code(400).send({ error: "ValidationError", message: "beforeId is required when beforeCreatedAt is provided" });
      }

      if (parsed.data.beforeId && !parsed.data.beforeCreatedAt) {
        return reply.code(400).send({ error: "ValidationError", message: "beforeCreatedAt is required when beforeId is provided" });
      }

      const userId = String(request.currentUser?.id || "").trim();
      const result = await listNotificationInbox({
        userId,
        limit: parsed.data.limit ?? 30,
        unreadOnly: parsed.data.unreadOnly,
        beforeCreatedAt: parsed.data.beforeCreatedAt || null,
        beforeId: parsed.data.beforeId || null
      });

      const response: NotificationInboxListResponse = {
        items: result.items,
        pagination: {
          hasMore: result.hasMore,
          nextCursor: result.nextCursor
        }
      };

      return reply.code(200).send(response);
    }
  );

  fastify.post<{ Params: unknown }>(
    "/v1/notifications/inbox/:eventId/read",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsed = inboxEventParamsSchema.safeParse(request.params || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const userId = String(request.currentUser?.id || "").trim();
      const updated = await markNotificationInboxItemRead(userId, parsed.data.eventId);
      const response: NotificationInboxReadResponse = {
        eventId: parsed.data.eventId,
        read: updated
      };

      return reply.code(updated ? 200 : 404).send(response);
    }
  );

  fastify.post<{ Params: unknown }>(
    "/v1/notifications/inbox/:eventId/claim",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsed = inboxEventParamsSchema.safeParse(request.params || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const userId = String(request.currentUser?.id || "").trim();
      const ownership = await db.query<{ id: string }>(
        `SELECT id
         FROM notification_inbox
         WHERE id = $1
           AND user_id = $2
         LIMIT 1`,
        [parsed.data.eventId, userId]
      );

      if ((ownership.rowCount || 0) < 1) {
        const notFound: NotificationInboxClaimResponse = {
          eventId: parsed.data.eventId,
          claimed: false,
          ttlSec: NOTIFICATION_CLAIM_TTL_SEC
        };
        return reply.code(404).send(notFound);
      }

      const claimKey = `notifications:claim:${parsed.data.eventId}`;
      const claimed = Boolean(
        await fastify.redis.set(claimKey, userId, {
          NX: true,
          EX: NOTIFICATION_CLAIM_TTL_SEC
        })
      );

      const response: NotificationInboxClaimResponse = {
        eventId: parsed.data.eventId,
        claimed,
        ttlSec: NOTIFICATION_CLAIM_TTL_SEC
      };

      return reply.code(200).send(response);
    }
  );

  fastify.post(
    "/v1/notifications/inbox/read-all",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const userId = String(request.currentUser?.id || "").trim();
      const updated = await markNotificationInboxReadAll(userId);
      const response: NotificationInboxReadAllResponse = {
        updated
      };

      return reply.code(200).send(response);
    }
  );

  fastify.get<{ Params: unknown; Querystring: unknown }>(
    "/v1/topics/:topicId/unread-mentions",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsedParams = topicParamsSchema.safeParse(request.params || {});
      if (!parsedParams.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsedParams.error.flatten()
        });
      }

      const parsedQuery = listTopicUnreadMentionsQuerySchema.safeParse(request.query || {});
      if (!parsedQuery.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsedQuery.error.flatten()
        });
      }

      if (parsedQuery.data.beforeCreatedAt && !parsedQuery.data.beforeId) {
        return reply.code(400).send({ error: "ValidationError", message: "beforeId is required when beforeCreatedAt is provided" });
      }

      if (parsedQuery.data.beforeId && !parsedQuery.data.beforeCreatedAt) {
        return reply.code(400).send({ error: "ValidationError", message: "beforeCreatedAt is required when beforeId is provided" });
      }

      const userId = String(request.currentUser?.id || "").trim();
      const result = await listTopicUnreadMentions({
        userId,
        topicId: parsedParams.data.topicId,
        limit: parsedQuery.data.limit ?? 30,
        beforeCreatedAt: parsedQuery.data.beforeCreatedAt || null,
        beforeId: parsedQuery.data.beforeId || null
      });

      const response: TopicUnreadMentionsListResponse = {
        topicId: parsedParams.data.topicId,
        items: result.items,
        pagination: {
          hasMore: result.hasMore,
          nextCursor: result.nextCursor
        }
      };

      return reply.code(200).send(response);
    }
  );

  fastify.post<{ Params: unknown }>(
    "/v1/topics/:topicId/unread-mentions/read-all",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsedParams = topicParamsSchema.safeParse(request.params || {});
      if (!parsedParams.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsedParams.error.flatten()
        });
      }

      const userId = String(request.currentUser?.id || "").trim();
      const updated = await markTopicUnreadMentionsReadAll({
        userId,
        topicId: parsedParams.data.topicId
      });

      const response: TopicUnreadMentionsReadAllResponse = {
        topicId: parsedParams.data.topicId,
        updated
      };

      return reply.code(200).send(response);
    }
  );
}
