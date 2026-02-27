import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(120)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function authRoutes(fastify) {
  fastify.post("/v1/auth/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }

    const { email, password, name } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const existingUser = await db.query("SELECT id FROM users WHERE email = $1", [
      normalizedEmail
    ]);

    if (existingUser.rowCount > 0) {
      return reply.code(409).send({
        error: "Conflict",
        message: "Email already in use"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await db.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, created_at`,
      [normalizedEmail, passwordHash, name]
    );

    const user = result.rows[0];

    const token = await reply.jwtSign(
      {
        sub: user.id,
        email: user.email,
        name: user.name
      },
      {
        expiresIn: fastify.jwtExpiresIn
      }
    );

    return reply.code(201).send({ user, token });
  });

  fastify.post("/v1/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }

    const { email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const result = await db.query(
      "SELECT id, email, name, password_hash, created_at FROM users WHERE email = $1",
      [normalizedEmail]
    );

    const user = result.rows[0];

    if (!user) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Invalid email or password"
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Invalid email or password"
      });
    }

    const token = await reply.jwtSign(
      {
        sub: user.id,
        email: user.email,
        name: user.name
      },
      {
        expiresIn: fastify.jwtExpiresIn
      }
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        created_at: user.created_at
      },
      token
    };
  });

  fastify.get(
    "/v1/auth/me",
    {
      preHandler: [requireAuth]
    },
    async (request) => {
      const userId = request.user.sub;
      const result = await db.query(
        "SELECT id, email, name, created_at FROM users WHERE id = $1",
        [userId]
      );

      if (result.rowCount === 0) {
        return {
          user: null
        };
      }

      return {
        user: result.rows[0]
      };
    }
  );
}
