import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import type { UserMemberPreferenceRow } from "../db.types.ts";

const updateMemberPreferenceSchema = z.object({
  volume: z.number().int().min(0).max(100),
  note: z.string().max(32)
});

export async function memberPreferencesRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/v1/member-preferences",
    {
      preHandler: [requireAuth]
    },
    async (request, reply) => {
      const viewerUserId = String(request.user?.sub || "").trim();
      if (!viewerUserId) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Valid bearer token is required"
        });
      }

      const rawTargetIds = String((request.query as { targetUserIds?: string })?.targetUserIds || "").trim();
      const targetUserIds = Array.from(
        new Set(
          rawTargetIds
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
        )
      ).slice(0, 200);

      if (targetUserIds.length === 0) {
        return { preferences: [] };
      }

      const result = await db.query<UserMemberPreferenceRow>(
        `SELECT viewer_user_id, target_user_id, volume, note, updated_at
         FROM user_member_preferences
         WHERE viewer_user_id = $1 AND target_user_id = ANY($2::uuid[])`,
        [viewerUserId, targetUserIds]
      );

      return {
        preferences: result.rows.map((row) => ({
          targetUserId: row.target_user_id,
          volume: row.volume,
          note: row.note,
          updatedAt: row.updated_at
        }))
      };
    }
  );

  fastify.put<{
    Params: { targetUserId: string };
    Body: { volume: number; note: string };
  }>(
    "/v1/member-preferences/:targetUserId",
    {
      preHandler: [requireAuth]
    },
    async (request, reply) => {
      const viewerUserId = String(request.user?.sub || "").trim();
      const targetUserId = String(request.params?.targetUserId || "").trim();

      if (!viewerUserId || !targetUserId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "viewer and target user ids are required"
        });
      }

      const parsed = updateMemberPreferenceSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const payload = {
        volume: parsed.data.volume,
        note: parsed.data.note.trim().slice(0, 32)
      };

      const updated = await db.query<UserMemberPreferenceRow>(
        `INSERT INTO user_member_preferences (viewer_user_id, target_user_id, volume, note, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (viewer_user_id, target_user_id)
         DO UPDATE SET volume = EXCLUDED.volume, note = EXCLUDED.note, updated_at = NOW()
         RETURNING viewer_user_id, target_user_id, volume, note, updated_at`,
        [viewerUserId, targetUserId, payload.volume, payload.note]
      );

      const row = updated.rows[0];
      return {
        preference: {
          targetUserId: row.target_user_id,
          volume: row.volume,
          note: row.note,
          updatedAt: row.updated_at
        }
      };
    }
  );
}
