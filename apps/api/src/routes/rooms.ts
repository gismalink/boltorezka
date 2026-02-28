import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { loadCurrentUser, requireAuth, requireRole } from "../middleware/auth.js";
import type { RoomCategoryRow, RoomListRow, RoomMessageRow, RoomRow } from "../db.types.ts";
import type {
  RoomCategoryCreateResponse,
  RoomCreateResponse,
  RoomMessagesResponse,
  RoomsListResponse,
  RoomsTreeResponse
} from "../api-contract.types.ts";

type RoomListDbRow = RoomListRow & {
  category_id: string | null;
  kind: "text" | "text_voice" | "text_voice_video";
  position: number;
};

const roomKindSchema = z
  .enum(["text", "text_voice", "text_voice_video", "voice"])
  .transform((value) => (value === "voice" ? "text_voice" : value));

const createRoomSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(48)
    .regex(/^[a-z0-9-]+$/),
  title: z.string().min(3).max(120),
  is_public: z.boolean().default(true),
  kind: roomKindSchema.default("text"),
  category_id: z.string().uuid().nullable().optional().default(null),
  position: z.number().int().min(0).optional()
});

const updateRoomSchema = z.object({
  title: z.string().min(3).max(120),
  kind: roomKindSchema,
  category_id: z.string().uuid().nullable()
});

const moveRoomSchema = z.object({
  direction: z.enum(["up", "down"])
});

const createCategorySchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(48)
    .regex(/^[a-z0-9-]+$/),
  title: z.string().min(2).max(120),
  position: z.number().int().min(0).optional()
});

const updateCategorySchema = z.object({
  title: z.string().min(2).max(120)
});

const moveCategorySchema = z.object({
  direction: z.enum(["up", "down"])
});

