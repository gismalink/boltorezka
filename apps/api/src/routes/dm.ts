import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireServiceAccess } from "../middleware/auth.js";
import {
  findOrCreateThread,
  getThreadById,
  getThreadsForUser,
  isThreadMember,
  getThreadPeerUserId,
  canSendDm,
  markThreadRead,
  getUnreadCountsForUser
} from "../services/dm-thread-service.js";
import { sendDmMessage, editDmMessage, deleteDmMessage, getDmMessages } from "../services/dm-message-service.js";
import {
  blockUser, unblockUser, getBlockList,
  addContact, removeContact, getContacts,
  getDmSettings, updateDmSettings,
  type DmAllowPolicy
} from "../services/dm-block-service.js";
import { broadcastRealtimeEnvelopeToUser } from "../realtime-broadcast.js";
import {
  buildDmMessageCreatedEnvelope,
  buildDmMessageUpdatedEnvelope,
  buildDmMessageDeletedEnvelope,
  buildDmThreadReadEnvelope
} from "../ws-protocol.js";

const AUTH_MIDDLEWARE = [requireAuth, requireServiceAccess];

const createThreadSchema = z.object({
  peerUserId: z.string().uuid()
});

const sendMessageSchema = z.object({
  body: z.string().min(1).max(4000),
  attachments: z.unknown().optional()
});

const editMessageSchema = z.object({
  body: z.string().min(1).max(4000)
});

const markReadSchema = z.object({
  lastReadMessageId: z.string().uuid()
});

const updateSettingsSchema = z.object({
  allowDmFrom: z.enum(["contacts_only", "mutual_servers", "everyone"])
});

const addContactSchema = z.object({
  contactUserId: z.string().uuid()
});

