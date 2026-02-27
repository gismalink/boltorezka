import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../config.js";

const ssoProviderSchema = z.enum(["google", "yandex"]);

const safeHostSet = new Set(config.allowedReturnHosts);

function resolveSafeReturnUrl(value, request) {
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

async function proxyAuthGetJson(request, path) {
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

async function upsertSsoUser(profile) {
  const normalizedEmail = String(profile?.email || "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail) {
    throw new Error("SSO profile does not contain email");
  }

  const displayName =
    String(profile?.username || "").trim() || normalizedEmail.split("@")[0] || "SSO User";
  const isSuperAdmin = normalizedEmail === config.superAdminEmail;

  const existing = await db.query(
    "SELECT id, email, name, role, created_at FROM users WHERE email = $1",
    [normalizedEmail]
  );

  if (existing.rowCount > 0) {
    const updated = await db.query(
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

  const created = await db.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name, role, created_at`,
    [normalizedEmail, "__sso_only__", displayName, newRole]
  );

  return created.rows[0];
}

export async function authRoutes(fastify) {
  fastify.get("/v1/auth/mode", async () => {
    return {
      mode: config.authMode,
      ssoBaseUrl: config.authSsoBaseUrl
    };
  });

  fastify.get("/v1/auth/sso/start", async (request, reply) => {
    const providerRaw = String(request.query?.provider || "google").toLowerCase();
    const parsedProvider = ssoProviderSchema.safeParse(providerRaw);

    if (!parsedProvider.success) {
      return reply.code(400).send({
        error: "ValidationError",
        message: "provider must be google or yandex"
      });
    }

    const returnUrl = resolveSafeReturnUrl(String(request.query?.returnUrl || "/"), request);
    const redirectUrl = `${config.authSsoBaseUrl}/auth/${parsedProvider.data}?returnUrl=${encodeURIComponent(returnUrl)}`;
    return reply.redirect(redirectUrl, 302);
  });

  fastify.get("/v1/auth/sso/logout", async (request, reply) => {
    const returnUrl = resolveSafeReturnUrl(String(request.query?.returnUrl || "/"), request);
    const redirectUrl = `${config.authSsoBaseUrl}/auth/logout?returnUrl=${encodeURIComponent(returnUrl)}`;
    return reply.redirect(redirectUrl, 302);
  });

  fastify.get("/v1/auth/sso/session", async (request, reply) => {
    try {
      const ssoTokenResult = await proxyAuthGetJson(request, "/auth/get-token");

      if (!ssoTokenResult.ok || !ssoTokenResult.data?.authenticated) {
        return {
          authenticated: false,
          user: null,
          token: null
        };
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

      return {
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
    } catch (error) {
      fastify.log.error(error, "sso session exchange failed");
      return reply.code(503).send({
        authenticated: false,
        error: "SsoUnavailable",
        message: "Central SSO is temporarily unavailable"
      });
    }
  });

  fastify.post("/v1/auth/register", async (_request, reply) => {
    return reply.code(410).send({
      error: "SsoOnly",
      message: "Local registration is disabled. Use SSO login."
    });
  });

  fastify.post("/v1/auth/login", async (_request, reply) => {
    return reply.code(410).send({
      error: "SsoOnly",
      message: "Local login is disabled. Use SSO login."
    });
  });

  fastify.get(
    "/v1/auth/me",
    {
      preHandler: [requireAuth]
    },
    async (request) => {
      const userId = request.user.sub;
      const result = await db.query(
        "SELECT id, email, name, role, created_at FROM users WHERE id = $1",
        [userId]
      );

      if (result.rowCount === 0) {
        return {
          user: null
        };
      }

      return {
        user: result.rows[0]
      };
    }
  );
}
