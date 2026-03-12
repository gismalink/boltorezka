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

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
      const metricsKey = `ws:metrics:${day}`;
      await fastify.redis.hIncrBy(metricsKey, "telemetry_web_event", 1);

      if (telemetry.event === "rnnoise_status") {
        const status = asString(telemetry.meta.status);
        const reason = asString(telemetry.meta.reason);

        if (status === "active") {
          await fastify.redis.hIncrBy(metricsKey, "rnnoise_toggle_on", 1);
        }

        if (status === "inactive" && (reason === "profile_not_noise_reduction" || reason === "suppression_none")) {
          await fastify.redis.hIncrBy(metricsKey, "rnnoise_toggle_off", 1);
        }

        if (status === "error") {
          await fastify.redis.hIncrBy(metricsKey, "rnnoise_init_error", 1);
        }

        if (status === "unavailable") {
          await fastify.redis.hIncrBy(metricsKey, "rnnoise_fallback_unavailable", 1);
        }
      }

      if (telemetry.event === "rnnoise_processor_apply_ms") {
        const ms = asNumber(telemetry.meta.ms);
        if (ms !== null && ms >= 0) {
          const micros = Math.round(ms * 1000);
          await fastify.redis.hIncrBy(metricsKey, "rnnoise_process_cost_us_sum", micros);
          await fastify.redis.hIncrBy(metricsKey, "rnnoise_process_cost_samples", 1);
        }
      }
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
          telemetry_web_event: toNumber(values.telemetry_web_event),
          rnnoise_toggle_on: toNumber(values.rnnoise_toggle_on),
          rnnoise_toggle_off: toNumber(values.rnnoise_toggle_off),
          rnnoise_init_error: toNumber(values.rnnoise_init_error),
          rnnoise_fallback_unavailable: toNumber(values.rnnoise_fallback_unavailable),
          rnnoise_process_cost_us_sum: toNumber(values.rnnoise_process_cost_us_sum),
          rnnoise_process_cost_samples: toNumber(values.rnnoise_process_cost_samples),
          call_signal_sent: toNumber(values.call_signal_sent),
          call_offer_received: toNumber(values.call_offer_received),
          call_answer_received: toNumber(values.call_answer_received),
          call_ice_received: toNumber(values.call_ice_received),
          call_reconnect_joined: toNumber(values.call_reconnect_joined),
          call_initial_state_sent: toNumber(values.call_initial_state_sent),
          call_initial_state_participants_total: toNumber(values.call_initial_state_participants_total),
          call_initial_state_lag_ms_total: toNumber(values.call_initial_state_lag_ms_total),
          call_initial_state_lag_samples: toNumber(values.call_initial_state_lag_samples),
          call_offer_rate_limited: toNumber(values.call_offer_rate_limited),
          call_glare_suspected: toNumber(values.call_glare_suspected),
          call_signal_target_miss: toNumber(values.call_signal_target_miss),
          call_hangup_sent: toNumber(values.call_hangup_sent),
          call_reject_sent: toNumber(values.call_reject_sent)
        }
      };
    }
  );
}
