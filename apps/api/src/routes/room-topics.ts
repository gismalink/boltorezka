import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { loadCurrentUser, requireAuth, requireServiceAccess } from "../middleware/auth.js";
import { broadcastRealtimeEnvelope } from "../realtime-broadcast.js";
import { buildChatDeletedEnvelope, buildChatEditedEnvelope, buildChatMessageEnvelope } from "../ws-protocol.js";
import {
  createRoomTopic,
  deleteRoomTopicWithMessages,
  listRoomTopics,
  setRoomTopicArchived,
  updateRoomTopic
} from "../services/room-topics-service.js";
import {
  createTopicMessage,
  createTopicMessageReport,
  deleteTopicMessage,
  editTopicMessage,
  listTopicMessages,
  markTopicRead,
  replyTopicMessage,
  setTopicMessagePinned,
  setTopicMessageReaction
} from "../services/room-topic-messages-service.js";
import {
  emitMentionInboxEvents,
  emitPinnedInboxEvent,
  emitReplyInboxEvent
} from "../services/notification-inbox-service.js";
import { normalizeBoundedString } from "../validators.js";
import type {
  RoomTopicDeleteResponse,
  RoomTopicResponse,
  RoomTopicsListResponse,
  TopicMessageCreateResponse,
  TopicMessageDeleteResponse,
  TopicMessagePinResponse,
  TopicMessageReportResponse,
  TopicMessageReactionResponse,
  TopicMessageReplyResponse,
  TopicMessageUpdateResponse,
  TopicMessagesResponse,
  TopicReadResponse
} from "../api-contract.types.ts";

const roomParamsSchema = z.object({
  roomId: z.string().uuid()
});

const topicParamsSchema = z.object({
  topicId: z.string().uuid()
});

const messageParamsSchema = z.object({
  messageId: z.string().uuid()
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

const topicMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  beforeCreatedAt: z.string().trim().optional(),
  beforeId: z.string().trim().optional(),
  anchorMessageId: z.string().uuid().optional(),
  aroundWindowBefore: z.coerce.number().int().min(0).max(500).optional(),
  aroundWindowAfter: z.coerce.number().int().min(0).max(500).optional(),
  aroundUnreadWindow: z.coerce.boolean().optional()
});

const mentionUserIdsSchema = z.array(z.string().uuid()).max(100).optional();

const createTopicMessageSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  mentionUserIds: mentionUserIdsSchema
});

const reactionParamsSchema = z.object({
  messageId: z.string().uuid(),
  emoji: z.string().trim().min(1).max(32)
});

const editMessageSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  mentionUserIds: mentionUserIdsSchema
});

const reactionBodySchema = z.object({
  emoji: z.string().trim().min(1).max(32)
});

const reportMessageSchema = z.object({
  reason: z.string().trim().min(1).max(160),
  details: z.string().trim().max(2000).optional()
});

const markTopicReadSchema = z.object({
  lastReadMessageId: z.string().uuid().optional()
});

const normId = (value: unknown) => normalizeBoundedString(value, 128) || "";

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

  if (message === "topic_archived") {
    return reply.code(409).send({
      error: "TopicArchived",
      message: "Topic is archived"
    });
  }

  if (message === "room_readonly") {
    return reply.code(403).send({
      error: "RoomReadOnly",
      message: "Room is read-only"
    });
  }

  if (message === "server_member_muted") {
    return reply.code(403).send({
      error: "ServerMemberMuted",
      message: "You are muted in this server"
    });
  }

  if (message.startsWith("room_slowmode_active:")) {
    const retryAfterSec = Math.max(1, Number.parseInt(message.split(":")[1] || "1", 10) || 1);
    return reply.code(429).send({
      error: "SlowmodeActive",
      message: "Slowmode is active",
      retryAfterSec
    });
  }

  if (message === "user_not_found") {
    return reply.code(404).send({
      error: "UserNotFound",
      message: "User does not exist"
    });
  }

  if (message === "message_not_found") {
    return reply.code(404).send({
      error: "MessageNotFound",
      message: "Message does not exist"
    });
  }

  if (message === "forbidden_message_owner") {
    return reply.code(403).send({
      error: "Forbidden",
      message: "You can modify only your own messages"
    });
  }

  if (message === "message_edit_window_expired") {
    return reply.code(409).send({
      error: "EditWindowExpired",
      message: "Message edit/delete window has expired"
    });
  }

  if (message === "validation_error") {
    return reply.code(400).send({
      error: "ValidationError",
      message: "Validation failed"
    });
  }

  if (message === "cannot_report_own_message") {
    return reply.code(403).send({
      error: "Forbidden",
      message: "You cannot report your own message"
    });
  }

  if (message === "message_report_exists") {
    return reply.code(409).send({
      error: "MessageAlreadyReported",
      message: "Message is already reported by this user"
    });
  }

  return null;
}

