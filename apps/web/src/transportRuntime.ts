import { resolvePublicOrigin } from "./runtimeOrigin";

function normalizeOrigin(value: string): string {
  return String(value || "").trim().replace(/\/+$/, "");
}

function resolveConfiguredPublicOrigin(): string {
  return normalizeOrigin(resolvePublicOrigin());
}

function isDesktopFileRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(window.boltorezkaDesktop) && window.location.protocol === "file:";
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
  const configuredOrigin = resolveConfiguredPublicOrigin();
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
  const configuredWsOrigin = toWebSocketOrigin(resolveConfiguredPublicOrigin());
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

export function resolveDesktopSsoReturnUrl(defaultReturnUrl: string): string {
  if (!isDesktopFileRuntime()) {
    return defaultReturnUrl;
  }

  const configuredOrigin = resolveConfiguredPublicOrigin();
  const baseUrl = configuredOrigin ? `${configuredOrigin}/` : defaultReturnUrl;
  const parsed = new URL(baseUrl);
  parsed.searchParams.set("desktop_handoff", "1");
  parsed.searchParams.delete("desktop_handoff_bootstrap");
  parsed.searchParams.delete("desktop_handoff_refreshed");
  parsed.searchParams.delete("desktop_handoff_sent");
  return parsed.toString();
}

export function resolveSsoStartUrl(provider: "google" | "yandex", returnUrl: string): string {
  const ssoPath = `/v1/auth/sso/start?provider=${encodeURIComponent(provider)}&returnUrl=${encodeURIComponent(returnUrl)}`;
  const configuredOrigin = resolveConfiguredPublicOrigin();
  return configuredOrigin ? `${configuredOrigin}${ssoPath}` : ssoPath;
}