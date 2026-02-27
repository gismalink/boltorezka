import { createClient } from "redis";
import { config } from "./config.js";

export const redis = createClient({
  url: config.redisUrl
});

redis.on("error", (error) => {
  console.error("[redis] error", error.message);
});

export async function connectRedis() {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

export async function redisHealthcheck() {
  const pong = await redis.ping();
  if (pong !== "PONG") {
    throw new Error("Redis ping failed");
  }
}
