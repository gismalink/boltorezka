import { useEffect } from "react";
import { api } from "../../../api";
import { VERSION_UPDATE_PENDING_KEY } from "../../../constants/appConfig";

const VERSION_POLL_INTERVAL_MS = 60000;

export function useBuildVersionSync(clientBuildSha: string) {
  useEffect(() => {
    if (!clientBuildSha) {
      return;
    }

    // Desktop app has its own updater/feed and can intentionally run against
    // a server deployed from a different web build. For packaged desktop
    // (file:// renderer) web auto-reload would keep reloading the same bundle.
    // For remote desktop renderer (http/https), regular web version sync is safe.
    const isDesktopRuntime = typeof window !== "undefined" && Boolean(window.boltorezkaDesktop);
    const isLocalDesktopRenderer = isDesktopRuntime && window.location.protocol === "file:";
    if (isLocalDesktopRenderer) {
      try {
        sessionStorage.removeItem(VERSION_UPDATE_PENDING_KEY);
      } catch {
        // Ignore storage failures.
      }
      return;
    }

    let cancelled = false;
    let inFlight = false;

    const hasPendingReloadFlag = () => {
      try {
        return sessionStorage.getItem(VERSION_UPDATE_PENDING_KEY) === "1";
      } catch {
        return false;
      }
    };

    const markPendingReloadFlag = () => {
      try {
        sessionStorage.setItem(VERSION_UPDATE_PENDING_KEY, "1");
      } catch {
        // Ignore storage failures and continue with reload.
      }
    };

    const clearPendingReloadFlag = () => {
      try {
        sessionStorage.removeItem(VERSION_UPDATE_PENDING_KEY);
      } catch {
        // Ignore storage failures.
      }
    };

    const checkVersion = async () => {
      if (cancelled || inFlight) {
        return;
      }

      inFlight = true;
      try {
        const payload = await api.version();
        const serverBuildVersion = String(payload.appBuildSha || "").trim();
        if (!cancelled && serverBuildVersion && serverBuildVersion !== clientBuildSha) {
          // Avoid infinite reload loops if mismatch persists due stale cache/network race.
          if (hasPendingReloadFlag()) {
            return;
          }

          markPendingReloadFlag();
          window.location.reload();
          return;
        }

        clearPendingReloadFlag();
      } catch {
        return;
      } finally {
        inFlight = false;
      }
    };

    void checkVersion();
    const intervalId = window.setInterval(() => {
      void checkVersion();
    }, VERSION_POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkVersion();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [clientBuildSha]);
}
