import { api } from "../api";
import { trackClientEvent } from "../telemetry";
import type { User } from "../domain";

const CONFIGURED_PUBLIC_ORIGIN = String(import.meta.env.VITE_APP_PUBLIC_ORIGIN || "").trim().replace(/\/+$/, "");

function resolveCurrentReturnUrl() {
  if (typeof window === "undefined") {
    return "/";
  }

  return window.location.href;
}

function resolveDesktopSsoReturnUrl(defaultReturnUrl: string) {
  if (typeof window === "undefined" || !window.boltorezkaDesktop) {
    return defaultReturnUrl;
  }

  const parsed = new URL(defaultReturnUrl);
  parsed.searchParams.set("desktop_handoff", "1");
  parsed.searchParams.delete("desktop_handoff_bootstrap");
  parsed.searchParams.delete("desktop_handoff_refreshed");
  parsed.searchParams.delete("desktop_handoff_sent");
  return parsed.toString();
}

function buildDesktopHandoffDeepLink(code: string, targetUrl: string, attemptId: string) {
  const host = window.location.hostname || "localhost";
  const target = new URL(targetUrl);
  target.searchParams.set("desktop_sso_code", code);
  target.searchParams.set("desktop_sso_complete", "1");
  target.searchParams.set("desktop_handoff_attempt", attemptId);
  return `boltorezka://${host}/auth/sso-complete?attemptId=${encodeURIComponent(attemptId)}&target=${encodeURIComponent(target.toString())}`;
}

async function waitForDesktopHandoffCompletion(token: string, attemptId: string) {
  const timeoutMs = 60000;
  const pollIntervalMs = 1500;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = await api.desktopHandoffAttemptStatus(token, attemptId);
    if (status.status === "completed") {
      return "completed" as const;
    }
    if (status.status === "expired") {
      return "expired" as const;
    }
    await new Promise((resolve) => {
      window.setTimeout(resolve, pollIntervalMs);
    });
  }

  return "timeout" as const;
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
    const returnUrl = resolveDesktopSsoReturnUrl(resolveCurrentReturnUrl());
    const ssoPath = `/v1/auth/sso/start?provider=${encodeURIComponent(provider)}&returnUrl=${encodeURIComponent(returnUrl)}`;
    const ssoUrl = CONFIGURED_PUBLIC_ORIGIN ? `${CONFIGURED_PUBLIC_ORIGIN}${ssoPath}` : ssoPath;
    window.location.href = ssoUrl;
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

  async startDesktopBrowserHandoff(token: string) {
    const attemptResponse = await api.desktopHandoffAttemptCreate(token);
    if (!attemptResponse.attemptId) {
      throw new Error("desktop handoff attempt id is missing");
    }

    const response = await api.desktopHandoffCreate(token);
    if (!response.code) {
      throw new Error("desktop handoff code is missing");
    }

    const currentUrl = new URL(resolveCurrentReturnUrl());
    currentUrl.searchParams.delete("desktop_handoff");
    currentUrl.searchParams.delete("desktop_handoff_bootstrap");
    currentUrl.searchParams.delete("desktop_handoff_refreshed");
    currentUrl.searchParams.delete("desktop_handoff_sent");
    currentUrl.searchParams.set("desktop_handoff_attempt", attemptResponse.attemptId);
    currentUrl.searchParams.set("desktop_handoff_complete", "1");
    const deepLink = buildDesktopHandoffDeepLink(response.code, currentUrl.toString(), attemptResponse.attemptId);
    window.location.href = deepLink;

    const status = await waitForDesktopHandoffCompletion(token, attemptResponse.attemptId).catch(() => "timeout" as const);
    if (status !== "completed") {
      currentUrl.searchParams.set("desktop_handoff_error", status);
    } else {
      currentUrl.searchParams.delete("desktop_handoff_error");
    }
    window.location.replace(currentUrl.toString());
  }

  async completeDesktopHandoff(code: string, attemptId: string | null = null) {
    const response = await api.desktopHandoffExchange(code);
    if (!response.authenticated || !response.token) {
      throw new Error("desktop handoff is not authenticated");
    }

    if (attemptId) {
      await api.desktopHandoffComplete(response.token, attemptId);
    }

    this.options.setToken(response.token);
    this.options.setUser(response.user);
    this.options.pushLog("desktop handoff session established");
  }

  async logout(token: string) {
    // Revoke the server-side session and clear the HttpOnly cookie BEFORE
    // navigating. This is required in cookie-mode: without it the browser
    // still holds a valid cookie and bootstrapCookieSessionState() will
    // silently re-authenticate the user after the SSO logout redirect.
    try {
      // token may be "" in cookie-mode; fetchJson sends credentials:include
      // so the HttpOnly cookie is always forwarded regardless.
      await api.authLogout(token);
    } catch {
      // Best-effort: proceed with logout even if the API call fails.
    }
    localStorage.removeItem("boltorezka_token");
    this.options.setToken("");
    this.options.setUser(null);

      if (typeof window !== "undefined" && window.boltorezkaDesktop) {
        this.options.pushLog("desktop local logout complete");
        return;
      }

    const returnUrl = resolveCurrentReturnUrl();
    window.location.href = `/v1/auth/sso/logout?returnUrl=${encodeURIComponent(returnUrl)}`;
  }
}