import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { config } from "./config.js";
import { connectRedis, redis } from "./redis.js";
import { db } from "./db.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { roomsRoutes } from "./routes/rooms.js";

const app = Fastify({
  logger: true
});

await app.register(cors, {
  origin: config.corsOrigin,
  credentials: true
});

await app.register(jwt, {
  secret: config.jwtSecret
});

app.decorate("jwtExpiresIn", config.jwtExpiresIn);

await app.register(healthRoutes);
await app.register(authRoutes);
await app.register(roomsRoutes);

const shutdown = async () => {
  app.log.info("Graceful shutdown started");
  await app.close();
  await db.end();
  if (redis.isOpen) {
    await redis.quit();
  }
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await connectRedis();
  await app.listen({
    host: "0.0.0.0",
    port: config.port
  });
  app.log.info(`Boltorezka API listening on port ${config.port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
