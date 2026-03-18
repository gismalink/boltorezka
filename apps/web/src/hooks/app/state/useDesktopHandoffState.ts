import { useMemo } from "react";

export function useDesktopHandoffState(token: string) {
  const showDesktopBrowserCompletion = useMemo(() => {
    if (typeof window === "undefined" || window.boltorezkaDesktop) {
      return false;
    }

    const url = new URL(window.location.href);
    return url.searchParams.get("desktop_handoff_complete") === "1";
  }, [token]);

  const desktopHandoffError = useMemo(() => {
    if (typeof window === "undefined" || window.boltorezkaDesktop) {
      return "";
    }

    const url = new URL(window.location.href);
    return String(url.searchParams.get("desktop_handoff_error") || "").trim();
  }, [token]);

  return {
    showDesktopBrowserCompletion,
    desktopHandoffError
  };
}
