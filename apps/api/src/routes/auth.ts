import type { FastifyInstance } from "fastify";
import { createAuthRateLimiters } from "./auth-rate-limiters.js";
import { registerAuthCoreRoutes } from "./auth-core-routes.js";
import { registerAuthDesktopHandoffRoutes } from "./auth-desktop-handoff-routes.js";
import { registerAuthLivekitRoutes } from "./auth-livekit-routes.js";
import { registerAuthProfileRoutes } from "./auth-profile-routes.js";
import { registerAuthSessionRoutes } from "./auth-session-routes.js";
import { registerAuthSsoRoutes } from "./auth-sso-routes.js";

export async function authRoutes(fastify: FastifyInstance) {
  const {
    limitSsoStart,
    limitSsoSession,
    limitRefresh,
    limitLogout,
    limitWsTicket,
    limitDesktopHandoffCreate,
    limitDesktopHandoffExchange,
    limitDesktopHandoffAttemptCreate,
    limitDesktopHandoffAttemptStatus,
    limitDesktopHandoffAttemptComplete,
    limitSsoRestore
  } = createAuthRateLimiters();

  registerAuthCoreRoutes(fastify);

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

  registerAuthSessionRoutes(fastify, {
    limitRefresh,
    limitLogout,
    limitWsTicket
  });

  registerAuthLivekitRoutes(fastify);

  registerAuthProfileRoutes(fastify);
}
