import { api } from "../api";
import { trackClientEvent } from "../telemetry";
import type { User } from "../domain";

const AUTH_BASE_URL_OVERRIDE = (import.meta.env.VITE_AUTH_BASE_URL ?? "").trim();

function resolveAuthBaseUrl() {
  if (AUTH_BASE_URL_OVERRIDE) {
    return String(AUTH_BASE_URL_OVERRIDE).replace(/\/+$/, "");
  }

  if (typeof window === "undefined") {
    return "https://auth.gismalink.art";
  }

  const host = window.location.hostname.toLowerCase();

  if (host === "localhost" || host === "127.0.0.1") {
    return "http://localhost:3000";
  }

  const isTest = host.startsWith("test.");
  return isTest ? "https://test.auth.gismalink.art" : "https://auth.gismalink.art";
}

type AuthControllerOptions = {
  pushLog: (text: string) => void;
  setToken: (token: string) => void;
  setUser: (user: User | null) => void;
};

export class AuthController {
  private readonly options: AuthControllerOptions;

  constructor(options: AuthControllerOptions) {
    this.options = options;
  }

  beginSso(provider: "google" | "yandex") {
    const authBase = resolveAuthBaseUrl();
    const returnUrl = typeof window === "undefined" ? "/" : window.location.href;
    window.location.href = `${authBase}/auth/${provider}?returnUrl=${encodeURIComponent(returnUrl)}`;
  }

  async completeSso(options: { silent?: boolean } = {}) {
    try {
      const res = await api.ssoSession();
      if (!res.authenticated || !res.token) {
        if (!options.silent) {
          this.options.pushLog("sso not authenticated yet");
        }
        return;
      }

      this.options.setToken(res.token);
      this.options.setUser(res.user);
      this.options.pushLog("sso session established");
      trackClientEvent("auth.sso.complete.success", { userId: res.user?.id || null }, res.token);
    } catch (error) {
      this.options.pushLog(`sso failed: ${(error as Error).message}`);
    }
  }

  logout() {
    localStorage.removeItem("boltorezka_token");
    this.options.setToken("");
    this.options.setUser(null);
    const authBase = resolveAuthBaseUrl();
    const returnUrl = typeof window === "undefined" ? "/" : window.location.href;
    window.location.href = `${authBase}/auth/logout?returnUrl=${encodeURIComponent(returnUrl)}`;
  }
}