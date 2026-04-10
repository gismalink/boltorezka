import { useEffect } from "react";
import { api } from "../../../api";
import {
  VERSION_UPDATE_EXPECTED_SHA_KEY,
  VERSION_UPDATE_PENDING_KEY
} from "../../../constants/appConfig";
import { REALTIME_SERVER_READY_EVENT } from "../../../constants/realtimeEvents";

const VERSION_POLL_INTERVAL_MS = 10 * 60_000;

function hasPendingReloadFlag(): boolean {
  try {
    return sessionStorage.getItem(VERSION_UPDATE_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

function markPendingReloadFlag(expectedBuildSha: string): void {
  try {
    sessionStorage.setItem(VERSION_UPDATE_PENDING_KEY, "1");
    sessionStorage.setItem(VERSION_UPDATE_EXPECTED_SHA_KEY, expectedBuildSha);
  } catch {
    // Ignore storage failures and continue with reload.
  }
}

function clearPendingReloadFlag(): void {
  try {
    sessionStorage.removeItem(VERSION_UPDATE_PENDING_KEY);
    sessionStorage.removeItem(VERSION_UPDATE_EXPECTED_SHA_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function applyBuildVersionSync(serverBuildVersionRaw: string, clientBuildShaRaw: string): void {
  const serverBuildVersion = String(serverBuildVersionRaw || "").trim();
  const clientBuildSha = String(clientBuildShaRaw || "").trim();
  if (!serverBuildVersion || !clientBuildSha) {
    return;
  }

  if (serverBuildVersion !== clientBuildSha) {
    if (hasPendingReloadFlag()) {
      return;
    }

    markPendingReloadFlag(serverBuildVersion);
    window.location.reload();
    return;
  }

  clearPendingReloadFlag();
}

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
      clearPendingReloadFlag();
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
        if (!cancelled) {
          applyBuildVersionSync(String(payload.appBuildSha || ""), clientBuildSha);
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

    const onRealtimeServerReady = (event: Event) => {
      if (cancelled) {
        return;
      }

      const customEvent = event as CustomEvent<{ appBuildSha?: string }>;
      applyBuildVersionSync(String(customEvent.detail?.appBuildSha || ""), clientBuildSha);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener(REALTIME_SERVER_READY_EVENT, onRealtimeServerReady as EventListener);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener(REALTIME_SERVER_READY_EVENT, onRealtimeServerReady as EventListener);
    };
  }, [clientBuildSha]);
}
