import { useEffect } from "react";
import { api } from "../../../api";

const VERSION_POLL_INTERVAL_MS = 60000;
const VERSION_UPDATE_PENDING_KEY = "boltorezka_update_reload_pending";

export function useBuildVersionSync(clientBuildVersion: string) {
  useEffect(() => {
    if (!clientBuildVersion) {
      return;
    }

    // Desktop app has its own updater/feed and can intentionally run against
    // a server deployed from a different web build. Web auto-reload sync here
    // causes infinite "new version" loops in packaged desktop runtime.
    if (typeof window !== "undefined" && window.boltorezkaDesktop) {
      try {
        sessionStorage.removeItem(VERSION_UPDATE_PENDING_KEY);
      } catch {
        // Ignore storage failures.
      }
      return;
    }

    let cancelled = false;
    let inFlight = false;

    const checkVersion = async () => {
      if (cancelled || inFlight) {
        return;
      }

      inFlight = true;
      try {
        const payload = await api.version();
        const serverBuildVersion = String(payload.appBuildSha || "").trim();
        if (!cancelled && serverBuildVersion && serverBuildVersion !== clientBuildVersion) {
          try {
            sessionStorage.setItem(VERSION_UPDATE_PENDING_KEY, "1");
          } catch {
            // Ignore storage failures and continue with reload.
          }
          window.location.reload();
        }
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
  }, [clientBuildVersion]);
}
