import type { FastifyReply, FastifyRequest } from "fastify";

const RATE_LIMIT_PREFIX = "api:rl:";

type RateLimitPolicy = {
  namespace: string;
  max: number;
  windowSec: number;
  message?: string;
};

function resolveRateLimitSubject(request: FastifyRequest): string {
  const currentUserId = String(request.currentUser?.id || request.user?.sub || "").trim();
  if (currentUserId) {
    return `u:${currentUserId}`;
  }

  const ip = String(request.ip || request.headers["x-forwarded-for"] || "unknown")
    .split(",")[0]
    .trim();

  return `ip:${ip || "unknown"}`;
}

export function makeRateLimiter(policy: RateLimitPolicy) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const nowWindow = Math.floor(Date.now() / 1000 / policy.windowSec);
    const key = `${RATE_LIMIT_PREFIX}${policy.namespace}:${resolveRateLimitSubject(request)}:${nowWindow}`;

    const current = await request.server.redis.incr(key);
    if (current === 1) {
      await request.server.redis.expire(key, policy.windowSec);
    }

    if (current > policy.max) {
      reply.header("Retry-After", String(policy.windowSec));
      return reply.code(429).send({
        error: "RateLimitExceeded",
        message: policy.message || `Too many requests for ${policy.namespace}`
      });
    }

    return undefined;
  };
}
