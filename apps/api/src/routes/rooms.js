import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

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
    async () => {
      const result = await db.query(
        `SELECT id, slug, title, is_public, created_at
         FROM rooms
         ORDER BY created_at ASC`
      );

      return {
        rooms: result.rows
      };
    }
  );

  fastify.post(
    "/v1/rooms",
    {
      preHandler: [requireAuth]
    },
    async (request, reply) => {
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

      const createdBy = request.user.sub;

      const created = await db.query(
        `INSERT INTO rooms (slug, title, is_public, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, slug, title, is_public, created_at`,
        [slug, title, is_public, createdBy]
      );

      const room = created.rows[0];

      await db.query(
        `INSERT INTO room_members (room_id, user_id, role)
         VALUES ($1, $2, 'owner')
         ON CONFLICT (room_id, user_id) DO NOTHING`,
        [room.id, createdBy]
      );

      return reply.code(201).send({ room });
    }
  );
}
