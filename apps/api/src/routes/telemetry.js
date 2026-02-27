import { z } from "zod";

const telemetrySchema = z.object({
  event: z.string().trim().min(1).max(120),
  level: z.string().trim().min(1).max(24).optional(),
  meta: z.record(z.unknown()).optional()
});

function resolveBearerToken(authHeader) {
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

export async function telemetryRoutes(fastify) {
  fastify.post("/v1/telemetry/web", async (request, reply) => {
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
        const payload = await fastify.jwt.verify(token);
        userId = typeof payload?.sub === "string" ? payload.sub : null;
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
}
