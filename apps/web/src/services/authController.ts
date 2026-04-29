/**
 * authController.ts — фасад для аутентификации/SSO/desktop-handoff.
 *
 * Назначение:
 * - Инкапсулирует все вызовы auth API (логин/логаут/refresh/удалённые аккаунты).
 * - Реализует SSO redirect через `state`-параметр (без `?token=` в URL — см. AGENTS.md).
 * - Готовит deep-link для desktop handoff (`buildDesktopHandoffDeepLink`).
 * - Шлёт телеметрию ключевых auth-событий через `trackClientEvent`.
 *
 * Используется хуком `useAuthSession` и провайдером `AuthContext`.
 */
import { api } from "../api";
import { ApiError } from "../api";
import { trackClientEvent } from "../telemetry";
import type { User } from "../domain";
import { resolveDesktopSsoReturnUrl, resolveSsoLogoutUrl, resolveSsoStartUrl } from "../transportRuntime";
import { clearPersistedBearerToken } from "../utils/authStorage";

type DeletedAccountInfo = {
  daysRemaining: number;
  purgeScheduledAt: string | null;
};

function resolveCurrentReturnUrl() {
  if (typeof window === "undefined") {
    return "/";
  }

  return window.location.href;
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
  setDeletedAccountInfo?: (value: DeletedAccountInfo | null) => void;
};

export class AuthController {
  private readonly options: AuthControllerOptions;

  constructor(options: AuthControllerOptions) {
    this.options = options;
  }

  beginSso(provider: "google" | "yandex") {
    const returnUrl = resolveDesktopSsoReturnUrl(resolveCurrentReturnUrl());
    const ssoUrl = resolveSsoStartUrl(provider, returnUrl);
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
      this.options.setDeletedAccountInfo?.(null);
      this.options.pushLog("sso session established");
      trackClientEvent("auth.sso.complete.success", { userId: res.user?.id || null }, res.token);
    } catch (error) {
      if (error instanceof ApiError && error.code === "AccountDeleted") {
        const daysRemaining = Math.max(0, Number(error.payload.daysRemaining ?? 30) || 30);
        const purgeScheduledAt = typeof error.payload.purgeScheduledAt === "string"
          ? error.payload.purgeScheduledAt
          : null;
        this.options.setDeletedAccountInfo?.({ daysRemaining, purgeScheduledAt });
      }
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
    this.options.setDeletedAccountInfo?.(null);
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
    clearPersistedBearerToken();
    this.options.setToken("");
    this.options.setUser(null);

      if (typeof window !== "undefined" && window.boltorezkaDesktop) {
        this.options.pushLog("desktop local logout complete");
        return;
      }

    const returnUrl = resolveCurrentReturnUrl();
    window.location.href = resolveSsoLogoutUrl(returnUrl);
  }
}