import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadCurrentUser, requireAuth, requireServiceAccess } from "../middleware/auth.js";
import {
  getWebPushPublicConfig,
  registerNotificationPushSubscription,
  removeNotificationPushSubscription
} from "../services/notification-push-service.js";

const putSubscriptionSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1)
  }),
  expirationTime: z.string().datetime().nullable().optional(),
  runtime: z.enum(["web", "desktop"]).optional()
});

const deleteSubscriptionSchema = z.object({
  endpoint: z.string().min(1)
});

export async function notificationPushRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/v1/notifications/push/public-key",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (_request, reply) => {
      return reply.code(200).send(getWebPushPublicConfig());
    }
  );

  fastify.put<{ Body: unknown }>(
    "/v1/notifications/push/subscriptions",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsed = putSubscriptionSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const userId = String(request.currentUser?.id || "").trim();
      await registerNotificationPushSubscription({
        userId,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        expirationTime: parsed.data.expirationTime || null,
        runtime: parsed.data.runtime,
        userAgent: request.headers["user-agent"] || null
      });

      return reply.code(200).send({ ok: true });
    }
  );

  fastify.delete<{ Body: unknown }>(
    "/v1/notifications/push/subscriptions",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsed = deleteSubscriptionSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const userId = String(request.currentUser?.id || "").trim();
      const deleted = await removeNotificationPushSubscription(userId, parsed.data.endpoint);
      return reply.code(deleted ? 200 : 404).send({ ok: deleted });
    }
  );
}
