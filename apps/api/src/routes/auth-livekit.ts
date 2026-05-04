import type { FastifyRequest } from "fastify";
import { config } from "../config.js";
import { normalizeBoundedString } from "../validators.js";

export function resolveLivekitClientUrl(request: FastifyRequest): string {
  const raw = normalizeBoundedString(config.livekitUrl, 2048) || "";
  if (!raw) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    const forwardedProto = (normalizeBoundedString(request.headers["x-forwarded-proto"], 16) || "").toLowerCase();
    const forwardedHostRaw = normalizeBoundedString(request.headers["x-forwarded-host"], 255) || "";
    const requestHostRaw = normalizeBoundedString(request.headers.host, 255) || "";
    const sourceHost = (forwardedHostRaw || requestHostRaw).split(",")[0]?.trim() || "";
    const normalizedHost = sourceHost.includes(":") ? sourceHost.split(":")[0] : sourceHost;
    const requestProto = forwardedProto || (normalizeBoundedString((request as { protocol?: string }).protocol, 16) || "").toLowerCase();
    const isHttps = requestProto === "https";
    const isIpHost = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(parsed.hostname);
    const isLegacyLivekitHost = parsed.hostname === "test.datowave.com"
      || parsed.hostname === "datowave.com";

    if (normalizedHost && isLegacyLivekitHost) {
      parsed.hostname = normalizedHost;
      parsed.port = "";
    }

    if (isHttps && isIpHost) {
      if (normalizedHost) {
        parsed.hostname = normalizedHost;
        parsed.port = "";
      }
    }

    if (isHttps && parsed.protocol === "ws:") {
      parsed.protocol = "wss:";
    }

    return parsed.toString();
  } catch {
    return raw;
  }
}