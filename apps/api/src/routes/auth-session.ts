import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { UserRow } from "../db.types.ts";

const AUTH_SESSION_PREFIX = "auth:session:";
const AUTH_SESSION_TTL_SEC = 60 * 60 * 24 * 30;

function buildAuthSessionRedisKey(sessionId: string): string {
  return `${AUTH_SESSION_PREFIX}${sessionId}`;
}

export async function issueAuthSessionToken(
  fastify: FastifyInstance,
  user: UserRow,
  authMode: "sso" = "sso",
  previousSessionId: string | null = null
) {
  const sessionId = randomUUID();

  await fastify.redis.setEx(
    buildAuthSessionRedisKey(sessionId),
    AUTH_SESSION_TTL_SEC,
    JSON.stringify({
      userId: user.id,
      authMode,
      issuedAt: new Date().toISOString(),
      rotatedFrom: previousSessionId || null
    })
  );

  if (previousSessionId && previousSessionId !== sessionId) {
    await fastify.redis.del(buildAuthSessionRedisKey(previousSessionId));
  }

  const token = await fastify.jwt.sign(
    {
      sub: user.id,
      sid: sessionId,
      email: user.email,
      name: user.name,
      role: user.role,
      authMode
    },
    {
      expiresIn: fastify.jwtExpiresIn
    }
  );

  return { token, sessionId };
}

export async function deleteAuthSession(fastify: FastifyInstance, sessionId: string) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) {
    return;
  }

  await fastify.redis.del(buildAuthSessionRedisKey(normalizedSessionId));
}