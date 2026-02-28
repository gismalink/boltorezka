import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../config.js";
import type { UserCompactRow, UserRow } from "../db.types.ts";
import type { AuthModeResponse, MeResponse, SsoSessionResponse, WsTicketResponse } from "../api-contract.types.ts";

const ssoProviderSchema = z.enum(["google", "yandex"]);
const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(80)
});

const safeHostSet = new Set(config.allowedReturnHosts);

function resolveSafeReturnUrl(value: unknown, request: FastifyRequest): string {
  if (!value || typeof value !== "string") {
    return "/";
  }

  if (value.startsWith("/")) {
    return value;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const requestHost = String(request.headers.host || "")
      .split(":")[0]
      .toLowerCase();

    if (host === requestHost || safeHostSet.has(host)) {
      return parsed.toString();
    }
  } catch {
    return "/";
  }

  return "/";
}

async function proxyAuthGetJson(request: FastifyRequest, path: string) {
  const url = `${config.authSsoBaseUrl}${path}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      cookie: request.headers.cookie || "",
      accept: "application/json",
      "user-agent": String(request.headers["user-agent"] || "")
    },
    redirect: "manual"
  });

  const contentType = response.headers.get("content-type") || "";
  const bodyText = await response.text();

  if (contentType.includes("application/json")) {
    try {
      return {
        ok: response.ok,
        status: response.status,
        data: JSON.parse(bodyText)
      };
    } catch {
      return {
        ok: false,
        status: response.status,
        data: { error: "InvalidJsonFromSso" }
      };
    }
  }

  return {
    ok: false,
    status: response.status,
    data: { error: bodyText || "UnexpectedSsoResponse" }
  };
}

async function upsertSsoUser(profile: Record<string, unknown> | null | undefined) {
  const normalizedEmail = String(profile?.email || "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail) {
    throw new Error("SSO profile does not contain email");
  }

  const displayName =
    String(profile?.username || "").trim() || normalizedEmail.split("@")[0] || "SSO User";
  const isSuperAdmin = normalizedEmail === config.superAdminEmail;

  const existing = await db.query<UserRow>(
    "SELECT id, email, name, role, created_at FROM users WHERE email = $1",
    [normalizedEmail]
  );

  if ((existing.rowCount || 0) > 0) {
    const updated = await db.query<UserRow>(
      `UPDATE users
       SET
         name = $2,
         role = CASE WHEN $3 THEN 'super_admin' ELSE role END
       WHERE email = $1
       RETURNING id, email, name, role, created_at`,
      [normalizedEmail, displayName, isSuperAdmin]
    );

    return updated.rows[0];
  }

  const newRole = isSuperAdmin ? "super_admin" : "user";

  const created = await db.query<UserRow>(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name, role, created_at`,
    [normalizedEmail, "__sso_only__", displayName, newRole]
  );

  return created.rows[0];
}

