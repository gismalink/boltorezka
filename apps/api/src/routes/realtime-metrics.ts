import type { FastifyInstance } from "fastify";

export function createRealtimeMetrics(fastify: FastifyInstance) {
  const incrementMetric = async (name: string) => {
    try {
      const day = new Date().toISOString().slice(0, 10);
      await fastify.redis.hIncrBy(`ws:metrics:${day}`, name, 1);
    } catch {
      return;
    }
  };

  const incrementMetricBy = async (name: string, value: number) => {
    const delta = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    if (delta <= 0) {
      return;
    }

    try {
      const day = new Date().toISOString().slice(0, 10);
      await fastify.redis.hIncrBy(`ws:metrics:${day}`, name, delta);
    } catch {
      return;
    }
  };

  return {
    incrementMetric,
    incrementMetricBy
  };
}