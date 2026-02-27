import { z } from "zod";
import { db } from "../db.js";
import { loadCurrentUser, requireAuth, requireRole } from "../middleware/auth.js";
/** @typedef {import("../db.types.ts").UserRow} UserRow */
/** @typedef {import("../api-contract.types.ts").AdminUsersResponse} AdminUsersResponse */
/** @typedef {import("../api-contract.types.ts").PromoteUserResponse} PromoteUserResponse */

const promoteSchema = z.object({
  role: z.literal("admin").default("admin")
});

export async function adminRoutes(fastify) {
  fastify.get(
    "/v1/admin/users",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["super_admin", "admin"])]
    },
    async () => {
      const result = await db.query(
        `SELECT id, email, name, role, created_at
         FROM users
         ORDER BY created_at ASC`
      );

      return /** @type {AdminUsersResponse} */ ({
        users: /** @type {UserRow[]} */ (result.rows)
      });
    }
  );

  fastify.post(
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

      const targetResult = await db.query(
        "SELECT id, email, name, role, created_at FROM users WHERE id = $1",
        [userId]
      );

      if (targetResult.rowCount === 0) {
        return reply.code(404).send({
          error: "UserNotFound",
          message: "Target user does not exist"
        });
      }

      const targetUser = /** @type {UserRow} */ (targetResult.rows[0]);

      if (targetUser.role === "super_admin") {
        return reply.code(200).send(/** @type {PromoteUserResponse} */ ({ user: targetUser }));
      }

      const updated = await db.query(
        `UPDATE users
         SET role = 'admin'
         WHERE id = $1
         RETURNING id, email, name, role, created_at`,
        [userId]
      );

      return /** @type {PromoteUserResponse} */ ({
        user: /** @type {UserRow} */ (updated.rows[0])
      });
    }
  );
}