async function resolveRoomSlug(roomId: string): Promise<string | null> {
  const result = await db.query<{ slug: string }>(
    `SELECT slug FROM rooms WHERE id = $1 LIMIT 1`,
    [roomId]
  );

  return normId(result.rows[0]?.slug) || null;
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

      const userId = normId(request.currentUser?.id);

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

      const userId = normId(request.currentUser?.id);

      try {
        const topic = await createRoomTopic({
          roomId: parsedParams.data.roomId,
          actorUserId: userId,
          title: parsedBody.data.title,
          slug: parsedBody.data.slug,
          position: parsedBody.data.position
        });

        const roomSlug = await resolveRoomSlug(topic.roomId);
        broadcastRealtimeEnvelope({
          type: "chat.topic.created",
          payload: {
            roomId: topic.roomId,
            roomSlug,
            topic,
            actorUserId: userId,
            ts: new Date().toISOString()
          }
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

      const userId = normId(request.currentUser?.id);

      try {
        const topic = await updateRoomTopic({
          topicId: parsedParams.data.topicId,
          actorUserId: userId,
          title: parsedBody.data.title,
          slug: parsedBody.data.slug,
          isPinned: parsedBody.data.isPinned,
          position: parsedBody.data.position
        });

        const roomSlug = await resolveRoomSlug(topic.roomId);
        broadcastRealtimeEnvelope({
          type: "chat.topic.updated",
          payload: {
            roomId: topic.roomId,
            roomSlug,
            topic,
            actorUserId: userId,
            ts: new Date().toISOString()
          }
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

      const userId = normId(request.currentUser?.id);

      try {
        const topic = await setRoomTopicArchived({
          topicId: parsedParams.data.topicId,
          actorUserId: userId,
          archived: true
        });

        const roomSlug = await resolveRoomSlug(topic.roomId);
        broadcastRealtimeEnvelope({
          type: "chat.topic.archived",
          payload: {
            roomId: topic.roomId,
            roomSlug,
            topic,
            actorUserId: userId,
            ts: new Date().toISOString()
          }
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

      const userId = normId(request.currentUser?.id);

      try {
        const topic = await setRoomTopicArchived({
          topicId: parsedParams.data.topicId,
          actorUserId: userId,
          archived: false
        });

        const roomSlug = await resolveRoomSlug(topic.roomId);
        broadcastRealtimeEnvelope({
          type: "chat.topic.unarchived",
          payload: {
            roomId: topic.roomId,
            roomSlug,
            topic,
            actorUserId: userId,
            ts: new Date().toISOString()
          }
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

  fastify.delete<{ Params: { topicId: string } }>(
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

      const userId = normId(request.currentUser?.id);

      try {
        const deleted = await deleteRoomTopicWithMessages({
          topicId: parsedParams.data.topicId,
          actorUserId: userId
        });

        const roomSlug = String((await resolveRoomSlug(deleted.topic.roomId)) || "");
        const deletedAt = new Date().toISOString();

        broadcastRealtimeEnvelope({
          type: "chat.topic.deleted",
          payload: {
            roomId: deleted.topic.roomId,
            roomSlug,
            topicId: deleted.topic.id,
            actorUserId: userId,
            deletedMessagesCount: deleted.deletedMessagesCount,
            ts: deletedAt
          }
        });

        const response: RoomTopicDeleteResponse = {
          topicId: deleted.topic.id,
          roomId: deleted.topic.roomId,
          roomSlug,
          deletedMessagesCount: deleted.deletedMessagesCount,
          deletedAt
        };
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

  fastify.get<{ Params: { topicId: string }; Querystring: unknown }>(
    "/v1/topics/:topicId/messages",
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

      const parsedQuery = topicMessagesQuerySchema.safeParse(request.query || {});
      if (!parsedQuery.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsedQuery.error.flatten()
        });
      }

      const beforeCreatedAtRaw = normId(parsedQuery.data.beforeCreatedAt);
      const beforeIdRaw = normId(parsedQuery.data.beforeId);
      let beforeCreatedAt: string | null = null;
      let beforeId: string | null = null;

      if (beforeCreatedAtRaw || beforeIdRaw) {
        if (!beforeCreatedAtRaw || !beforeIdRaw) {
          return reply.code(400).send({
            error: "ValidationError",
            message: "beforeCreatedAt and beforeId must be provided together"
          });
        }

        const beforeDate = new Date(beforeCreatedAtRaw);
        if (Number.isNaN(beforeDate.getTime())) {
          return reply.code(400).send({
            error: "ValidationError",
            message: "beforeCreatedAt must be a valid ISO datetime"
          });
        }

        beforeCreatedAt = beforeDate.toISOString();
        beforeId = beforeIdRaw;
      }

      const userId = normId(request.currentUser?.id);
      const limit = parsedQuery.data.limit ?? 50;
      const anchorMessageId = normId(parsedQuery.data.anchorMessageId) || null;
      const aroundWindowBefore = typeof parsedQuery.data.aroundWindowBefore === "number"
        ? parsedQuery.data.aroundWindowBefore
        : undefined;
      const aroundWindowAfter = typeof parsedQuery.data.aroundWindowAfter === "number"
        ? parsedQuery.data.aroundWindowAfter
        : undefined;
      const aroundUnreadWindow = beforeCreatedAt === null
        && beforeId === null
        && !anchorMessageId
        && Boolean(parsedQuery.data.aroundUnreadWindow);

      try {
        const result = await listTopicMessages({
          topicId: parsedParams.data.topicId,
          userId,
          limit,
          aroundUnreadWindow,
          anchorMessageId,
          aroundWindowBefore,
          aroundWindowAfter,
          beforeCreatedAt,
          beforeId
        });

        const response: TopicMessagesResponse = {
          room: result.room,
          topic: {
            id: result.topic.id,
            roomId: result.topic.room_id,
            slug: result.topic.slug,
            title: result.topic.title,
            archivedAt: result.topic.archived_at,
            createdAt: result.topic.created_at,
            updatedAt: result.topic.updated_at
          },
          unreadDividerMessageId: result.unreadDividerMessageId,
          messages: result.messages,
          pagination: result.pagination
        };

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

  fastify.post<{ Params: { topicId: string }; Body: unknown }>(
    "/v1/topics/:topicId/messages",
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

      const parsedBody = createTopicMessageSchema.safeParse(request.body || {});
      if (!parsedBody.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsedBody.error.flatten()
        });
      }

      const userId = normId(request.currentUser?.id);

      try {
        const result = await createTopicMessage({
          topicId: parsedParams.data.topicId,
          userId,
          text: parsedBody.data.text
        });

        const resolvedMentionUserIds = await emitMentionInboxEvents({
          actorUserId: userId,
          actorUserName: result.message.user_name,
          roomId: result.room.id,
          roomSlug: result.room.slug,
          topicId: result.topic.id,
          topicSlug: result.topic.slug,
          messageId: result.message.id,
          text: result.message.text,
          mentionUserIds: parsedBody.data.mentionUserIds
        });

        broadcastRealtimeEnvelope(buildChatMessageEnvelope({
          id: result.message.id,
          roomId: result.message.room_id,
          roomSlug: result.room.slug,
          topicId: result.topic.id,
          topicSlug: result.topic.slug,
          replyToMessageId: result.message.reply_to_message_id || null,
          replyToUserId: result.message.reply_to_user_id || null,
          replyToUserName: result.message.reply_to_user_name || null,
          replyToText: result.message.reply_to_text || null,
          userId: result.message.user_id,
          userName: result.message.user_name,
          text: result.message.text,
          createdAt: result.message.created_at,
          senderRequestId: null,
          attachments: [],
          mentionUserIds: resolvedMentionUserIds.length > 0
            ? resolvedMentionUserIds
            : parsedBody.data.mentionUserIds
        }));

        const response: TopicMessageCreateResponse = {
          room: result.room,
          topic: {
            id: result.topic.id,
            roomId: result.topic.room_id,
            slug: result.topic.slug,
            title: result.topic.title,
            archivedAt: result.topic.archived_at
          },
          message: result.message
        };

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

  fastify.patch<{ Params: { messageId: string }; Body: unknown }>(
    "/v1/messages/:messageId",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsedParams = messageParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({ error: "ValidationError", issues: parsedParams.error.flatten() });
      }

      const parsedBody = editMessageSchema.safeParse(request.body || {});
      if (!parsedBody.success) {
        return reply.code(400).send({ error: "ValidationError", issues: parsedBody.error.flatten() });
      }

      const userId = normId(request.currentUser?.id);

      try {
        const result = await editTopicMessage({
          messageId: parsedParams.data.messageId,
          userId,
          text: parsedBody.data.text
        });

        broadcastRealtimeEnvelope(buildChatEditedEnvelope({
          id: result.message.id,
          roomId: result.message.room_id,
          roomSlug: result.room.slug,
          topicId: result.topic.id,
          topicSlug: result.topic.slug,
          text: result.message.text,
          editedAt: String(result.message.edited_at || new Date().toISOString()),
          editedByUserId: userId
        }));

        const response: TopicMessageUpdateResponse = {
          room: result.room,
          topic: {
            id: result.topic.id,
            roomId: result.room.id,
            slug: result.topic.slug
          },
          message: result.message
        };

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

  fastify.delete<{ Params: { messageId: string } }>(
    "/v1/messages/:messageId",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsedParams = messageParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({ error: "ValidationError", issues: parsedParams.error.flatten() });
      }

      const userId = normId(request.currentUser?.id);

      try {
        const result = await deleteTopicMessage({
          messageId: parsedParams.data.messageId,
          userId
        });

        broadcastRealtimeEnvelope(buildChatDeletedEnvelope({
          id: result.messageId,
          roomId: result.room.id,
          roomSlug: result.room.slug,
          topicId: result.topic.id,
          topicSlug: result.topic.slug,
          deletedByUserId: userId,
          ts: result.deletedAt
        }));

        const response: TopicMessageDeleteResponse = {
          room: result.room,
          topic: {
            id: result.topic.id,
            roomId: result.room.id,
            slug: result.topic.slug
          },
          messageId: result.messageId,
          deletedAt: result.deletedAt
        };

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

  fastify.post<{ Params: { messageId: string }; Body: unknown }>(
    "/v1/messages/:messageId/reply",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsedParams = messageParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({ error: "ValidationError", issues: parsedParams.error.flatten() });
      }

      const parsedBody = editMessageSchema.safeParse(request.body || {});
      if (!parsedBody.success) {
        return reply.code(400).send({ error: "ValidationError", issues: parsedBody.error.flatten() });
      }

      const userId = normId(request.currentUser?.id);

      try {
        const result = await replyTopicMessage({
          messageId: parsedParams.data.messageId,
          userId,
          text: parsedBody.data.text
        });

        const resolvedMentionUserIds = await emitMentionInboxEvents({
          actorUserId: userId,
          actorUserName: result.message.user_name,
          roomId: result.room.id,
          roomSlug: result.room.slug,
          topicId: result.topic.id,
          topicSlug: result.topic.slug,
          messageId: result.message.id,
          text: result.message.text,
          mentionUserIds: parsedBody.data.mentionUserIds
        });

        broadcastRealtimeEnvelope(buildChatMessageEnvelope({
          id: result.message.id,
          roomId: result.message.room_id,
          roomSlug: result.room.slug,
          topicId: result.topic.id,
          topicSlug: result.topic.slug,
          replyToMessageId: result.message.reply_to_message_id || result.parentMessageId,
          replyToUserId: result.message.reply_to_user_id || null,
          replyToUserName: result.message.reply_to_user_name || null,
          replyToText: result.message.reply_to_text || null,
          userId: result.message.user_id,
          userName: result.message.user_name,
          text: result.message.text,
          createdAt: result.message.created_at,
          senderRequestId: null,
          attachments: [],
          mentionUserIds: resolvedMentionUserIds.length > 0
            ? resolvedMentionUserIds
            : parsedBody.data.mentionUserIds
        }));

        await emitReplyInboxEvent({
          actorUserId: userId,
          actorUserName: result.message.user_name,
          targetUserId: result.message.reply_to_user_id || null,
          roomId: result.room.id,
          roomSlug: result.room.slug,
          topicId: result.topic.id,
          topicSlug: result.topic.slug,
          messageId: result.message.id,
          text: result.message.text
        });

        const response: TopicMessageReplyResponse = {
          room: result.room,
          topic: {
            id: result.topic.id,
            roomId: result.room.id,
            slug: result.topic.slug,
            title: result.topic.title,
            archivedAt: result.topic.archivedAt
          },
          message: result.message,
          parentMessageId: result.parentMessageId
        };

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

  fastify.post<{ Params: { messageId: string } }>(
    "/v1/messages/:messageId/pin",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsedParams = messageParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({ error: "ValidationError", issues: parsedParams.error.flatten() });
      }

      const userId = normId(request.currentUser?.id);

      try {
        const result = await setTopicMessagePinned({
          messageId: parsedParams.data.messageId,
          userId,
          pinned: true
        });

        broadcastRealtimeEnvelope({
          type: "chat.message.pinned",
          payload: {
            roomId: result.room.id,
            roomSlug: result.room.slug,
            topicId: result.topic.id,
            topicSlug: result.topic.slug,
            messageId: result.messageId,
            pinned: true,
            pinnedByUserId: userId,
            ts: new Date().toISOString()
          }
        });

        await emitPinnedInboxEvent({
          actorUserId: userId,
          actorUserName: String(request.currentUser?.name || request.currentUser?.username || "User"),
          targetMessageAuthorUserId: result.messageAuthorUserId,
          roomId: result.room.id,
          roomSlug: result.room.slug,
          topicId: result.topic.id,
          topicSlug: result.topic.slug,
          messageId: result.messageId
        });

        const response: TopicMessagePinResponse = {
          room: result.room,
          topic: {
            id: result.topic.id,
            roomId: result.room.id,
            slug: result.topic.slug
          },
          messageId: result.messageId,
          pinned: result.pinned
        };

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

  fastify.delete<{ Params: { messageId: string } }>(
    "/v1/messages/:messageId/pin",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsedParams = messageParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({ error: "ValidationError", issues: parsedParams.error.flatten() });
      }

      const userId = normId(request.currentUser?.id);

      try {
        const result = await setTopicMessagePinned({
          messageId: parsedParams.data.messageId,
          userId,
          pinned: false
        });

        broadcastRealtimeEnvelope({
          type: "chat.message.unpinned",
          payload: {
            roomId: result.room.id,
            roomSlug: result.room.slug,
            topicId: result.topic.id,
            topicSlug: result.topic.slug,
            messageId: result.messageId,
            pinned: false,
            unpinnedByUserId: userId,
            ts: new Date().toISOString()
          }
        });

        const response: TopicMessagePinResponse = {
          room: result.room,
          topic: {
            id: result.topic.id,
            roomId: result.room.id,
            slug: result.topic.slug
          },
          messageId: result.messageId,
          pinned: result.pinned
        };

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

  fastify.post<{ Params: { messageId: string }; Body: unknown }>(
    "/v1/messages/:messageId/reactions",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsedParams = messageParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({ error: "ValidationError", issues: parsedParams.error.flatten() });
      }

      const parsedBody = reactionBodySchema.safeParse(request.body || {});
      if (!parsedBody.success) {
        return reply.code(400).send({ error: "ValidationError", issues: parsedBody.error.flatten() });
      }

      const userId = normId(request.currentUser?.id);

      try {
        const result = await setTopicMessageReaction({
          messageId: parsedParams.data.messageId,
          userId,
          emoji: parsedBody.data.emoji,
          active: true
        });

        broadcastRealtimeEnvelope({
          type: "chat.message.reaction.changed",
          payload: {
            roomId: result.room.id,
            roomSlug: result.room.slug,
            topicId: result.topic.id,
            topicSlug: result.topic.slug,
            messageId: result.messageId,
            emoji: result.emoji,
            userId: result.userId,
            active: true,
            ts: new Date().toISOString()
          }
        });

        const response: TopicMessageReactionResponse = {
          room: result.room,
          topic: {
            id: result.topic.id,
            roomId: result.room.id,
            slug: result.topic.slug
          },
          messageId: result.messageId,
          emoji: result.emoji,
          userId: result.userId,
          active: result.active
        };

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

  fastify.delete<{ Params: { messageId: string; emoji: string } }>(
    "/v1/messages/:messageId/reactions/:emoji",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsedParams = reactionParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({ error: "ValidationError", issues: parsedParams.error.flatten() });
      }

      const userId = normId(request.currentUser?.id);

      try {
        const result = await setTopicMessageReaction({
          messageId: parsedParams.data.messageId,
          userId,
          emoji: parsedParams.data.emoji,
          active: false
        });

        broadcastRealtimeEnvelope({
          type: "chat.message.reaction.changed",
          payload: {
            roomId: result.room.id,
            roomSlug: result.room.slug,
            topicId: result.topic.id,
            topicSlug: result.topic.slug,
            messageId: result.messageId,
            emoji: result.emoji,
            userId: result.userId,
            active: false,
            ts: new Date().toISOString()
          }
        });

        const response: TopicMessageReactionResponse = {
          room: result.room,
          topic: {
            id: result.topic.id,
            roomId: result.room.id,
            slug: result.topic.slug
          },
          messageId: result.messageId,
          emoji: result.emoji,
          userId: result.userId,
          active: result.active
        };

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

  fastify.post<{ Params: { messageId: string }; Body: unknown }>(
    "/v1/messages/:messageId/report",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsedParams = messageParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({ error: "ValidationError", issues: parsedParams.error.flatten() });
      }

      const parsedBody = reportMessageSchema.safeParse(request.body || {});
      if (!parsedBody.success) {
        return reply.code(400).send({ error: "ValidationError", issues: parsedBody.error.flatten() });
      }

      const userId = normId(request.currentUser?.id);

      try {
        const reported = await createTopicMessageReport({
          messageId: parsedParams.data.messageId,
          userId,
          reason: parsedBody.data.reason,
          details: parsedBody.data.details
        });

        const response: TopicMessageReportResponse = {
          ok: true,
          reportId: reported.reportId,
          messageId: reported.messageId
        };

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

  fastify.post<{ Params: { topicId: string }; Body: unknown }>(
    "/v1/topics/:topicId/read",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsedParams = topicParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({ error: "ValidationError", issues: parsedParams.error.flatten() });
      }

      const parsedBody = markTopicReadSchema.safeParse(request.body || {});
      if (!parsedBody.success) {
        return reply.code(400).send({ error: "ValidationError", issues: parsedBody.error.flatten() });
      }

      const userId = normId(request.currentUser?.id);

      try {
        const read = await markTopicRead({
          topicId: parsedParams.data.topicId,
          userId,
          lastReadMessageId: parsedBody.data.lastReadMessageId || null
        });

        broadcastRealtimeEnvelope({
          type: "chat.topic.read",
          payload: {
            roomId: read.roomId,
            topicId: read.topicId,
            userId,
            lastReadMessageId: read.lastReadMessageId,
            lastReadAt: read.lastReadAt,
            unreadDelta: read.unreadDelta,
            mentionDelta: read.mentionDelta
          }
        });

        const response: TopicReadResponse = {
          topicId: read.topicId,
          lastReadMessageId: read.lastReadMessageId,
          lastReadAt: read.lastReadAt,
          unreadDelta: read.unreadDelta,
          mentionDelta: read.mentionDelta
        };

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
