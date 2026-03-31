import type { FastifyRequest } from "fastify";
import { config } from "../config.js";

export function resolveLivekitClientUrl(request: FastifyRequest): string {
  const raw = String(config.livekitUrl || "").trim();
  if (!raw) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    const forwardedProto = String(request.headers["x-forwarded-proto"] || "").trim().toLowerCase();
    const forwardedHostRaw = String(request.headers["x-forwarded-host"] || "").trim();
    const requestHostRaw = String(request.headers.host || "").trim();
    const sourceHost = (forwardedHostRaw || requestHostRaw).split(",")[0]?.trim() || "";
    const normalizedHost = sourceHost.includes(":") ? sourceHost.split(":")[0] : sourceHost;
    const requestProto = forwardedProto || String((request as { protocol?: string }).protocol || "").trim().toLowerCase();
    const isHttps = requestProto === "https";
    const isIpHost = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(parsed.hostname);
    const isLegacyLivekitHost = parsed.hostname === "test.boltorezka.gismalink.art"
      || parsed.hostname === "boltorezka.gismalink.art";

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