import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { dbHealthcheck } from "../db.js";
import { redisHealthcheck } from "../redis.js";

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get("/version", async () => {
    return {
      status: "ok",
      appVersion: config.appVersion,
      appBuildSha: config.appBuildSha,
      ts: new Date().toISOString()
    };
  });

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
      appVersion: config.appVersion,
      appBuildSha: config.appBuildSha,
      ts: new Date().toISOString()
    };
  });
}
