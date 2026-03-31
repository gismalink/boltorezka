import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import {
  makeAuthRateLimiter
} from "./auth.helpers.js";
import { registerAuthDesktopHandoffRoutes } from "./auth-desktop-handoff-routes.js";
import { registerAuthLivekitRoutes } from "./auth-livekit-routes.js";
import { registerAuthProfileRoutes } from "./auth-profile-routes.js";
import { registerAuthSessionRoutes } from "./auth-session-routes.js";
import { registerAuthSsoRoutes } from "./auth-sso-routes.js";
import type { AuthModeResponse } from "../api-contract.types.ts";

export async function authRoutes(fastify: FastifyInstance) {
  const limitSsoStart = makeAuthRateLimiter({
    namespace: "sso-start",
    max: 30,
    windowSec: 60
  });
  const limitSsoSession = makeAuthRateLimiter({
    namespace: "sso-session",
    max: 20,
    windowSec: 60
  });
  const limitRefresh = makeAuthRateLimiter({
    namespace: "refresh",
    max: 20,
    windowSec: 60
  });
  const limitLogout = makeAuthRateLimiter({
    namespace: "logout",
    max: 20,
    windowSec: 60
  });
  const limitWsTicket = makeAuthRateLimiter({
    namespace: "ws-ticket",
    max: 60,
    windowSec: 60
  });
  const limitDesktopHandoffCreate = makeAuthRateLimiter({
    namespace: "desktop-handoff-create",
    max: 20,
    windowSec: 60
  });
  const limitDesktopHandoffExchange = makeAuthRateLimiter({
    namespace: "desktop-handoff-exchange",
    max: 40,
    windowSec: 60
  });
  const limitDesktopHandoffAttemptCreate = makeAuthRateLimiter({
    namespace: "desktop-handoff-attempt-create",
    max: 20,
    windowSec: 60
  });
  const limitDesktopHandoffAttemptStatus = makeAuthRateLimiter({
    namespace: "desktop-handoff-attempt-status",
    max: 80,
    windowSec: 60
  });
  const limitDesktopHandoffAttemptComplete = makeAuthRateLimiter({
    namespace: "desktop-handoff-attempt-complete",
    max: 40,
    windowSec: 60
  });
  const limitSsoRestore = makeAuthRateLimiter({
    namespace: "sso-restore",
    max: 20,
    windowSec: 60
  });

  fastify.get("/v1/auth/mode", async () => {
    const response: AuthModeResponse = {
      mode: config.authMode,
      ssoBaseUrl: config.authSsoBaseUrl
    };
    return response;
  });

  registerAuthSsoRoutes(fastify, {
    limitSsoStart,
    limitSsoSession,
    limitSsoRestore
  });

  registerAuthDesktopHandoffRoutes(fastify, {
    limitDesktopHandoffCreate,
    limitDesktopHandoffExchange,
    limitDesktopHandoffAttemptCreate,
    limitDesktopHandoffAttemptStatus,
    limitDesktopHandoffAttemptComplete
  });

  fastify.post("/v1/auth/register", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(410).send({
      error: "SsoOnly",
      message: "Local registration is disabled. Use SSO login."
    });
  });

  fastify.post("/v1/auth/login", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(410).send({
      error: "SsoOnly",
      message: "Local login is disabled. Use SSO login."
    });
  });

  registerAuthSessionRoutes(fastify, {
    limitRefresh,
    limitLogout,
    limitWsTicket
  });

  registerAuthLivekitRoutes(fastify);

  registerAuthProfileRoutes(fastify);
}
