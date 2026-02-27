import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { loadCurrentUser, requireAuth, requireRole } from "../middleware/auth.js";
import type { UserRow } from "../db.types.ts";
import type { AdminUsersResponse, PromoteUserResponse } from "../api-contract.types.ts";

const promoteSchema = z.object({
  role: z.literal("admin").default("admin")
});

export async function adminRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/v1/admin/users",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["super_admin", "admin"])]
    },
    async () => {
      const result = await db.query<UserRow>(
        `SELECT id, email, name, role, created_at
         FROM users
         ORDER BY created_at ASC`
      );

      const response: AdminUsersResponse = { users: result.rows };
      return response;
    }
  );

  fastify.post<{ Params: { userId: string }; Body: { role?: "admin" } }>(
    "/v1/admin/users/:userId/promote",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["super_admin"])]
    },
    async (request, reply) => {
      const parsed = promoteSchema.safeParse(request.body || {});

      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          issues: parsed.error.flatten()
        });
      }

      const userId = String(request.params.userId || "").trim();
      if (!userId) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "userId is required"
        });
      }

      const targetResult = await db.query<UserRow>(
        "SELECT id, email, name, role, created_at FROM users WHERE id = $1",
        [userId]
      );

      if (targetResult.rowCount === 0) {
        return reply.code(404).send({
          error: "UserNotFound",
          message: "Target user does not exist"
        });
      }

      const targetUser = targetResult.rows[0];

      if (targetUser.role === "super_admin") {
        const response: PromoteUserResponse = { user: targetUser };
        return reply.code(200).send(response);
      }

      const updated = await db.query<UserRow>(
        `UPDATE users
         SET role = 'admin'
         WHERE id = $1
         RETURNING id, email, name, role, created_at`,
        [userId]
      );

      const response: PromoteUserResponse = { user: updated.rows[0] };
      return response;
    }
  );
}