export async function dmRoutes(fastify: FastifyInstance) {

  // ─── threads ────────────────────────────────────────

  /** Список DM-тредов текущего пользователя */
  fastify.get("/v1/dm/threads", { preHandler: AUTH_MIDDLEWARE }, async (request) => {
    const userId = String(request.user?.sub || "").trim();
    const threads = await getThreadsForUser(userId);
    const unreads = await getUnreadCountsForUser(userId);
    return {
      threads: threads.map((t) => ({
        ...t,
        unreadCount: unreads[t.id] || 0
      }))
    };
  });

  /** Создать / получить существующий DM thread */
  fastify.post("/v1/dm/threads", { preHandler: AUTH_MIDDLEWARE }, async (request, reply) => {
    const userId = String(request.user?.sub || "").trim();
    const parsed = createThreadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.format() });
    }

    const { peerUserId } = parsed.data;
    if (peerUserId === userId) {
      return reply.code(400).send({ error: "dm_self_thread" });
    }

    const access = await canSendDm(userId, peerUserId);
    if (!access.allowed) {
      return reply.code(403).send({ error: access.reason || "dm_forbidden" });
    }

    const thread = await findOrCreateThread(userId, peerUserId);

    // Авто-контакт при первом DM
    await addContact(userId, peerUserId, "dm_auto").catch(() => {});
    await addContact(peerUserId, userId, "dm_auto").catch(() => {});

    return { thread };
  });

  // ─── messages ───────────────────────────────────────

  /** История сообщений DM thread */
  fastify.get<{
    Params: { threadId: string };
    Querystring: { cursor?: string; limit?: string };
  }>("/v1/dm/threads/:threadId/messages", { preHandler: AUTH_MIDDLEWARE }, async (request, reply) => {
    const userId = String(request.user?.sub || "").trim();
    const { threadId } = request.params;

    const thread = await getThreadById(threadId);
    if (!thread || !isThreadMember(thread, userId)) {
      return reply.code(403).send({ error: "dm_thread_not_member" });
    }

    const cursor = request.query.cursor || undefined;
    const limit = Math.min(parseInt(request.query.limit || "50", 10) || 50, 100);

    return getDmMessages({ threadId, cursor, limit });
  });

  /** Отправить сообщение в DM thread */
  fastify.post<{ Params: { threadId: string } }>(
    "/v1/dm/threads/:threadId/messages",
    { preHandler: AUTH_MIDDLEWARE },
    async (request, reply) => {
      const userId = String(request.user?.sub || "").trim();
      const { threadId } = request.params;

      const thread = await getThreadById(threadId);
      if (!thread || !isThreadMember(thread, userId)) {
        return reply.code(403).send({ error: "dm_thread_not_member" });
      }

      const parsed = sendMessageSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", details: parsed.error.format() });
      }

      const peerUserId = getThreadPeerUserId(thread, userId);
      const access = await canSendDm(userId, peerUserId);
      if (!access.allowed) {
        return reply.code(403).send({ error: access.reason || "dm_forbidden" });
      }

      const message = await sendDmMessage({
        threadId,
        senderUserId: userId,
        body: parsed.data.body,
        attachmentsJson: parsed.data.attachments
      });

      // Realtime: уведомить обоих участников
      const envelope = buildDmMessageCreatedEnvelope(message);
      broadcastRealtimeEnvelopeToUser(userId, envelope);
      broadcastRealtimeEnvelopeToUser(peerUserId, envelope);

      return { message };
    }
  );

  /** Редактировать DM сообщение */
  fastify.patch<{ Params: { messageId: string } }>(
    "/v1/dm/messages/:messageId",
    { preHandler: AUTH_MIDDLEWARE },
    async (request, reply) => {
      const userId = String(request.user?.sub || "").trim();
      const { messageId } = request.params;

      const parsed = editMessageSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", details: parsed.error.format() });
      }

      try {
        const message = await editDmMessage({
          messageId,
          senderUserId: userId,
          body: parsed.data.body
        });

        const thread = await getThreadById(message.threadId);
        if (thread) {
          const peerUserId = getThreadPeerUserId(thread, userId);
          const envelope = buildDmMessageUpdatedEnvelope(message);
          broadcastRealtimeEnvelopeToUser(userId, envelope);
          broadcastRealtimeEnvelopeToUser(peerUserId, envelope);
        }

        return { message };
      } catch (err: unknown) {
        const code = (err as Error).message;
        if (code === "dm_message_not_found") return reply.code(404).send({ error: code });
        if (code === "dm_forbidden_edit") return reply.code(403).send({ error: code });
        if (code === "dm_edit_window_expired") return reply.code(403).send({ error: code });
        throw err;
      }
    }
  );

  /** Удалить DM сообщение (soft delete) */
  fastify.delete<{ Params: { messageId: string } }>(
    "/v1/dm/messages/:messageId",
    { preHandler: AUTH_MIDDLEWARE },
    async (request, reply) => {
      const userId = String(request.user?.sub || "").trim();
      const { messageId } = request.params;

      try {
        const { id, threadId } = await deleteDmMessage({ messageId, senderUserId: userId });

        const thread = await getThreadById(threadId);
        if (thread) {
          const peerUserId = getThreadPeerUserId(thread, userId);
          const envelope = buildDmMessageDeletedEnvelope({ id, threadId });
          broadcastRealtimeEnvelopeToUser(userId, envelope);
          broadcastRealtimeEnvelopeToUser(peerUserId, envelope);
        }

        return { ok: true };
      } catch (err: unknown) {
        const code = (err as Error).message;
        if (code === "dm_message_not_found") return reply.code(404).send({ error: code });
        if (code === "dm_forbidden_delete") return reply.code(403).send({ error: code });
        if (code === "dm_edit_window_expired") return reply.code(403).send({ error: code });
        throw err;
      }
    }
  );

  // ─── read cursors ───────────────────────────────────

  /** Пометить thread прочитанным */
  fastify.post<{ Params: { threadId: string } }>(
    "/v1/dm/threads/:threadId/read",
    { preHandler: AUTH_MIDDLEWARE },
    async (request, reply) => {
      const userId = String(request.user?.sub || "").trim();
      const { threadId } = request.params;

      const thread = await getThreadById(threadId);
      if (!thread || !isThreadMember(thread, userId)) {
        return reply.code(403).send({ error: "dm_thread_not_member" });
      }

      const parsed = markReadSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", details: parsed.error.format() });
      }

      await markThreadRead(threadId, userId, parsed.data.lastReadMessageId);

      // Уведомить peer о прочтении
      const peerUserId = getThreadPeerUserId(thread, userId);
      const envelope = buildDmThreadReadEnvelope({ threadId, userId, lastReadMessageId: parsed.data.lastReadMessageId });
      broadcastRealtimeEnvelopeToUser(peerUserId, envelope);

      return { ok: true };
    }
  );

  // ─── contacts ───────────────────────────────────────

  fastify.get("/v1/dm/contacts", { preHandler: AUTH_MIDDLEWARE }, async (request) => {
    const userId = String(request.user?.sub || "").trim();
    return { contacts: await getContacts(userId) };
  });

  fastify.post("/v1/dm/contacts", { preHandler: AUTH_MIDDLEWARE }, async (request, reply) => {
    const userId = String(request.user?.sub || "").trim();
    const parsed = addContactSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.format() });
    }
    try {
      await addContact(userId, parsed.data.contactUserId);
    } catch (err: unknown) {
      if ((err as Error).message === "dm_contact_self") {
        return reply.code(400).send({ error: "dm_contact_self" });
      }
      throw err;
    }
    return { ok: true };
  });

  fastify.delete<{ Params: { contactUserId: string } }>(
    "/v1/dm/contacts/:contactUserId",
    { preHandler: AUTH_MIDDLEWARE },
    async (request) => {
      const userId = String(request.user?.sub || "").trim();
      await removeContact(userId, request.params.contactUserId);
      return { ok: true };
    }
  );

  // ─── block list ─────────────────────────────────────

  fastify.get("/v1/dm/block-list", { preHandler: AUTH_MIDDLEWARE }, async (request) => {
    const userId = String(request.user?.sub || "").trim();
    return { blocked: await getBlockList(userId) };
  });

  fastify.post<{ Params: { userId: string } }>(
    "/v1/dm/block-list/:userId",
    { preHandler: AUTH_MIDDLEWARE },
    async (request, reply) => {
      const currentUserId = String(request.user?.sub || "").trim();
      try {
        await blockUser(currentUserId, request.params.userId);
      } catch (err: unknown) {
        if ((err as Error).message === "dm_block_self") {
          return reply.code(400).send({ error: "dm_block_self" });
        }
        throw err;
      }
      return { ok: true };
    }
  );

  fastify.delete<{ Params: { userId: string } }>(
    "/v1/dm/block-list/:userId",
    { preHandler: AUTH_MIDDLEWARE },
    async (request) => {
      const currentUserId = String(request.user?.sub || "").trim();
      await unblockUser(currentUserId, request.params.userId);
      return { ok: true };
    }
  );

  // ─── settings ───────────────────────────────────────

  fastify.get("/v1/dm/settings", { preHandler: AUTH_MIDDLEWARE }, async (request) => {
    const userId = String(request.user?.sub || "").trim();
    return getDmSettings(userId);
  });

  fastify.patch("/v1/dm/settings", { preHandler: AUTH_MIDDLEWARE }, async (request, reply) => {
    const userId = String(request.user?.sub || "").trim();
    const parsed = updateSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.format() });
    }
    await updateDmSettings(userId, parsed.data.allowDmFrom as DmAllowPolicy);
    return { ok: true };
  });
}
