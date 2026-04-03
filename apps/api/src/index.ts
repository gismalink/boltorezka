import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { connectRedis, redis } from "./redis.js";
import { db } from "./db.js";
import { runMigrations } from "./migrations.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { serversRoutes } from "./routes/servers.js";
import { invitesRoutes } from "./routes/invites.js";
import { roomsRoutes } from "./routes/rooms.js";
import { roomTopicsRoutes } from "./routes/room-topics.js";
import { searchRoutes } from "./routes/search.js";
import { realtimeRoutes } from "./routes/realtime.js";
import { telemetryRoutes } from "./routes/telemetry.js";
import { memberPreferencesRoutes } from "./routes/member-preferences.js";
import { chatUploadsRoutes } from "./routes/chat-uploads.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({
  logger: true
});

app.addHook("onSend", async (request, reply, payload) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  reply.header("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");

  const contentType = String(reply.getHeader("content-type") || "").toLowerCase();
  const isHtmlResponse = contentType.includes("text/html");
  if (isHtmlResponse) {
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https: wss:; media-src 'self' blob:; worker-src 'self' blob:"
    );
  }

  return payload;
});

await app.register(cors, {
  origin: config.corsOrigin,
  credentials: true
});

await app.register(jwt, {
  secret: config.jwtSecret
});

await app.register(websocket);

const setStaticCacheHeaders = (response: { setHeader: (name: string, value: string) => void }, filePath: string) => {
  const normalizedPath = String(filePath || "").replace(/\\/g, "/");
  const fileName = path.basename(normalizedPath);

  if (fileName === "index.html") {
    response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
    return;
  }

  const isHashedAsset = normalizedPath.includes("/assets/")
    && /-[A-Za-z0-9_-]{8,}\./.test(fileName);

  if (isHashedAsset) {
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return;
  }

  response.setHeader("Cache-Control", "no-cache, max-age=0, must-revalidate");
};

if (config.apiServeStatic) {
  await app.register(fastifyStatic, {
    root: path.join(__dirname, "../public"),
    prefix: "/",
    cacheControl: false,
    setHeaders: setStaticCacheHeaders
  });

  await app.register(fastifyStatic, {
    root: path.join(__dirname, "../public"),
    prefix: "/__web/",
    decorateReply: false,
    cacheControl: false,
    setHeaders: setStaticCacheHeaders
  });

  app.log.info("Static web serving is enabled (API_SERVE_STATIC=1)");
} else {
  app.log.info("Static web serving is disabled (API_SERVE_STATIC=0)");
}

app.decorate("jwtExpiresIn", config.jwtExpiresIn);
app.decorate("redis", redis);

await app.register(healthRoutes);
await app.register(authRoutes);
await app.register(adminRoutes);
await app.register(serversRoutes);
await app.register(invitesRoutes);
await app.register(roomsRoutes);
await app.register(roomTopicsRoutes);
await app.register(searchRoutes);
await app.register(chatUploadsRoutes);
await app.register(realtimeRoutes);
await app.register(telemetryRoutes);
await app.register(memberPreferencesRoutes);

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
  await runMigrations();
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
