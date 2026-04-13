import { randomUUID } from "node:crypto";
import type { UserCompactRow } from "../db.types.ts";
import { normalizeBoundedString } from "../validators.js";

type RedisLike = {
  setEx: (key: string, ttlSec: number, value: string) => Promise<unknown>;
};

export async function issueWsTicket(redis: RedisLike, user: UserCompactRow, serverId: string | null = null) {
  const ticket = randomUUID();
  const expiresInSec = 45;

  await redis.setEx(
    `ws:ticket:${ticket}`,
    expiresInSec,
    JSON.stringify({
      userId: user.id,
      userName: user.name || user.email || "unknown",
      email: user.email,
      role: user.role || "user",
      serverId: normalizeBoundedString(serverId, 128),
      issuedAt: new Date().toISOString()
    })
  );

  return {
    ticket,
    expiresInSec
  };
}