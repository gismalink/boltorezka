import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { authRoutes } from "./auth.js";

test("auth.sso/session returns 503 SsoUnavailable when upstream SSO request times out", async () => {
  const app = Fastify({ logger: false });
  const redisMock: any = {
    incr: async () => 1,
    expire: async () => true,
    setEx: async () => "OK",
    del: async () => 1,
    get: async () => null,
    hSet: async () => 1,
    hGetAll: async () => ({}),
    hIncrBy: async () => 1
  };

  app.decorate("jwtExpiresIn", "12h");
  app.decorate("redis", redisMock);

  await app.register(authRoutes);

  const originalFetch = globalThis.fetch;
  (globalThis as any).fetch = async () => {
    const error = new Error("upstream timeout");
    (error as Error & { name: string }).name = "AbortError";
    throw error;
  };

  try {
    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/sso/session"
    });

    assert.equal(response.statusCode, 503);

    const payload = response.json();
    assert.equal(payload.authenticated, false);
    assert.equal(payload.error, "SsoUnavailable");
    assert.equal(payload.message, "Central SSO is temporarily unavailable");
  } finally {
    (globalThis as any).fetch = originalFetch;
    await app.close();
  }
});
