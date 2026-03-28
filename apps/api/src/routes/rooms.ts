import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { broadcastRealtimeEnvelope } from "../realtime-broadcast.js";
import { loadCurrentUser, requireAuth, requireRole, requireServiceAccess } from "../middleware/auth.js";
import type { RoomCategoryRow, RoomListRow, RoomMessageRow, RoomRow } from "../db.types.ts";
import { isServerAgeConfirmed } from "../services/age-verification-service.js";
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
  member_names: string[];
};

const roomKindSchema = z
  .enum(["text", "text_voice", "text_voice_video", "voice"])
  .transform((value) => (value === "voice" ? "text_voice" : value));

const audioQualitySchema = z.enum(["retro", "low", "standard", "high"]);

const createRoomSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(48)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  title: z.string().min(3).max(120),
  is_public: z.boolean().default(true),
  kind: roomKindSchema.default("text"),
  server_id: z.string().uuid().optional(),
  category_id: z.string().uuid().nullable().optional().default(null),
  audio_quality_override: audioQualitySchema.nullable().optional(),
  position: z.number().int().min(0).optional()
});

const updateRoomSchema = z.object({
  title: z.string().min(3).max(120),
  kind: roomKindSchema,
  category_id: z.string().uuid().nullable(),
  audio_quality_override: audioQualitySchema.nullable().optional()
});

const moveRoomSchema = z.object({
  direction: z.enum(["up", "down"])
});

const createCategorySchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(48)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  title: z.string().min(2).max(120),
  position: z.number().int().min(0).optional()
});

function toSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function ensureUniqueCategorySlug(baseSlug: string): Promise<string> {
  const normalizedBase = baseSlug || "category";
  let candidate = normalizedBase;

  for (let i = 0; i < 100; i += 1) {
    const result = await db.query<{ id: string }>("SELECT id FROM room_categories WHERE slug = $1 LIMIT 1", [candidate]);
    if ((result.rowCount || 0) === 0) {
      return candidate;
    }

    candidate = `${normalizedBase}-${i + 2}`.slice(0, 48);
  }

  return `${normalizedBase}-${Date.now().toString(36)}`.slice(0, 48);
}

async function ensureUniqueRoomSlug(baseSlug: string): Promise<string> {
  const normalizedBase = baseSlug || "room";
  let candidate = normalizedBase;

  for (let i = 0; i < 100; i += 1) {
    const result = await db.query<{ id: string }>("SELECT id FROM rooms WHERE slug = $1 LIMIT 1", [candidate]);
    if ((result.rowCount || 0) === 0) {
      return candidate;
    }

    candidate = `${normalizedBase}-${i + 2}`.slice(0, 48);
  }

  return `${normalizedBase}-${Date.now().toString(36)}`.slice(0, 48);
}

const updateCategorySchema = z.object({
  title: z.string().min(2).max(120)
});

const moveCategorySchema = z.object({
  direction: z.enum(["up", "down"])
});

