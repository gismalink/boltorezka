import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadCurrentUser, requireAuth, requireServiceAccess } from "../middleware/auth.js";
import { broadcastRealtimeEnvelopeToUser } from "../realtime-broadcast.js";
import { upsertNotificationSettings } from "../services/notification-settings-service.js";
import type { NotificationSettingsResponse } from "../api-contract.types.ts";

const patchNotificationSettingsSchema = z.object({
  scopeType: z.enum(["server", "room", "topic"]),
  serverId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  mode: z.enum(["all", "mentions", "none"]),
  muteUntil: z.string().datetime().nullable().optional(),
  allowCriticalMentions: z.boolean().optional()
});

export async function notificationSettingsRoutes(fastify: FastifyInstance) {
  fastify.patch<{ Body: unknown }>(
    "/v1/notification-settings",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsed = patchNotificationSettingsSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const userId = String(request.currentUser?.id || "").trim();

      try {
        const settings = await upsertNotificationSettings({
          userId,
          scopeType: parsed.data.scopeType,
          serverId: parsed.data.serverId,
          roomId: parsed.data.roomId,
          topicId: parsed.data.topicId,
          mode: parsed.data.mode,
          muteUntil: parsed.data.muteUntil ?? null,
          allowCriticalMentions: parsed.data.allowCriticalMentions ?? true
        });

        broadcastRealtimeEnvelopeToUser(userId, {
          type: "chat.notification.settings.updated",
          payload: {
            settings,
            ts: new Date().toISOString()
          }
        });

        const response: NotificationSettingsResponse = { settings };
        return reply.code(200).send(response);
      } catch (error) {
        const message = String((error as Error)?.message || "");

        if (message === "validation_error") {
          return reply.code(400).send({
            error: "ValidationError",
            message: "Invalid scope payload"
          });
        }

        if (message === "scope_not_found") {
          return reply.code(404).send({
            error: "ScopeNotFound",
            message: "Scope does not exist"
          });
        }

        if (message === "forbidden_scope") {
          return reply.code(403).send({
            error: "Forbidden",
            message: "You do not have access to this scope"
          });
        }

        throw error;
      }
    }
  );
}
