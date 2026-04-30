import { asTrimmedString } from "./utils/stringUtils";
function normalizeOrigin(value: string): string {
  return asTrimmedString(value).replace(/\/+$/, "");
}

function isDesktopFileRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean(window.boltorezkaDesktop) && window.location.protocol === "file:";
}

function resolveFallbackDesktopOrigin(): string {
  const appVersion = asTrimmedString(import.meta.env.VITE_APP_VERSION).toLowerCase();
  if (appVersion.includes("-test")) {
    return "https://test.datowave.com";
  }
  return "https://datowave.com";
}

export function resolvePublicOrigin(): string {
  const configured = normalizeOrigin(String(import.meta.env.VITE_APP_PUBLIC_ORIGIN || ""));
  if (configured) {
    return configured;
  }

  if (isDesktopFileRuntime()) {
    return resolveFallbackDesktopOrigin();
  }

  return "";
}