export async function authRoutes(fastify: FastifyInstance) {
  fastify.get("/v1/auth/mode", async () => {
    const response: AuthModeResponse = {
      mode: config.authMode,
      ssoBaseUrl: config.authSsoBaseUrl
    };
    return response;
  });

  fastify.get(
    "/v1/auth/sso/start",
    async (
      request: FastifyRequest<{ Querystring: { provider?: string; returnUrl?: string } }>,
      reply: FastifyReply
    ) => {
      const providerRaw = String(request.query.provider || "google").toLowerCase();
    const parsedProvider = ssoProviderSchema.safeParse(providerRaw);

    if (!parsedProvider.success) {
      return reply.code(400).send({
        error: "ValidationError",
        message: "provider must be google or yandex"
      });
    }

      const returnUrl = resolveSafeReturnUrl(String(request.query.returnUrl || "/"), request);
    const redirectUrl = `${config.authSsoBaseUrl}/auth/${parsedProvider.data}?returnUrl=${encodeURIComponent(returnUrl)}`;
    return reply.redirect(redirectUrl, 302);
    }
  );

  fastify.get(
    "/v1/auth/sso/logout",
    async (request: FastifyRequest<{ Querystring: { returnUrl?: string } }>, reply: FastifyReply) => {
      const returnUrl = resolveSafeReturnUrl(String(request.query.returnUrl || "/"), request);
    const redirectUrl = `${config.authSsoBaseUrl}/auth/logout?returnUrl=${encodeURIComponent(returnUrl)}`;
    return reply.redirect(redirectUrl, 302);
    }
  );

  fastify.get("/v1/auth/sso/session", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const ssoTokenResult = await proxyAuthGetJson(request, "/auth/get-token");

      if (!ssoTokenResult.ok || !ssoTokenResult.data?.authenticated) {
        const response: SsoSessionResponse = {
          authenticated: false,
          user: null,
          token: null
        };
        return response;
      }

      const currentUserResult = await proxyAuthGetJson(request, "/auth/current-user");
      const ssoUser = currentUserResult.data?.user || {
        email: ssoTokenResult.data?.email,
        username: ssoTokenResult.data?.username
      };

      const localUser = await upsertSsoUser(ssoUser);

      const token = await reply.jwtSign(
        {
          sub: localUser.id,
          email: localUser.email,
          name: localUser.name,
          role: localUser.role,
          authMode: "sso"
        },
        {
          expiresIn: fastify.jwtExpiresIn
        }
      );

      const response: SsoSessionResponse = {
        authenticated: true,
        user: localUser,
        token,
        sso: {
          id: ssoUser.id || null,
          email: ssoUser.email || null,
          username: ssoUser.username || null,
          role: localUser.role || ssoUser.role || ssoTokenResult.data?.role || "user"
        }
      };
      return response;
    } catch (error) {
      fastify.log.error(error, "sso session exchange failed");
      return reply.code(503).send({
        authenticated: false,
        error: "SsoUnavailable",
        message: "Central SSO is temporarily unavailable"
      });
    }
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

  fastify.get(
    "/v1/auth/ws-ticket",
    {
      preHandler: [requireAuth]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = String(request.user?.sub || "").trim();
      if (!userId) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Valid bearer token is required"
        });
      }

      const userResult = await db.query<UserCompactRow>(
        "SELECT id, email, name, role FROM users WHERE id = $1",
        [userId]
      );

      if (userResult.rowCount === 0) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "User does not exist"
        });
      }

      const user = userResult.rows[0];
      const ticket = randomUUID();
      const expiresInSec = 45;

      await fastify.redis.setEx(
        `ws:ticket:${ticket}`,
        expiresInSec,
        JSON.stringify({
          userId: user.id,
          userName: user.name || user.email || "unknown",
          email: user.email,
          role: user.role || "user",
          issuedAt: new Date().toISOString()
        })
      );

      const response: WsTicketResponse = {
        ticket,
        expiresInSec
      };
      return response;
    }
  );

  fastify.get(
    "/v1/auth/me",
    {
      preHandler: [requireAuth]
    },
    async (request: FastifyRequest) => {
      const userId = String(request.user?.sub || "").trim();
      const result = await db.query<UserRow>(
        "SELECT id, email, name, role, created_at FROM users WHERE id = $1",
        [userId]
      );

      if (result.rowCount === 0) {
        const response: MeResponse = {
          user: null
        };
        return response;
      }

      const response: MeResponse = { user: result.rows[0] };
      return response;
    }
  );

  fastify.patch(
    "/v1/auth/me",
    {
      preHandler: [requireAuth]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = updateProfileSchema.safeParse(request.body || {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "name is required"
        });
      }

      const userId = String(request.user?.sub || "").trim();
      if (!userId) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Valid bearer token is required"
        });
      }

      const updated = await db.query<UserRow>(
        `UPDATE users
         SET name = $2
         WHERE id = $1
         RETURNING id, email, name, role, created_at`,
        [userId, parsed.data.name]
      );

      if (updated.rowCount === 0) {
        const response: MeResponse = { user: null };
        return response;
      }

      const response: MeResponse = { user: updated.rows[0] };
      return response;
    }
  );
}
