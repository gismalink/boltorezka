import { z } from "zod";
import { db } from "../db.js";
import { loadCurrentUser, requireAuth, requireRole } from "../middleware/auth.js";
/** @typedef {import("../db.types.ts").RoomListRow} RoomListRow */
/** @typedef {import("../db.types.ts").RoomRow} RoomRow */
/** @typedef {import("../db.types.ts").RoomMessageRow} RoomMessageRow */
/** @typedef {import("../api-contract.types.ts").RoomsListResponse} RoomsListResponse */
/** @typedef {import("../api-contract.types.ts").RoomCreateResponse} RoomCreateResponse */
/** @typedef {import("../api-contract.types.ts").RoomMessagesResponse} RoomMessagesResponse */
/** @typedef {import("../request-context.types.ts").AuthenticatedRequestContext} AuthenticatedRequestContext */
/** @typedef {import("../request-context.types.ts").RoomMessagesRequestContext} RoomMessagesRequestContext */

const createRoomSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(48)
    .regex(/^[a-z0-9-]+$/),
  title: z.string().min(3).max(120),
  is_public: z.boolean().default(true)
});

export async function roomsRoutes(fastify) {
  fastify.get(
    "/v1/rooms",
    {
      preHandler: [requireAuth]
    },
    async (request) => {
      /** @type {AuthenticatedRequestContext} */
      const authRequest = request;
      const userId = String(authRequest.user?.sub || "").trim();
      const result = await db.query(
        `SELECT
           r.id,
           r.slug,
           r.title,
           r.is_public,
           r.created_at,
           EXISTS(
             SELECT 1 FROM room_members rm
             WHERE rm.room_id = r.id AND rm.user_id = $1
           ) AS is_member
         FROM rooms r
         ORDER BY created_at ASC`,
        [userId]
      );

      return /** @type {RoomsListResponse} */ ({
        rooms: /** @type {RoomListRow[]} */ (result.rows)
      });
    }
  );

  fastify.post(
    "/v1/rooms",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["admin", "super_admin"])]
    },
    async (request, reply) => {
      /** @type {AuthenticatedRequestContext} */
      const authRequest = request;
      const parsed = createRoomSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const { slug, title, is_public } = parsed.data;

      const existing = await db.query("SELECT id FROM rooms WHERE slug = $1", [slug]);

      if (existing.rowCount > 0) {
        return reply.code(409).send({
          error: "Conflict",
          message: "Room slug already exists"
        });
      }

      const createdBy = String(authRequest.user?.sub || "").trim();

      const created = await db.query(
        `INSERT INTO rooms (slug, title, is_public, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, slug, title, is_public, created_at`,
        [slug, title, is_public, createdBy]
      );

      const room = /** @type {RoomRow} */ (created.rows[0]);

      await db.query(
        `INSERT INTO room_members (room_id, user_id, role)
         VALUES ($1, $2, 'owner')
         ON CONFLICT (room_id, user_id) DO NOTHING`,
        [room.id, createdBy]
      );

      return reply.code(201).send(/** @type {RoomCreateResponse} */ ({ room }));
    }
  );

  fastify.get(
    "/v1/rooms/:slug/messages",
    {
      preHandler: [requireAuth]
    },
    async (request, reply) => {
      /** @type {RoomMessagesRequestContext} */
      const roomRequest = request;
      const userId = String(roomRequest.user?.sub || "").trim();
      const slug = String(roomRequest.params?.slug || "").trim();
      const limit = Math.min(100, Math.max(1, Number(roomRequest.query?.limit || 50)));

      const roomResult = await db.query(
        "SELECT id, slug, title, is_public FROM rooms WHERE slug = $1",
        [slug]
      );

      if (roomResult.rowCount === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      const room = /** @type {RoomRow} */ (roomResult.rows[0]);

      if (!room.is_public) {
        const membership = await db.query(
          "SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2",
          [room.id, userId]
        );

        if (membership.rowCount === 0) {
          return reply.code(403).send({
            error: "Forbidden",
            message: "You cannot access this room"
          });
        }
      }

      const messagesResult = await db.query(
        `SELECT
           m.id,
           m.room_id,
           m.user_id,
           m.body AS text,
           m.created_at,
           u.name AS user_name
         FROM messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.room_id = $1
         ORDER BY m.created_at DESC
         LIMIT $2`,
        [room.id, limit]
      );

      return /** @type {RoomMessagesResponse} */ ({
        room,
        messages: /** @type {RoomMessageRow[]} */ (messagesResult.rows).reverse()
      });
    }
  );
}
