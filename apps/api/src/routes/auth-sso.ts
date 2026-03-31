import type { FastifyRequest } from "fastify";
import { config } from "../config.js";

const safeHostSet = new Set(config.allowedReturnHosts);

export function resolveSafeReturnUrl(value: unknown, request: FastifyRequest): string {
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

export async function proxyAuthGetJson(request: FastifyRequest, path: string) {
  const url = `${config.authSsoBaseUrl}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, config.authSsoRequestTimeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        cookie: request.headers.cookie || "",
        accept: "application/json",
        "user-agent": String(request.headers["user-agent"] || "")
      },
      redirect: "manual",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

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