export async function roomsRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/v1/rooms/tree",
    {
      preHandler: [requireAuth]
    },
    async (request) => {
      const userId = String(request.user?.sub || "").trim();
      const categoriesResult = await db.query<RoomCategoryRow>(
        `SELECT id, slug, title, position, created_at
         FROM room_categories
         ORDER BY position ASC, created_at ASC`
      );

      const channelsResult = await db.query<RoomListDbRow>(
        `SELECT
           r.id,
           r.slug,
           r.title,
           r.kind,
           r.category_id,
           r.position,
           r.is_public,
           r.created_at,
           EXISTS(
             SELECT 1 FROM room_members rm
             WHERE rm.room_id = r.id AND rm.user_id = $1
           ) AS is_member
         FROM rooms r
         ORDER BY r.category_id NULLS FIRST, r.position ASC, r.created_at ASC`,
        [userId]
      );

      const byCategory = new Map<string, RoomListDbRow[]>();
      const uncategorized: RoomListDbRow[] = [];

      channelsResult.rows.forEach((channel) => {
        if (!channel.category_id) {
          uncategorized.push(channel);
          return;
        }

        const list = byCategory.get(channel.category_id) || [];
        list.push(channel);
        byCategory.set(channel.category_id, list);
      });

      const response: RoomsTreeResponse = {
        categories: categoriesResult.rows.map((category) => ({
          ...category,
          channels: byCategory.get(category.id) || []
        })),
        uncategorized
      };

      return response;
    }
  );

  fastify.get(
    "/v1/rooms",
    {
      preHandler: [requireAuth]
    },
    async (request) => {
      const userId = String(request.user?.sub || "").trim();
      const result = await db.query<RoomListDbRow>(
        `SELECT
           r.id,
           r.slug,
           r.title,
           r.kind,
           r.category_id,
           r.position,
           r.is_public,
           r.created_at,
           EXISTS(
             SELECT 1 FROM room_members rm
             WHERE rm.room_id = r.id AND rm.user_id = $1
           ) AS is_member
         FROM rooms r
         ORDER BY category_id NULLS FIRST, position ASC, created_at ASC`,
        [userId]
      );

      const response: RoomsListResponse = { rooms: result.rows };
      return response;
    }
  );

  fastify.post<{ Body: { slug: string; title: string; position?: number } }>(
    "/v1/room-categories",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["admin", "super_admin"])]
    },
    async (request, reply) => {
      const parsed = createCategorySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const { slug, title } = parsed.data;
      const createdBy = String(request.user?.sub || "").trim();
      const existing = await db.query("SELECT id FROM room_categories WHERE slug = $1", [slug]);

      if ((existing.rowCount || 0) > 0) {
        return reply.code(409).send({
          error: "Conflict",
          message: "Category slug already exists"
        });
      }

      const position = typeof parsed.data.position === "number"
        ? parsed.data.position
        : Number(
            (
              await db.query<{ next_position: number }>(
                "SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM room_categories"
              )
            ).rows[0]?.next_position || 0
          );

      const created = await db.query<RoomCategoryRow>(
        `INSERT INTO room_categories (slug, title, position, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, slug, title, position, created_at`,
        [slug, title, position, createdBy]
      );

      const response: RoomCategoryCreateResponse = { category: created.rows[0] };
      return reply.code(201).send(response);
    }
  );

  fastify.patch<{
    Params: { categoryId: string };
    Body: { title: string };
  }>(
    "/v1/room-categories/:categoryId",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["admin", "super_admin"])]
    },
    async (request, reply) => {
      const categoryId = String(request.params.categoryId || "").trim();
      if (!categoryId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "categoryId is required"
        });
      }

      const parsed = updateCategorySchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const updated = await db.query<RoomCategoryRow>(
        `UPDATE room_categories
         SET title = $2
         WHERE id = $1
         RETURNING id, slug, title, position, created_at`,
        [categoryId, parsed.data.title.trim()]
      );

      if ((updated.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "CategoryNotFound",
          message: "Category does not exist"
        });
      }

      return { category: updated.rows[0] };
    }
  );

  fastify.post<{
    Params: { categoryId: string };
    Body: { direction: "up" | "down" };
  }>(
    "/v1/room-categories/:categoryId/move",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["admin", "super_admin"])]
    },
    async (request, reply) => {
      const categoryId = String(request.params.categoryId || "").trim();
      if (!categoryId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "categoryId is required"
        });
      }

      const parsed = moveCategorySchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const currentResult = await db.query<RoomCategoryRow>(
        `SELECT id, slug, title, position, created_at
         FROM room_categories
         WHERE id = $1`,
        [categoryId]
      );

      if ((currentResult.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "CategoryNotFound",
          message: "Category does not exist"
        });
      }

      const current = currentResult.rows[0];
      const direction = parsed.data.direction;
      const neighborQuery = direction === "up"
        ? `SELECT id, position FROM room_categories
           WHERE position < $1
           ORDER BY position DESC
           LIMIT 1`
        : `SELECT id, position FROM room_categories
           WHERE position > $1
           ORDER BY position ASC
           LIMIT 1`;

      const neighborResult = await db.query<{ id: string; position: number }>(neighborQuery, [current.position]);

      if ((neighborResult.rowCount || 0) === 0) {
        return { category: current };
      }

      const neighbor = neighborResult.rows[0];

      await db.query(
        `UPDATE room_categories
         SET position = CASE
           WHEN id = $1 THEN $3
           WHEN id = $2 THEN $4
           ELSE position
         END
         WHERE id IN ($1, $2)`,
        [current.id, neighbor.id, neighbor.position, current.position]
      );

      const updated = await db.query<RoomCategoryRow>(
        `SELECT id, slug, title, position, created_at
         FROM room_categories
         WHERE id = $1`,
        [current.id]
      );

      return { category: updated.rows[0] };
    }
  );

  fastify.delete<{
    Params: { categoryId: string };
  }>(
    "/v1/room-categories/:categoryId",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["admin", "super_admin"])]
    },
    async (request, reply) => {
      const categoryId = String(request.params.categoryId || "").trim();
      if (!categoryId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "categoryId is required"
        });
      }

      const categoryStats = await db.query<{ category_exists: boolean; room_count: number }>(
        `SELECT
           EXISTS(SELECT 1 FROM room_categories WHERE id = $1) AS category_exists,
           (SELECT COUNT(*)::int FROM rooms WHERE category_id = $1) AS room_count`,
        [categoryId]
      );

      const current = categoryStats.rows[0];

      if (!current?.category_exists) {
        return reply.code(404).send({
          error: "CategoryNotFound",
          message: "Category does not exist"
        });
      }

      if ((current?.room_count || 0) > 0) {
        return reply.code(409).send({
          error: "CategoryNotEmpty",
          message: "Cannot delete category with channels"
        });
      }

      const deleted = await db.query(
        `DELETE FROM room_categories
         WHERE id = $1
         RETURNING id`,
        [categoryId]
      );

      return { ok: true, categoryId };
    }
  );

  fastify.post<{
    Body: {
      slug: string;
      title: string;
      is_public?: boolean;
      kind?: "text" | "text_voice" | "text_voice_video";
      category_id?: string | null;
      position?: number;
    }
  }>(
    "/v1/rooms",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["admin", "super_admin"])]
    },
    async (request, reply) => {
      const parsed = createRoomSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const { slug, title, is_public, kind, category_id } = parsed.data;

      if (category_id) {
        const category = await db.query("SELECT id FROM room_categories WHERE id = $1", [category_id]);
        if ((category.rowCount || 0) === 0) {
          return reply.code(400).send({
            error: "ValidationError",
            message: "category_id does not exist"
          });
        }
      }

      const existing = await db.query("SELECT id FROM rooms WHERE slug = $1", [slug]);

      if ((existing.rowCount || 0) > 0) {
        return reply.code(409).send({
          error: "Conflict",
          message: "Room slug already exists"
        });
      }

      const createdBy = String(request.user?.sub || "").trim();
      const position = typeof parsed.data.position === "number"
        ? parsed.data.position
        : Number(
            (
              await db.query<{ next_position: number }>(
                `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
                 FROM rooms
                 WHERE category_id IS NOT DISTINCT FROM $1`,
                [category_id]
              )
            ).rows[0]?.next_position || 0
          );

      const created = await db.query<RoomRow>(
        `INSERT INTO rooms (slug, title, kind, category_id, position, is_public, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, slug, title, kind, category_id, position, is_public, created_at`,
        [slug, title, kind, category_id, position, is_public, createdBy]
      );

      const room = created.rows[0];

      await db.query(
        `INSERT INTO room_members (room_id, user_id, role)
         VALUES ($1, $2, 'owner')
         ON CONFLICT (room_id, user_id) DO NOTHING`,
        [room.id, createdBy]
      );

      const response: RoomCreateResponse = { room };
      return reply.code(201).send(response);
    }
  );

  fastify.patch<{
    Params: { roomId: string };
    Body: {
      title: string;
      kind: "text" | "text_voice" | "text_voice_video" | "voice";
      category_id: string | null;
    };
  }>(
    "/v1/rooms/:roomId",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["admin", "super_admin"])]
    },
    async (request, reply) => {
      const roomId = String(request.params.roomId || "").trim();
      if (!roomId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "roomId is required"
        });
      }

      const parsed = updateRoomSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const { title, kind, category_id } = parsed.data;

      if (category_id) {
        const category = await db.query("SELECT id FROM room_categories WHERE id = $1", [category_id]);
        if ((category.rowCount || 0) === 0) {
          return reply.code(400).send({
            error: "ValidationError",
            message: "category_id does not exist"
          });
        }
      }

      const updated = await db.query<RoomRow>(
        `UPDATE rooms
         SET title = $2,
             kind = $3,
             category_id = $4
         WHERE id = $1
         RETURNING id, slug, title, kind, category_id, position, is_public, created_at`,
        [roomId, title.trim(), kind, category_id]
      );

      if ((updated.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      return { room: updated.rows[0] };
    }
  );

  fastify.post<{
    Params: { roomId: string };
    Body: { direction: "up" | "down" };
  }>(
    "/v1/rooms/:roomId/move",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["admin", "super_admin"])]
    },
    async (request, reply) => {
      const roomId = String(request.params.roomId || "").trim();
      if (!roomId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "roomId is required"
        });
      }

      const parsed = moveRoomSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const currentResult = await db.query<RoomRow>(
        `SELECT id, slug, title, kind, category_id, position, is_public, created_at
         FROM rooms
         WHERE id = $1`,
        [roomId]
      );

      if ((currentResult.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      const current = currentResult.rows[0];
      const direction = parsed.data.direction;
      const neighborQuery = direction === "up"
        ? `SELECT id, position FROM rooms
           WHERE category_id IS NOT DISTINCT FROM $1
             AND position < $2
           ORDER BY position DESC
           LIMIT 1`
        : `SELECT id, position FROM rooms
           WHERE category_id IS NOT DISTINCT FROM $1
             AND position > $2
           ORDER BY position ASC
           LIMIT 1`;

      const neighborResult = await db.query<{ id: string; position: number }>(neighborQuery, [
        current.category_id,
        current.position
      ]);

      if ((neighborResult.rowCount || 0) === 0) {
        return { room: current };
      }

      const neighbor = neighborResult.rows[0];

      await db.query(
        `UPDATE rooms
         SET position = CASE
           WHEN id = $1 THEN $3
           WHEN id = $2 THEN $4
           ELSE position
         END
         WHERE id IN ($1, $2)`,
        [current.id, neighbor.id, neighbor.position, current.position]
      );

      const updated = await db.query<RoomRow>(
        `SELECT id, slug, title, kind, category_id, position, is_public, created_at
         FROM rooms
         WHERE id = $1`,
        [current.id]
      );

      return { room: updated.rows[0] };
    }
  );

  fastify.delete<{
    Params: { roomId: string };
  }>(
    "/v1/rooms/:roomId",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["admin", "super_admin"])]
    },
    async (request, reply) => {
      const roomId = String(request.params.roomId || "").trim();
      if (!roomId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "roomId is required"
        });
      }

      const stats = await db.query<{ total_rooms: number; room_exists: boolean }>(
        `SELECT
           (SELECT COUNT(*)::int FROM rooms) AS total_rooms,
           EXISTS(SELECT 1 FROM rooms WHERE id = $1) AS room_exists`,
        [roomId]
      );

      const current = stats.rows[0];

      if (!current?.room_exists) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      if ((current?.total_rooms || 0) <= 1) {
        return reply.code(409).send({
          error: "LastRoomProtected",
          message: "Cannot delete the last remaining room"
        });
      }

      const deleted = await db.query(
        `DELETE FROM rooms
         WHERE id = $1
         RETURNING id`,
        [roomId]
      );

      if ((deleted.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      return { ok: true, roomId };
    }
  );

  fastify.get<{
    Params: { slug: string };
    Querystring: { limit?: string | number; beforeCreatedAt?: string; beforeId?: string };
  }>(
    "/v1/rooms/:slug/messages",
    {
      preHandler: [requireAuth]
    },
    async (request, reply) => {
      const userId = String(request.user?.sub || "").trim();
      const slug = String(request.params.slug || "").trim();
      const limit = Math.min(100, Math.max(1, Number(request.query.limit || 50)));
      const beforeCreatedAtRaw = String(request.query.beforeCreatedAt || "").trim();
      const beforeIdRaw = String(request.query.beforeId || "").trim();

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

      const roomResult = await db.query<RoomRow>(
        "SELECT id, slug, title, kind, category_id, position, is_public FROM rooms WHERE slug = $1",
        [slug]
      );

      if (roomResult.rowCount === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      const room = roomResult.rows[0];

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

      const messagesResult = beforeCreatedAt && beforeId
        ? await db.query<RoomMessageRow>(
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
               AND (m.created_at, m.id) < ($2::timestamptz, $3)
             ORDER BY m.created_at DESC, m.id DESC
             LIMIT $4`,
            [room.id, beforeCreatedAt, beforeId, limit + 1]
          )
        : await db.query<RoomMessageRow>(
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
             ORDER BY m.created_at DESC, m.id DESC
             LIMIT $2`,
            [room.id, limit + 1]
          );

      const hasMore = messagesResult.rows.length > limit;
      const pageDesc = hasMore ? messagesResult.rows.slice(0, limit) : messagesResult.rows;
      const oldestInPage = pageDesc[pageDesc.length - 1] || null;

      const response: RoomMessagesResponse = {
        room,
        messages: pageDesc.reverse(),
        pagination: {
          hasMore,
          nextCursor: hasMore && oldestInPage
            ? {
                beforeCreatedAt: oldestInPage.created_at,
                beforeId: oldestInPage.id
              }
            : null
        }
      };
      return response;
    }
  );
}
