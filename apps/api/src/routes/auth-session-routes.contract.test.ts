import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { registerAuthSessionRoutes } from "./auth-session-routes.js";

const noopLimiter = async () => {};

test("auth session routes: unauthorized requests are rejected on public boundaries", async () => {
  const app = Fastify({ logger: false });

  registerAuthSessionRoutes(app, {
    limitRefresh: noopLimiter,
    limitLogout: noopLimiter,
    limitWsTicket: noopLimiter
  });

  const refreshResponse = await app.inject({
    method: "POST",
    url: "/v1/auth/refresh"
  });
  assert.equal(refreshResponse.statusCode, 401);
  assert.equal(refreshResponse.json().error, "Unauthorized");

  const logoutResponse = await app.inject({
    method: "POST",
    url: "/v1/auth/logout"
  });
  assert.equal(logoutResponse.statusCode, 401);
  assert.equal(logoutResponse.json().error, "Unauthorized");

  const wsTicketResponse = await app.inject({
    method: "GET",
    url: "/v1/auth/ws-ticket"
  });
  assert.equal(wsTicketResponse.statusCode, 401);
  assert.equal(wsTicketResponse.json().error, "Unauthorized");

  await app.close();
});
