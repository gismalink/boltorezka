import { useEffect } from "react";
import { api } from "../../../api";

const VERSION_POLL_INTERVAL_MS = 60000;

export function useBuildVersionSync(clientBuildVersion: string) {
  useEffect(() => {
    if (!clientBuildVersion) {
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
