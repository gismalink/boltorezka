import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { connectRedis, redis } from "./redis.js";
import { db, ensureSchema } from "./db.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { roomsRoutes } from "./routes/rooms.js";
import { realtimeRoutes } from "./routes/realtime.js";
import { telemetryRoutes } from "./routes/telemetry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

await app.register(websocket);

await app.register(fastifyStatic, {
  root: path.join(__dirname, "../public"),
  prefix: "/"
});

app.decorate("jwtExpiresIn", config.jwtExpiresIn);
app.decorate("redis", redis);

await app.register(healthRoutes);
await app.register(authRoutes);
await app.register(adminRoutes);
await app.register(roomsRoutes);
await app.register(realtimeRoutes);
await app.register(telemetryRoutes);

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
  await ensureSchema();
  await connectRedis();
  await app.listen({
    host: "0.0.0.0",
    port: config.port
  });
  app.log.info(`Boltorezka API listening on port ${config.port}`);
} catch (error: unknown) {
  app.log.error(error);
  process.exit(1);
}
