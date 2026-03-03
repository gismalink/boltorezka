import { api } from "../api";
import { trackClientEvent } from "../telemetry";
import type { User } from "../domain";

function resolveCurrentReturnUrl() {
  if (typeof window === "undefined") {
    return "/";
  }

  return window.location.href;
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
    const returnUrl = resolveCurrentReturnUrl();
    window.location.href = `/v1/auth/sso/start?provider=${encodeURIComponent(provider)}&returnUrl=${encodeURIComponent(returnUrl)}`;
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
    const returnUrl = resolveCurrentReturnUrl();
    window.location.href = `/v1/auth/sso/logout?returnUrl=${encodeURIComponent(returnUrl)}`;
  }
}