import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { loadCurrentUser, requireAuth, requireRole } from "../middleware/auth.js";

const telemetrySchema = z.object({
  event: z.string().trim().min(1).max(120),
  level: z.string().trim().min(1).max(24).optional(),
  meta: z.record(z.unknown()).optional()
});

function resolveBearerToken(authHeader: unknown): string | null {
  if (!authHeader) {
    return null;
  }

  const raw = String(authHeader).trim();
  if (!raw) {
    return null;
  }

  const match = raw.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    return "__invalid__";
  }

  return match[1].trim() || "__invalid__";
}

export async function telemetryRoutes(fastify: FastifyInstance) {
  fastify.post("/v1/telemetry/web", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = telemetrySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: "ValidationError",
        issues: parsed.error.flatten()
      });
    }

    const token = resolveBearerToken(request.headers.authorization);
    let userId = null;

    if (token === "__invalid__") {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Invalid bearer token"
      });
    }

    if (token) {
      try {
        const payload = await fastify.jwt.verify<{ sub?: string }>(token);
        userId = typeof payload.sub === "string" ? payload.sub : null;
      } catch {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Invalid bearer token"
        });
      }
    }

    const telemetry = {
      event: parsed.data.event,
      level: parsed.data.level || "info",
      meta: parsed.data.meta || {},
      userId,
      ts: new Date().toISOString()
    };

    fastify.log.info({ telemetry }, "web telemetry event");

    try {
      const day = new Date().toISOString().slice(0, 10);
      await fastify.redis.hIncrBy(`ws:metrics:${day}`, "telemetry_web_event", 1);
    } catch {
      return { ok: true };
    }

    return { ok: true };
  });

  fastify.get(
    "/v1/telemetry/summary",
    {
      preHandler: [requireAuth, loadCurrentUser, requireRole(["admin", "super_admin"])]
    },
    async () => {
      const day = new Date().toISOString().slice(0, 10);
      const values = await fastify.redis.hGetAll(`ws:metrics:${day}`);

      const toNumber = (value: unknown): number => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
      };

      return {
        day,
        metrics: {
          nack_sent: toNumber(values.nack_sent),
          ack_sent: toNumber(values.ack_sent),
          chat_sent: toNumber(values.chat_sent),
          chat_idempotency_hit: toNumber(values.chat_idempotency_hit),
          telemetry_web_event: toNumber(values.telemetry_web_event)
        }
      };
    }
  );
}
