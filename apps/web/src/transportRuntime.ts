import { resolvePublicOrigin } from "./runtimeOrigin";
import { asTrimmedString } from "./utils/stringUtils";

function normalizeOrigin(value: string): string {
  return asTrimmedString(value).replace(/\/+$/, "");
}

function resolveConfiguredPublicOrigin(): string {
  return normalizeOrigin(resolvePublicOrigin());
}

export type TransportRuntimeId = "web-dev" | "web-prod" | "desktop-dev" | "desktop-prod";

export type TransportRuntimeSnapshot = {
  runtimeId: TransportRuntimeId;
  isDesktopFileRuntime: boolean;
  publicOrigin: string;
  apiBase: string;
  wsBase: string;
  preferSecureTransport: boolean;
};

function isDesktopFileRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(window.datowaveDesktop) && window.location.protocol === "file:";
}

function resolveWindowWsBase(): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}`;
}

function resolveWindowApiBase(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return `${window.location.protocol}//${window.location.host}`;
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

function resolveRuntimeId(isDesktopRuntime: boolean, preferSecureTransport: boolean): TransportRuntimeId {
  if (isDesktopRuntime) {
    return preferSecureTransport ? "desktop-prod" : "desktop-dev";
  }

  return preferSecureTransport ? "web-prod" : "web-dev";
}

export function resolveTransportRuntimeSnapshot(): TransportRuntimeSnapshot {
  const configuredPublicOrigin = resolveConfiguredPublicOrigin();
  const preferredSecure = shouldPreferSecureTransport();
  const desktopFileRuntime = isDesktopFileRuntime();
  const wsFromPublicOrigin = toWebSocketOrigin(configuredPublicOrigin);
  const wsBase = wsFromPublicOrigin || resolveWindowWsBase();
  const apiBase = configuredPublicOrigin || resolveWindowApiBase();

  return {
    runtimeId: resolveRuntimeId(desktopFileRuntime, preferredSecure),
    isDesktopFileRuntime: desktopFileRuntime,
    publicOrigin: configuredPublicOrigin,
    apiBase,
    wsBase,
    preferSecureTransport: preferredSecure
  };
}

export function resolveRealtimeWsBase(): string {
  return resolveTransportRuntimeSnapshot().wsBase;
}

export function resolveApiBase(): string {
  return resolveTransportRuntimeSnapshot().apiBase;
}

export function normalizeLivekitSignalUrl(rawUrl: string): string {
  const value = asTrimmedString(rawUrl);
  if (!value) {
    return value;
  }

  const snapshot = resolveTransportRuntimeSnapshot();

  try {
    const parsed = new URL(value);
    if (snapshot.preferSecureTransport && parsed.protocol === "ws:") {
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

export function resolveSsoLogoutUrl(returnUrl: string): string {
  const logoutPath = `/v1/auth/sso/logout?returnUrl=${encodeURIComponent(returnUrl)}`;
  const configuredOrigin = resolveConfiguredPublicOrigin();
  return configuredOrigin ? `${configuredOrigin}${logoutPath}` : logoutPath;
}