export async function roomsRoutes(fastify: FastifyInstance) {
  const resolveAccessibleServerId = async (userId: string, requestedServerId: string): Promise<string | null> => {
    const normalized = String(requestedServerId || "").trim();
    if (!normalized) {
      return null;
    }

    const membership = await db.query<{ server_id: string }>(
      `SELECT sm.server_id
       FROM server_members sm
       WHERE sm.server_id = $1
         AND sm.user_id = $2
         AND sm.status = 'active'
       LIMIT 1`,
      [normalized, userId]
    );

    if ((membership.rowCount || 0) === 0) {
      return null;
    }

    return normalized;
  };

  const incrementReadMetricBy = async (name: string, value: number) => {
    const delta = Number.isFinite(value) ? Math.trunc(value) : 0;
    if (delta <= 0) {
      return;
    }

    try {
      const day = new Date().toISOString().slice(0, 10);
      await fastify.redis.hIncrBy(`ws:metrics:${day}`, name, delta);
    } catch {
      // Metrics are best-effort and must not affect request flow.
    }
  };

  fastify.get<{ Querystring: { serverId?: string } }>(
    "/v1/rooms/tree",
    {
      preHandler: [requireAuth, requireServiceAccess]
    },
    async (request) => {
      const userId = String(request.user?.sub || "").trim();
      const requestedServerId = String(request.query.serverId || "").trim();
      const activeServerId = requestedServerId
        ? await resolveAccessibleServerId(userId, requestedServerId)
        : null;

      if (requestedServerId && !activeServerId) {
        const response: RoomsTreeResponse = {
          categories: [],
          uncategorized: []
        };
        return response;
      }

      const categoriesResult = await db.query<RoomCategoryRow>(
        `SELECT id, slug, title, position, created_at
         FROM room_categories
         ORDER BY position ASC, created_at ASC`
      );

      const roomFilters = ["r.is_archived = FALSE"];
      const roomParams: string[] = [userId];
      if (activeServerId) {
        roomParams.push(activeServerId);
        roomFilters.push(`r.server_id = $${roomParams.length}`);
      }

      const channelsResult = await db.query<RoomListDbRow>(
        `SELECT
           r.id,
           r.slug,
           r.title,
           r.kind,
           r.audio_quality_override,
           r.category_id,
           r.position,
           r.is_public,
           r.created_at,
           ARRAY(
             SELECT DISTINCT u.name
             FROM room_members rm
             JOIN users u ON u.id = rm.user_id
             WHERE rm.room_id = r.id
             ORDER BY u.name
           ) AS member_names,
           EXISTS(
             SELECT 1 FROM room_members rm
             WHERE rm.room_id = r.id AND rm.user_id = $1
           ) AS is_member
         FROM rooms r
         WHERE ${roomFilters.join(" AND ")}
         ORDER BY r.category_id NULLS FIRST, r.position ASC, r.created_at ASC`,
        roomParams
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

  fastify.get<{ Querystring: { serverId?: string } }>(
    "/v1/rooms",
    {
      preHandler: [requireAuth, requireServiceAccess]
    },
    async (request) => {
      const userId = String(request.user?.sub || "").trim();
      const requestedServerId = String(request.query.serverId || "").trim();
      const activeServerId = requestedServerId
        ? await resolveAccessibleServerId(userId, requestedServerId)
        : null;

      if (requestedServerId && !activeServerId) {
        const response: RoomsListResponse = { rooms: [] };
        return response;
      }

      const roomFilters = ["r.is_archived = FALSE"];
      const roomParams: string[] = [userId];
      if (activeServerId) {
        roomParams.push(activeServerId);
        roomFilters.push(`r.server_id = $${roomParams.length}`);
      }

      const result = await db.query<RoomListDbRow>(
        `SELECT
           r.id,
           r.slug,
           r.title,
           r.kind,
           r.audio_quality_override,
           r.category_id,
           r.position,
           r.is_public,
           r.created_at,
           ARRAY(
             SELECT DISTINCT u.name
             FROM room_members rm
             JOIN users u ON u.id = rm.user_id
             WHERE rm.room_id = r.id
             ORDER BY u.name
           ) AS member_names,
           EXISTS(
             SELECT 1 FROM room_members rm
             WHERE rm.room_id = r.id AND rm.user_id = $1
           ) AS is_member
         FROM rooms r
         WHERE ${roomFilters.join(" AND ")}
         ORDER BY category_id NULLS FIRST, position ASC, created_at ASC`,
        roomParams
      );

      const response: RoomsListResponse = { rooms: result.rows };
      return response;
    }
  );

  fastify.get<{ Querystring: { serverId?: string } }>(
    "/v1/rooms/archived",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser, requireRole(["admin", "super_admin"])]
    },
    async (request) => {
      const userId = String(request.user?.sub || "").trim();
      const requestedServerId = String(request.query.serverId || "").trim();
      const activeServerId = requestedServerId
        ? await resolveAccessibleServerId(userId, requestedServerId)
        : null;

      if (requestedServerId && !activeServerId) {
        const response: RoomsListResponse = { rooms: [] };
        return response;
      }

      const roomFilters = ["r.is_archived = TRUE"];
      const roomParams: string[] = [userId];
      if (activeServerId) {
        roomParams.push(activeServerId);
        roomFilters.push(`r.server_id = $${roomParams.length}`);
      }

      const result = await db.query<RoomListDbRow>(
        `SELECT
           r.id,
           r.slug,
           r.title,
           r.kind,
           r.audio_quality_override,
           r.category_id,
           r.position,
           r.is_public,
           r.created_at,
           ARRAY(
             SELECT DISTINCT u.name
             FROM room_members rm
             JOIN users u ON u.id = rm.user_id
             WHERE rm.room_id = r.id
             ORDER BY u.name
           ) AS member_names,
           EXISTS(
             SELECT 1 FROM room_members rm
             WHERE rm.room_id = r.id AND rm.user_id = $1
           ) AS is_member
         FROM rooms r
         WHERE ${roomFilters.join(" AND ")}
         ORDER BY r.created_at DESC, r.title ASC`,
        roomParams
      );

      const response: RoomsListResponse = { rooms: result.rows };
      return response;
    }
  );

  fastify.post<{ Body: { slug: string; title: string; position?: number } }>(
    "/v1/room-categories",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser, requireRole(["admin", "super_admin"])]
    },
    async (request, reply) => {
      const parsed = createCategorySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const { title } = parsed.data;
      const createdBy = String(request.user?.sub || "").trim();
      const requestedSlug = String(parsed.data.slug || "").trim();
      const slug = await ensureUniqueCategorySlug(requestedSlug || toSlug(title) || "category");

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
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser, requireRole(["admin", "super_admin"])]
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
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser, requireRole(["admin", "super_admin"])]
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
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser, requireRole(["admin", "super_admin"])]
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
           (SELECT COUNT(*)::int FROM rooms WHERE category_id = $1 AND is_archived = FALSE) AS room_count`,
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
      server_id?: string;
      category_id?: string | null;
      audio_quality_override?: "retro" | "low" | "standard" | "high" | null;
      position?: number;
    }
  }>(
    "/v1/rooms",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const parsed = createRoomSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const { title, is_public, kind, category_id } = parsed.data;
      const hasAudioQualityOverride = Object.prototype.hasOwnProperty.call(parsed.data, "audio_quality_override");
      const isSuperAdmin = request.currentUser?.role === "super_admin";
      if (hasAudioQualityOverride && !isSuperAdmin) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Only super_admin can change room audio quality override"
        });
      }
      const audioQualityOverride = hasAudioQualityOverride
        ? (parsed.data.audio_quality_override ?? null)
        : null;

      if (category_id) {
        const category = await db.query("SELECT id FROM room_categories WHERE id = $1", [category_id]);
        if ((category.rowCount || 0) === 0) {
          return reply.code(400).send({
            error: "ValidationError",
            message: "category_id does not exist"
          });
        }
      }

      const requestedSlug = String(parsed.data.slug || "").trim();
      const slug = await ensureUniqueRoomSlug(requestedSlug || toSlug(title) || "room");

      const createdBy = String(request.user?.sub || "").trim();
      const requestedServerId = String(parsed.data.server_id || "").trim();
      let targetServerId = "";

      if (requestedServerId) {
        const accessibleServerId = await resolveAccessibleServerId(createdBy, requestedServerId);
        if (!accessibleServerId) {
          return reply.code(403).send({
            error: "not_server_member",
            message: "You are not a member of this server"
          });
        }

        targetServerId = accessibleServerId;
      } else {
        const defaultServerResult = await db.query<{ id: string }>(
          `SELECT id
           FROM servers
           WHERE is_default = TRUE
           ORDER BY created_at ASC
           LIMIT 1`
        );

        targetServerId = String(defaultServerResult.rows[0]?.id || "").trim();
        if (!targetServerId) {
          return reply.code(500).send({
            error: "ServerNotConfigured",
            message: "Default server is not configured"
          });
        }
      }

      const globalRole = String(request.currentUser?.role || "user").trim();
      let canCreateRoom = globalRole === "admin" || globalRole === "super_admin";

      if (!canCreateRoom) {
        const membership = await db.query<{ role: string }>(
          `SELECT role
           FROM server_members
           WHERE server_id = $1
             AND user_id = $2
             AND status = 'active'
           LIMIT 1`,
          [targetServerId, createdBy]
        );

        const serverRole = String(membership.rows[0]?.role || "").trim();
        canCreateRoom = serverRole === "owner" || serverRole === "admin";
      }

      if (!canCreateRoom) {
        return reply.code(403).send({
          error: "forbidden_role",
          message: "Insufficient permissions to create room in this server"
        });
      }

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
        `INSERT INTO rooms (slug, title, kind, category_id, audio_quality_override, position, is_public, created_by, server_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, slug, title, kind, audio_quality_override, category_id, position, is_public, created_at`,
        [slug, title, kind, category_id, audioQualityOverride, position, is_public, createdBy, targetServerId]
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
      audio_quality_override?: "retro" | "low" | "standard" | "high" | null;
    };
  }>(
    "/v1/rooms/:roomId",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser, requireRole(["admin", "super_admin"])]
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
      const actorRole = String(request.currentUser?.role || "user").trim();
      const hasAudioQualityOverride = Object.prototype.hasOwnProperty.call(parsed.data, "audio_quality_override");

      if (hasAudioQualityOverride && actorRole !== "super_admin") {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Only super_admin can update room audio quality override"
        });
      }

      const audioQualityOverride = hasAudioQualityOverride
        ? (parsed.data.audio_quality_override ?? null)
        : undefined;

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
             category_id = $4,
             audio_quality_override = CASE WHEN $5::boolean THEN $6::text ELSE audio_quality_override END
         WHERE id = $1
         RETURNING id, slug, title, kind, audio_quality_override, category_id, position, is_public, created_at`,
        [roomId, title.trim(), kind, category_id, hasAudioQualityOverride, audioQualityOverride]
      );

      if ((updated.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      const room = updated.rows[0];
      if (hasAudioQualityOverride) {
        broadcastRealtimeEnvelope({
          type: "audio.quality.updated",
          payload: {
            scope: "room",
            roomId: room.id,
            roomSlug: room.slug,
            audioQualityOverride: room.audio_quality_override ?? null,
            updatedAt: new Date().toISOString(),
            updatedByUserId: String(request.currentUser?.id || "").trim() || null
          }
        });
      }

      return { room };
    }
  );

  fastify.post<{
    Params: { roomId: string };
    Body: { direction: "up" | "down" };
  }>(
    "/v1/rooms/:roomId/move",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser, requireRole(["admin", "super_admin"])]
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
        `SELECT id, slug, title, kind, audio_quality_override, category_id, position, is_public, created_at
         FROM rooms
         WHERE id = $1 AND is_archived = FALSE`,
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
             AND is_archived = FALSE
             AND position < $2
           ORDER BY position DESC
           LIMIT 1`
        : `SELECT id, position FROM rooms
           WHERE category_id IS NOT DISTINCT FROM $1
             AND is_archived = FALSE
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
        `SELECT id, slug, title, kind, audio_quality_override, category_id, position, is_public, created_at
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
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser, requireRole(["admin", "super_admin"])]
    },
    async (request, reply) => {
      const roomId = String(request.params.roomId || "").trim();
      if (!roomId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "roomId is required"
        });
      }

      const stats = await db.query<{ total_rooms: number; room_exists: boolean; room_slug: string | null }>(
        `SELECT
           (SELECT COUNT(*)::int FROM rooms WHERE is_archived = FALSE) AS total_rooms,
           EXISTS(SELECT 1 FROM rooms WHERE id = $1 AND is_archived = FALSE) AS room_exists,
           (SELECT slug FROM rooms WHERE id = $1 AND is_archived = FALSE LIMIT 1) AS room_slug`,
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

      if ((current?.room_slug || "") === "general") {
        return reply.code(409).send({
          error: "DefaultRoomProtected",
          message: "Cannot delete default general room"
        });
      }

      const archived = await db.query<{ id: string }>(
        `UPDATE rooms
         SET is_archived = TRUE
         WHERE id = $1 AND is_archived = FALSE
         RETURNING id`,
        [roomId]
      );

      if ((archived.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      return { ok: true, roomId, archived: true };
    }
  );

  fastify.post<{
    Params: { roomId: string };
  }>(
    "/v1/rooms/:roomId/restore",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser, requireRole(["admin", "super_admin"])]
    },
    async (request, reply) => {
      const roomId = String(request.params.roomId || "").trim();
      if (!roomId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "roomId is required"
        });
      }

      const restored = await db.query<{ id: string }>(
        `UPDATE rooms
         SET is_archived = FALSE
         WHERE id = $1 AND is_archived = TRUE
         RETURNING id`,
        [roomId]
      );

      if ((restored.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Archived room does not exist"
        });
      }

      return { ok: true, roomId, restored: true };
    }
  );

  fastify.delete<{
    Params: { roomId: string };
  }>(
    "/v1/rooms/:roomId/permanent",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser, requireRole(["admin", "super_admin"])]
    },
    async (request, reply) => {
      const roomId = String(request.params.roomId || "").trim();
      if (!roomId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "roomId is required"
        });
      }

      const state = await db.query<{ is_archived: boolean }>(
        "SELECT is_archived FROM rooms WHERE id = $1 LIMIT 1",
        [roomId]
      );

      if ((state.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      if (!state.rows[0].is_archived) {
        return reply.code(409).send({
          error: "RoomMustBeArchived",
          message: "Room must be archived before permanent delete"
        });
      }

      await db.query("DELETE FROM rooms WHERE id = $1 AND is_archived = TRUE", [roomId]);
      return { ok: true, roomId, deleted: true };
    }
  );

  fastify.delete<{
    Params: { roomId: string };
  }>(
    "/v1/rooms/:roomId/messages",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser, requireRole(["admin", "super_admin"])]
    },
    async (request, reply) => {
      const roomId = String(request.params.roomId || "").trim();
      if (!roomId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "roomId is required"
        });
      }

      const roomResult = await db.query<{ id: string; slug: string }>(
        "SELECT id, slug FROM rooms WHERE id = $1 AND is_archived = FALSE",
        [roomId]
      );

      const room = roomResult.rows[0];
      if (!room) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      const deleted = await db.query<{ deleted_count: number }>(
        `WITH deleted AS (
           DELETE FROM messages
           WHERE room_id = $1
           RETURNING 1
         )
         SELECT COUNT(*)::int AS deleted_count FROM deleted`,
        [roomId]
      );

      const deletedCount = deleted.rows[0]?.deleted_count || 0;

      // Notify connected clients so active room views are cleared in realtime.
      broadcastRealtimeEnvelope({
        type: "chat.cleared",
        payload: {
          roomId,
          roomSlug: room.slug,
          deletedCount,
          clearedAt: new Date().toISOString()
        }
      });

      return {
        ok: true,
        roomId,
        deletedCount
      };
    }
  );

  fastify.get<{
    Params: { slug: string };
    Querystring: { limit?: string | number; beforeCreatedAt?: string; beforeId?: string };
  }>(
    "/v1/rooms/:slug/messages",
    {
      preHandler: [requireAuth, requireServiceAccess]
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
        "SELECT id, slug, title, kind, audio_quality_override, category_id, server_id, nsfw, position, is_public FROM rooms WHERE slug = $1 AND is_archived = FALSE",
        [slug]
      );

      if (roomResult.rowCount === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      const room = roomResult.rows[0];

      if (room.nsfw === true) {
        const serverId = String(room.server_id || "").trim();
        const confirmed = serverId ? await isServerAgeConfirmed(serverId, userId) : false;
        if (!confirmed) {
          return reply.code(403).send({
            error: "AgeVerificationRequired",
            message: "Age verification is required for NSFW access",
            serverId,
            roomSlug: room.slug
          });
        }
      }

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
               m.updated_at AS edited_at,
               u.name AS user_name,
               COALESCE((
                 SELECT json_agg(
                   json_build_object(
                     'id', ma.id,
                     'message_id', ma.message_id,
                     'type', ma.type,
                     'storage_key', ma.storage_key,
                     'download_url', ma.download_url,
                     'mime_type', ma.mime_type,
                     'size_bytes', ma.size_bytes,
                     'width', ma.width,
                     'height', ma.height,
                     'checksum', ma.checksum,
                     'created_at', ma.created_at
                   )
                   ORDER BY ma.created_at ASC
                 )
                 FROM message_attachments ma
                 WHERE ma.message_id = m.id
               ), '[]'::json) AS attachments
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
               m.updated_at AS edited_at,
               u.name AS user_name,
               COALESCE((
                 SELECT json_agg(
                   json_build_object(
                     'id', ma.id,
                     'message_id', ma.message_id,
                     'type', ma.type,
                     'storage_key', ma.storage_key,
                     'download_url', ma.download_url,
                     'mime_type', ma.mime_type,
                     'size_bytes', ma.size_bytes,
                     'width', ma.width,
                     'height', ma.height,
                     'checksum', ma.checksum,
                     'created_at', ma.created_at
                   )
                   ORDER BY ma.created_at ASC
                 )
                 FROM message_attachments ma
                 WHERE ma.message_id = m.id
               ), '[]'::json) AS attachments
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

      const messagesForMetrics = response.messages;
      let attachmentsMessages = 0;
      let legacyInlineMessages = 0;
      let plainTextMessages = 0;

      for (const message of messagesForMetrics) {
        const attachments = Array.isArray(message.attachments) ? message.attachments : [];
        if (attachments.length > 0) {
          attachmentsMessages += 1;
          continue;
        }

        const text = String(message.text || "");
        if (text.includes("data:image/")) {
          legacyInlineMessages += 1;
          continue;
        }

        plainTextMessages += 1;
      }

      void incrementReadMetricBy("chat_read_messages_total", messagesForMetrics.length);
      void incrementReadMetricBy("chat_read_messages_with_attachments", attachmentsMessages);
      void incrementReadMetricBy("chat_read_messages_legacy_inline_data_url", legacyInlineMessages);
      void incrementReadMetricBy("chat_read_messages_plain_text", plainTextMessages);

      return response;
    }
  );
}
