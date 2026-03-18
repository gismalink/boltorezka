function normalizeOrigin(value: string): string {
  return String(value || "").trim().replace(/\/+$/, "");
}

function isDesktopFileRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean(window.boltorezkaDesktop) && window.location.protocol === "file:";
}

function resolveFallbackDesktopOrigin(): string {
  const appVersion = String(import.meta.env.VITE_APP_VERSION || "").trim().toLowerCase();
  if (appVersion.includes("-test")) {
    return "https://test.boltorezka.gismalink.art";
  }
  return "https://boltorezka.gismalink.art";
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
