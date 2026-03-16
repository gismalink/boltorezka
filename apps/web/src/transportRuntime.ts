import { resolvePublicOrigin } from "./runtimeOrigin";

function normalizeOrigin(value: string): string {
  return String(value || "").trim().replace(/\/+$/, "");
}

function resolveWindowWsBase(): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}`;
}

function toWebSocketOrigin(httpOrigin: string): string {
  try {
    const parsed = new URL(httpOrigin);
    const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

function shouldPreferSecureTransport(): boolean {
  const configuredOrigin = normalizeOrigin(resolvePublicOrigin());
  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).protocol === "https:";
    } catch {
      return false;
    }
  }

  if (typeof window === "undefined") {
    return false;
  }

  return window.location.protocol === "https:";
}

export function resolveRealtimeWsBase(): string {
  const configuredWsOrigin = toWebSocketOrigin(normalizeOrigin(resolvePublicOrigin()));
  if (configuredWsOrigin) {
    return configuredWsOrigin;
  }

  return resolveWindowWsBase();
}

export function normalizeLivekitSignalUrl(rawUrl: string): string {
  const value = String(rawUrl || "").trim();
  if (!value) {
    return value;
  }

  try {
    const parsed = new URL(value);
    if (shouldPreferSecureTransport() && parsed.protocol === "ws:") {
      parsed.protocol = "wss:";
      if (parsed.port === "7880") {
        parsed.port = "7881";
      }
    }
    return parsed.toString();
  } catch {
    return value;
  }
}