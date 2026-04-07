import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { broadcastRealtimeEnvelope } from "../realtime-broadcast.js";
import { loadCurrentUser, requireAuth, requireRole, requireServiceAccess } from "../middleware/auth.js";
import { resolveActiveServerMute } from "../services/server-mute-service.js";
import type { RoomCategoryRow, RoomListRow, RoomMessageRow, RoomRow } from "../db.types.ts";
import { isServerAgeConfirmed } from "../services/age-verification-service.js";
import { resolveEffectiveServerPermissions } from "../services/server-permissions-service.js";
import { buildChatMessageEnvelope } from "../ws-protocol.js";
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
  is_hidden: z.boolean().default(false),
  server_id: z.string().uuid().optional(),
  category_id: z.string().uuid().nullable().optional().default(null),
  nsfw: z.boolean().optional().default(false),
  is_readonly: z.boolean().optional().default(false),
  slowmode_seconds: z.number().int().min(0).max(3600).optional().default(0),
  audio_quality_override: audioQualitySchema.nullable().optional(),
  position: z.number().int().min(0).optional()
});

const updateRoomSchema = z.object({
  title: z.string().min(3).max(120),
  kind: roomKindSchema,
  category_id: z.string().uuid().nullable(),
  is_hidden: z.boolean().optional(),
  nsfw: z.boolean().optional(),
  is_readonly: z.boolean().optional(),
  slowmode_seconds: z.number().int().min(0).max(3600).optional(),
  audio_quality_override: audioQualitySchema.nullable().optional()
});

