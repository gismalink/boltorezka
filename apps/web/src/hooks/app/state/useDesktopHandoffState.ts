import { useMemo } from "react";
import { asTrimmedString } from "../../../utils/stringUtils";

export function useDesktopHandoffState(token: string) {
  const showDesktopBrowserCompletion = useMemo(() => {
    if (typeof window === "undefined" || window.datowaveDesktop) {
      return false;
    }

    const url = new URL(window.location.href);
    return url.searchParams.get("desktop_handoff_complete") === "1";
  }, [token]);

  const desktopHandoffError = useMemo(() => {
    if (typeof window === "undefined" || window.datowaveDesktop) {
      return "";
    }

    const url = new URL(window.location.href);
    return asTrimmedString(url.searchParams.get("desktop_handoff_error"));
  }, [token]);

  return {
    showDesktopBrowserCompletion,
    desktopHandoffError
  };
}
