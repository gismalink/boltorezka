import { dbHealthcheck } from "../db.js";
import { redisHealthcheck } from "../redis.js";

export async function healthRoutes(fastify) {
  fastify.get("/health", async () => {
    const checks = {
      api: "ok",
      db: "ok",
      redis: "ok"
    };

    try {
      await dbHealthcheck();
    } catch {
      checks.db = "error";
    }

    try {
      await redisHealthcheck();
    } catch {
      checks.redis = "error";
    }

    const isHealthy = checks.db === "ok" && checks.redis === "ok";

    return {
      status: isHealthy ? "ok" : "degraded",
      checks,
      ts: new Date().toISOString()
    };
  });
}