const roomVisibilityGrantSchema = z.object({
  user_id: z.string().uuid()
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
  server_id: z.string().uuid().optional(),
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

async function ensureUniqueCategorySlug(baseSlug: string, serverId: string): Promise<string> {
  const normalizedBase = baseSlug || "category";
  let candidate = normalizedBase;

  for (let i = 0; i < 100; i += 1) {
    const result = await db.query<{ id: string }>(
      "SELECT id FROM room_categories WHERE server_id = $1 AND slug = $2 LIMIT 1",
      [serverId, candidate]
    );
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

const createRoomMessageSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  mentionUserIds: z.array(z.string().uuid()).max(100).optional()
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
       JOIN servers s ON s.id = sm.server_id
       WHERE sm.server_id = $1
         AND s.is_archived = FALSE
         AND s.is_blocked = FALSE
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

  const canManageServerRooms = async (userId: string, serverId: string, globalRole: string): Promise<boolean> => {
    const resolved = await resolveEffectiveServerPermissions({
      serverId,
      userId,
      globalRole: (globalRole as "user" | "admin" | "super_admin") || "user"
    });

    return resolved.permissions.manageRooms;
  };

  fastify.get<{ Querystring: { serverId?: string } }>(
    "/v1/rooms/tree",
    {
      preHandler: [requireAuth, requireServiceAccess]
    },
    async (request) => {
      const userId = String(request.user?.sub || "").trim();
      const requestedServerId = String(request.query.serverId || "").trim();
      let activeServerId = requestedServerId
        ? await resolveAccessibleServerId(userId, requestedServerId)
        : null;

      if (!requestedServerId) {
        const defaultServer = await db.query<{ id: string }>(
          `SELECT id
           FROM servers
           WHERE is_default = TRUE
               AND is_blocked = FALSE
           ORDER BY created_at ASC
           LIMIT 1`
        );

        activeServerId = String(defaultServer.rows[0]?.id || "").trim() || null;
      }

      if (requestedServerId && !activeServerId) {
        const response: RoomsTreeResponse = {
          categories: [],
          uncategorized: []
        };
        return response;
      }

      const categoriesResult = activeServerId
        ? await db.query<RoomCategoryRow>(
            `SELECT id, slug, title, position, created_at
             FROM room_categories
             WHERE server_id = $1
             ORDER BY position ASC, created_at ASC`,
            [activeServerId]
          )
        : { rows: [], rowCount: 0 };

      const roomFilters = [
        "r.is_archived = FALSE",
        `(r.is_hidden = FALSE OR EXISTS (
          SELECT 1
          FROM room_visibility_grants rvg
          WHERE rvg.room_id = r.id
            AND rvg.user_id = $1
        ))`
      ];
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
           r.nsfw,
           r.audio_quality_override,
           r.is_readonly,
           r.slowmode_seconds,
           r.category_id,
           r.position,
           r.is_public,
           r.is_hidden,
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

      const roomFilters = [
        "r.is_archived = FALSE",
        `(r.is_hidden = FALSE OR EXISTS (
          SELECT 1
          FROM room_visibility_grants rvg
          WHERE rvg.room_id = r.id
            AND rvg.user_id = $1
        ))`
      ];
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
           r.nsfw,
           r.audio_quality_override,
           r.is_readonly,
           r.slowmode_seconds,
           r.category_id,
           r.position,
           r.is_public,
           r.is_hidden,
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

      const roomFilters = [
        "r.is_archived = TRUE",
        `(r.is_hidden = FALSE OR EXISTS (
          SELECT 1
          FROM room_visibility_grants rvg
          WHERE rvg.room_id = r.id
            AND rvg.user_id = $1
        ))`
      ];
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
           r.nsfw,
           r.audio_quality_override,
           r.is_readonly,
           r.slowmode_seconds,
           r.category_id,
           r.position,
           r.is_public,
           r.is_hidden,
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

  fastify.post<{ Body: { slug?: string; title: string; server_id?: string; position?: number } }>(
    "/v1/room-categories",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
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
               AND is_blocked = FALSE
           ORDER BY created_at ASC
           LIMIT 1`
        );

        targetServerId = String(defaultServerResult.rows[0]?.id || "").trim();
      }

      if (!targetServerId) {
        return reply.code(500).send({
          error: "ServerNotConfigured",
          message: "Default server is not configured"
        });
      }

      const globalRole = String(request.currentUser?.role || "user").trim();
      const allowed = await canManageServerRooms(createdBy, targetServerId, globalRole);
      if (!allowed) {
        return reply.code(403).send({
          error: "forbidden_role",
          message: "Insufficient permissions to manage categories in this server"
        });
      }

      const requestedSlug = String(parsed.data.slug || "").trim();
      const slug = await ensureUniqueCategorySlug(requestedSlug || toSlug(title) || "category", targetServerId);

      const position = typeof parsed.data.position === "number"
        ? parsed.data.position
        : Number(
            (
              await db.query<{ next_position: number }>(
                "SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM room_categories WHERE server_id = $1",
                [targetServerId]
              )
            ).rows[0]?.next_position || 0
          );

      const created = await db.query<RoomCategoryRow>(
        `INSERT INTO room_categories (slug, title, position, created_by, server_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, slug, title, position, created_at`,
        [slug, title, position, createdBy, targetServerId]
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
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
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

      const actorId = String(request.user?.sub || "").trim();
      const globalRole = String(request.currentUser?.role || "user").trim();
      const existing = await db.query<{ id: string; server_id: string }>(
        `SELECT id, server_id
         FROM room_categories
         WHERE id = $1
         LIMIT 1`,
        [categoryId]
      );

      if ((existing.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "CategoryNotFound",
          message: "Category does not exist"
        });
      }

      const categoryServerId = String(existing.rows[0]?.server_id || "").trim();
      const allowed = await canManageServerRooms(actorId, categoryServerId, globalRole);
      if (!allowed) {
        return reply.code(403).send({
          error: "forbidden_role",
          message: "Insufficient permissions to manage categories in this server"
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
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
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

      const actorId = String(request.user?.sub || "").trim();
      const globalRole = String(request.currentUser?.role || "user").trim();

      const currentResult = await db.query<RoomCategoryRow & { server_id: string }>(
        `SELECT id, slug, title, position, created_at, server_id
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
      const allowed = await canManageServerRooms(actorId, String(current.server_id || "").trim(), globalRole);
      if (!allowed) {
        return reply.code(403).send({
          error: "forbidden_role",
          message: "Insufficient permissions to manage categories in this server"
        });
      }

      const direction = parsed.data.direction;
      const neighborQuery = direction === "up"
        ? `SELECT id, position FROM room_categories
           WHERE server_id = $2
             AND position < $1
           ORDER BY position DESC
           LIMIT 1`
        : `SELECT id, position FROM room_categories
           WHERE server_id = $2
             AND position > $1
           ORDER BY position ASC
           LIMIT 1`;

      const neighborResult = await db.query<{ id: string; position: number }>(neighborQuery, [current.position, current.server_id]);

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
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const categoryId = String(request.params.categoryId || "").trim();
      if (!categoryId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "categoryId is required"
        });
      }

      const actorId = String(request.user?.sub || "").trim();
      const globalRole = String(request.currentUser?.role || "user").trim();

      const categoryRef = await db.query<{ id: string; server_id: string }>(
        `SELECT id, server_id
         FROM room_categories
         WHERE id = $1
         LIMIT 1`,
        [categoryId]
      );

      if ((categoryRef.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "CategoryNotFound",
          message: "Category does not exist"
        });
      }

      const categoryServerId = String(categoryRef.rows[0]?.server_id || "").trim();
      const allowed = await canManageServerRooms(actorId, categoryServerId, globalRole);
      if (!allowed) {
        return reply.code(403).send({
          error: "forbidden_role",
          message: "Insufficient permissions to manage categories in this server"
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
      is_hidden?: boolean;
      is_readonly?: boolean;
      slowmode_seconds?: number;
      kind?: "text" | "text_voice" | "text_voice_video";
      server_id?: string;
      category_id?: string | null;
      nsfw?: boolean;
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

      const { title, is_public, is_hidden, is_readonly, slowmode_seconds, kind, category_id, nsfw } = parsed.data;
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
               AND is_blocked = FALSE
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
      const canCreateRoom = await canManageServerRooms(createdBy, targetServerId, globalRole);

      if (!canCreateRoom) {
        return reply.code(403).send({
          error: "forbidden_role",
          message: "Insufficient permissions to create room in this server"
        });
      }

      if (category_id) {
        const category = await db.query<{ id: string }>(
          "SELECT id FROM room_categories WHERE id = $1 AND server_id = $2",
          [category_id, targetServerId]
        );
        if ((category.rowCount || 0) === 0) {
          return reply.code(400).send({
            error: "ValidationError",
            message: "category_id does not exist in selected server"
          });
        }
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
        `INSERT INTO rooms (slug, title, kind, category_id, nsfw, audio_quality_override, is_readonly, slowmode_seconds, position, is_public, is_hidden, created_by, server_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id, slug, title, kind, nsfw, audio_quality_override, is_readonly, slowmode_seconds, category_id, position, is_public, is_hidden, created_at`,
        [
          slug,
          title,
          kind,
          category_id,
          nsfw,
          audioQualityOverride,
          is_readonly,
          slowmode_seconds,
          position,
          is_public,
          is_hidden,
          createdBy,
          targetServerId
        ]
      );

      const room = created.rows[0];

      await db.query(
        `INSERT INTO room_members (room_id, user_id, role)
         VALUES ($1, $2, 'owner')
         ON CONFLICT (room_id, user_id) DO NOTHING`,
        [room.id, createdBy]
      );

      if (room.is_hidden) {
        await db.query(
          `INSERT INTO room_visibility_grants (room_id, user_id, granted_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (room_id, user_id) DO NOTHING`,
          [room.id, createdBy, createdBy]
        );
      }

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
      is_hidden?: boolean;
      is_readonly?: boolean;
      slowmode_seconds?: number;
      nsfw?: boolean;
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

      const { title, kind, category_id, nsfw } = parsed.data;
      const hasIsHidden = Object.prototype.hasOwnProperty.call(parsed.data, "is_hidden");
      const actorRole = String(request.currentUser?.role || "user").trim();
      const hasNsfw = Object.prototype.hasOwnProperty.call(parsed.data, "nsfw");
      const hasIsReadonly = Object.prototype.hasOwnProperty.call(parsed.data, "is_readonly");
      const hasSlowmodeSeconds = Object.prototype.hasOwnProperty.call(parsed.data, "slowmode_seconds");
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

      const targetRoom = await db.query<{ id: string; server_id: string }>(
        `SELECT id, server_id
         FROM rooms
         WHERE id = $1
         LIMIT 1`,
        [roomId]
      );

      if ((targetRoom.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      const targetServerId = String(targetRoom.rows[0]?.server_id || "").trim();

      if (category_id) {
        const category = await db.query<{ id: string }>(
          "SELECT id FROM room_categories WHERE id = $1 AND server_id = $2",
          [category_id, targetServerId]
        );
        if ((category.rowCount || 0) === 0) {
          return reply.code(400).send({
            error: "ValidationError",
            message: "category_id does not exist in room server"
          });
        }
      }

      const updated = await db.query<RoomRow>(
        `UPDATE rooms
         SET title = $2,
             kind = $3,
             category_id = $4,
             nsfw = CASE WHEN $5::boolean THEN $6::boolean ELSE nsfw END,
             audio_quality_override = CASE WHEN $7::boolean THEN $8::text ELSE audio_quality_override END,
             is_hidden = CASE WHEN $9::boolean THEN $10::boolean ELSE is_hidden END,
             is_readonly = CASE WHEN $11::boolean THEN $12::boolean ELSE is_readonly END,
             slowmode_seconds = CASE WHEN $13::boolean THEN $14::integer ELSE slowmode_seconds END
         WHERE id = $1
         RETURNING id, slug, title, kind, nsfw, audio_quality_override, is_readonly, slowmode_seconds, category_id, position, is_public, is_hidden, created_at`,
        [
          roomId,
          title.trim(),
          kind,
          category_id,
          hasNsfw,
          Boolean(nsfw),
          hasAudioQualityOverride,
          audioQualityOverride,
          hasIsHidden,
          Boolean(parsed.data.is_hidden),
          hasIsReadonly,
          Boolean(parsed.data.is_readonly),
          hasSlowmodeSeconds,
          Number(parsed.data.slowmode_seconds || 0)
        ]
      );

      if ((updated.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      const room = updated.rows[0];
      if (room.is_hidden) {
        const actorId = String(request.user?.sub || "").trim();
        await db.query(
          `INSERT INTO room_visibility_grants (room_id, user_id, granted_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (room_id, user_id) DO NOTHING`,
          [room.id, actorId, actorId]
        );
      }

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
        `SELECT id, slug, title, kind, nsfw, audio_quality_override, is_readonly, slowmode_seconds, category_id, position, is_public, is_hidden, created_at
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
        `SELECT id, slug, title, kind, nsfw, audio_quality_override, is_readonly, slowmode_seconds, category_id, position, is_public, is_hidden, created_at
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
        `SELECT r.id, r.slug, r.title, r.kind, r.audio_quality_override, r.is_readonly, r.slowmode_seconds, r.category_id, r.server_id, r.nsfw, r.position, r.is_public, r.is_hidden
         FROM rooms r
         LEFT JOIN servers s ON s.id = r.server_id
         WHERE r.slug = $1
           AND r.is_archived = FALSE
           AND (r.server_id IS NULL OR (s.is_archived = FALSE AND s.is_blocked = FALSE))`,
        [slug]
      );

      if (roomResult.rowCount === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      const room = roomResult.rows[0];

      if (room.is_hidden) {
        const visibilityGrant = await db.query(
          `SELECT 1
           WHERE EXISTS (
             SELECT 1
             FROM room_visibility_grants
             WHERE room_id = $1 AND user_id = $2
           )
           OR EXISTS (
             SELECT 1
             FROM room_members
             WHERE room_id = $1 AND user_id = $2
           )
           LIMIT 1`,
          [room.id, userId]
        );

        if ((visibilityGrant.rowCount || 0) === 0) {
          return reply.code(403).send({
            error: "Forbidden",
            message: "You cannot access this room"
          });
        }
      }

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

  fastify.post<{
    Params: { slug: string };
    Body: unknown;
  }>(
    "/v1/rooms/:slug/messages",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const userId = String(request.currentUser?.id || request.user?.sub || "").trim();
      const userName = String(request.currentUser?.name || "").trim() || "Unknown";
      const slug = String(request.params.slug || "").trim();

      if (!slug) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "room slug is required"
        });
      }

      const parsedBody = createRoomMessageSchema.safeParse(request.body || {});
      if (!parsedBody.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsedBody.error.flatten()
        });
      }

      const roomResult = await db.query<RoomRow>(
        `SELECT r.id, r.slug, r.title, r.kind, r.audio_quality_override, r.is_readonly, r.slowmode_seconds, r.category_id, r.server_id, r.nsfw, r.position, r.is_public, r.is_hidden
         FROM rooms r
         LEFT JOIN servers s ON s.id = r.server_id
         WHERE r.slug = $1
           AND r.is_archived = FALSE
           AND (r.server_id IS NULL OR (s.is_archived = FALSE AND s.is_blocked = FALSE))
         LIMIT 1`,
        [slug]
      );

      if ((roomResult.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      const room = roomResult.rows[0];

      if (room.is_hidden) {
        const visibilityGrant = await db.query(
          `SELECT 1
           WHERE EXISTS (
             SELECT 1
             FROM room_visibility_grants
             WHERE room_id = $1 AND user_id = $2
           )
           OR EXISTS (
             SELECT 1
             FROM room_members
             WHERE room_id = $1 AND user_id = $2
           )
           LIMIT 1`,
          [room.id, userId]
        );

        if ((visibilityGrant.rowCount || 0) === 0) {
          return reply.code(403).send({
            error: "Forbidden",
            message: "You cannot access this room"
          });
        }
      }

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
          "SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2 LIMIT 1",
          [room.id, userId]
        );

        if ((membership.rowCount || 0) === 0) {
          return reply.code(403).send({
            error: "Forbidden",
            message: "You cannot access this room"
          });
        }
      }

      if (room.server_id) {
        const muteState = await resolveActiveServerMute(room.server_id, userId);
        if (muteState.isMuted) {
          return reply.code(403).send({
            error: "ServerMemberMuted",
            message: "You are muted in this server",
            mutedUntil: muteState.expiresAt,
            retryAfterSec: muteState.retryAfterSec
          });
        }
      }

      if (room.is_readonly) {
        return reply.code(403).send({
          error: "RoomReadOnly",
          message: "Room is read-only"
        });
      }

      const slowmodeSeconds = Number(room.slowmode_seconds || 0);
      if (slowmodeSeconds > 0) {
        const slowmodeKey = `room:slowmode:${room.id}:${userId}`;
        const cooldownRaw = await fastify.redis.get(slowmodeKey);
        if (cooldownRaw) {
          const retryAfterSec = Math.max(1, Number.parseInt(cooldownRaw, 10) || slowmodeSeconds);
          return reply.code(429).send({
            error: "SlowmodeActive",
            message: "Slowmode is active",
            retryAfterSec
          });
        }

        await fastify.redis.setEx(slowmodeKey, slowmodeSeconds, String(slowmodeSeconds));
      }

      const inserted = await db.query<{
        id: string;
        room_id: string;
        user_id: string;
        body: string;
        created_at: string;
      }>(
        `INSERT INTO messages (room_id, user_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, room_id, user_id, body, created_at`,
        [room.id, userId, parsedBody.data.text]
      );

      const message = inserted.rows[0];
      const wsPayload = {
        id: message.id,
        roomId: message.room_id,
        roomSlug: room.slug,
        userId: message.user_id,
        userName,
        text: message.body,
        createdAt: message.created_at,
        senderRequestId: null,
        attachments: []
      };

      broadcastRealtimeEnvelope(buildChatMessageEnvelope(wsPayload));

      return reply.code(201).send({
        message: {
          id: message.id,
          room_id: message.room_id,
          user_id: message.user_id,
          text: message.body,
          created_at: message.created_at,
          edited_at: null,
          user_name: userName,
          attachments: []
        }
      });
    }
  );

  fastify.get<{
    Params: { roomId: string };
  }>(
    "/v1/rooms/:roomId/visibility-grants",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const roomId = String(request.params.roomId || "").trim();
      const actorId = String(request.user?.sub || "").trim();
      const globalRole = String(request.currentUser?.role || "user").trim();

      if (!roomId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "roomId is required"
        });
      }

      const roomResult = await db.query<{ id: string; server_id: string }>(
        "SELECT id, server_id FROM rooms WHERE id = $1 LIMIT 1",
        [roomId]
      );

      if ((roomResult.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      const allowed = await canManageServerRooms(actorId, String(roomResult.rows[0]?.server_id || "").trim(), globalRole);
      if (!allowed) {
        return reply.code(403).send({
          error: "forbidden_role",
          message: "Insufficient permissions to manage room visibility"
        });
      }

      const grants = await db.query<{ user_id: string; name: string; email: string; created_at: string }>(
        `SELECT rvg.user_id, u.name, u.email, rvg.created_at
         FROM room_visibility_grants rvg
         JOIN users u ON u.id = rvg.user_id
         WHERE rvg.room_id = $1
         ORDER BY u.name ASC`,
        [roomId]
      );

      return { grants: grants.rows };
    }
  );

  fastify.post<{
    Params: { roomId: string };
    Body: { user_id: string };
  }>(
    "/v1/rooms/:roomId/visibility-grants",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const roomId = String(request.params.roomId || "").trim();
      const actorId = String(request.user?.sub || "").trim();
      const globalRole = String(request.currentUser?.role || "user").trim();
      const parsed = roomVisibilityGrantSchema.safeParse(request.body || {});

      if (!roomId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "roomId is required"
        });
      }

      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const targetUserId = String(parsed.data.user_id || "").trim();
      const roomResult = await db.query<{ id: string; server_id: string; is_hidden: boolean }>(
        "SELECT id, server_id, is_hidden FROM rooms WHERE id = $1 LIMIT 1",
        [roomId]
      );

      if ((roomResult.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      const room = roomResult.rows[0];
      const allowed = await canManageServerRooms(actorId, String(room.server_id || "").trim(), globalRole);
      if (!allowed) {
        return reply.code(403).send({
          error: "forbidden_role",
          message: "Insufficient permissions to manage room visibility"
        });
      }

      await db.query(
        `INSERT INTO room_visibility_grants (room_id, user_id, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (room_id, user_id) DO UPDATE SET granted_by = EXCLUDED.granted_by`,
        [room.id, targetUserId, actorId]
      );

      if (room.is_hidden) {
        await db.query(
          `INSERT INTO room_members (room_id, user_id, role)
           VALUES ($1, $2, 'member')
           ON CONFLICT (room_id, user_id) DO NOTHING`,
          [room.id, targetUserId]
        );
      }

      return { ok: true, roomId: room.id, userId: targetUserId };
    }
  );

  fastify.delete<{
    Params: { roomId: string; userId: string };
  }>(
    "/v1/rooms/:roomId/visibility-grants/:userId",
    {
      preHandler: [requireAuth, requireServiceAccess, loadCurrentUser]
    },
    async (request, reply) => {
      const roomId = String(request.params.roomId || "").trim();
      const targetUserId = String(request.params.userId || "").trim();
      const actorId = String(request.user?.sub || "").trim();
      const globalRole = String(request.currentUser?.role || "user").trim();

      if (!roomId || !targetUserId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "roomId and userId are required"
        });
      }

      const roomResult = await db.query<{ id: string; server_id: string }>(
        "SELECT id, server_id FROM rooms WHERE id = $1 LIMIT 1",
        [roomId]
      );

      if ((roomResult.rowCount || 0) === 0) {
        return reply.code(404).send({
          error: "RoomNotFound",
          message: "Room does not exist"
        });
      }

      const room = roomResult.rows[0];
      const allowed = await canManageServerRooms(actorId, String(room.server_id || "").trim(), globalRole);
      if (!allowed) {
        return reply.code(403).send({
          error: "forbidden_role",
          message: "Insufficient permissions to manage room visibility"
        });
      }

      await db.query(
        `DELETE FROM room_visibility_grants
         WHERE room_id = $1 AND user_id = $2`,
        [room.id, targetUserId]
      );

      await db.query(
        `DELETE FROM room_members
         WHERE room_id = $1
           AND user_id = $2
           AND role = 'member'
           AND NOT EXISTS (
             SELECT 1
             FROM room_visibility_grants
             WHERE room_id = $1
               AND user_id = $2
           )`,
        [room.id, targetUserId]
      );

      return { ok: true, roomId: room.id, userId: targetUserId };
    }
  );
}
