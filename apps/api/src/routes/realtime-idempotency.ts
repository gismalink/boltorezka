type RedisSetClient = {
  set: (...args: any[]) => Promise<unknown>;
};

export function buildCallIdempotencyKey(userId: string, eventType: string, requestId: string): string {
  return `ws:idempotency:call:${userId}:${eventType}:${requestId}`;
}

export async function isDuplicateCallSignal(
  redis: RedisSetClient,
  userId: string,
  eventType: string,
  requestId: string,
  ttlSeconds = 120
): Promise<boolean> {
  const idempotencyKey = buildCallIdempotencyKey(userId, eventType, requestId);
  const setResult = await redis.set(idempotencyKey, "1", {
    NX: true,
    EX: ttlSeconds
  });

  return !Boolean(setResult);
}