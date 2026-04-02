import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadCurrentUser, requireAuth, requireServiceAccess } from "../middleware/auth.js";
import {
  createRoomTopic,
  listRoomTopics,
  setRoomTopicArchived,
  updateRoomTopic
} from "../services/room-topics-service.js";
import type { RoomTopicResponse, RoomTopicsListResponse } from "../api-contract.types.ts";

const roomParamsSchema = z.object({
  roomId: z.string().uuid()
});

const topicParamsSchema = z.object({
  topicId: z.string().uuid()
});

const createTopicSchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug: z.string().trim().min(1).max(64).optional(),
  position: z.number().int().min(0).optional()
});

const updateTopicSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  slug: z.string().trim().min(1).max(64).optional(),
  isPinned: z.boolean().optional(),
  position: z.number().int().min(0).optional()
}).refine((value) => {
  return value.title !== undefined
    || value.slug !== undefined
    || value.isPinned !== undefined
    || value.position !== undefined;
}, {
  message: "At least one field is required"
});

function sendDomainError(reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }, error: unknown) {
  const message = String((error as Error)?.message || "");

  if (message === "room_not_found" || message === "topic_not_found") {
    return reply.code(404).send({
      error: "NotFound",
      message: "Resource was not found"
    });
  }

  if (message === "forbidden_room_access" || message === "forbidden_topic_manage") {
    return reply.code(403).send({
      error: "Forbidden",
      message: "You do not have access to this resource"
    });
  }

  return null;
}

export async function roomTopicsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { roomId: string } }>(
    "/v1/rooms/:roomId/topics",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsedParams = roomParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsedParams.error.flatten()
        });
      }

      const userId = String(request.currentUser?.id || "").trim();

      try {
        const topics = await listRoomTopics(parsedParams.data.roomId, userId);
        const response: RoomTopicsListResponse = { topics };
        return reply.code(200).send(response);
      } catch (error) {
        const handled = sendDomainError(reply, error);
        if (handled) {
          return handled;
        }

        throw error;
      }
    }
  );

  fastify.post<{ Params: { roomId: string }; Body: unknown }>(
    "/v1/rooms/:roomId/topics",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsedParams = roomParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsedParams.error.flatten()
        });
      }

      const parsedBody = createTopicSchema.safeParse(request.body || {});
      if (!parsedBody.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsedBody.error.flatten()
        });
      }

      const userId = String(request.currentUser?.id || "").trim();

      try {
        const topic = await createRoomTopic({
          roomId: parsedParams.data.roomId,
          actorUserId: userId,
          title: parsedBody.data.title,
          slug: parsedBody.data.slug,
          position: parsedBody.data.position
        });

        const response: RoomTopicResponse = { topic };
        return reply.code(201).send(response);
      } catch (error) {
        const handled = sendDomainError(reply, error);
        if (handled) {
          return handled;
        }

        throw error;
      }
    }
  );

  fastify.patch<{ Params: { topicId: string }; Body: unknown }>(
    "/v1/topics/:topicId",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsedParams = topicParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsedParams.error.flatten()
        });
      }

      const parsedBody = updateTopicSchema.safeParse(request.body || {});
      if (!parsedBody.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsedBody.error.flatten()
        });
      }

      const userId = String(request.currentUser?.id || "").trim();

      try {
        const topic = await updateRoomTopic({
          topicId: parsedParams.data.topicId,
          actorUserId: userId,
          title: parsedBody.data.title,
          slug: parsedBody.data.slug,
          isPinned: parsedBody.data.isPinned,
          position: parsedBody.data.position
        });

        const response: RoomTopicResponse = { topic };
        return reply.code(200).send(response);
      } catch (error) {
        const handled = sendDomainError(reply, error);
        if (handled) {
          return handled;
        }

        throw error;
      }
    }
  );

  fastify.post<{ Params: { topicId: string } }>(
    "/v1/topics/:topicId/archive",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsedParams = topicParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsedParams.error.flatten()
        });
      }

      const userId = String(request.currentUser?.id || "").trim();

      try {
        const topic = await setRoomTopicArchived({
          topicId: parsedParams.data.topicId,
          actorUserId: userId,
          archived: true
        });

        const response: RoomTopicResponse = { topic };
        return reply.code(200).send(response);
      } catch (error) {
        const handled = sendDomainError(reply, error);
        if (handled) {
          return handled;
        }

        throw error;
      }
    }
  );

  fastify.post<{ Params: { topicId: string } }>(
    "/v1/topics/:topicId/unarchive",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsedParams = topicParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsedParams.error.flatten()
        });
      }

      const userId = String(request.currentUser?.id || "").trim();

      try {
        const topic = await setRoomTopicArchived({
          topicId: parsedParams.data.topicId,
          actorUserId: userId,
          archived: false
        });

        const response: RoomTopicResponse = { topic };
        return reply.code(200).send(response);
      } catch (error) {
        const handled = sendDomainError(reply, error);
        if (handled) {
          return handled;
        }

        throw error;
      }
    }
  );
}
