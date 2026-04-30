import { useCallback, useEffect, useMemo, useState } from "react";
import { getDesktopUpdateBridge } from "../../../desktopBridge";
import { asTrimmedString } from "../../../utils/stringUtils";

type UseDesktopUpdateFlowArgs = {
  t: (key: string) => string;
  pushToast: (text: string) => void;
};

export function useDesktopUpdateFlow({ t, pushToast }: UseDesktopUpdateFlowArgs) {
  const desktopUpdateBridge = useMemo(() => getDesktopUpdateBridge(), []);
  const [desktopUpdateReadyVersion, setDesktopUpdateReadyVersion] = useState("");
  const [desktopUpdateApplying, setDesktopUpdateApplying] = useState(false);
  const [desktopUpdateBannerDismissed, setDesktopUpdateBannerDismissed] = useState(false);

  useEffect(() => {
    if (!desktopUpdateBridge) {
      return;
    }

    let disposed = false;
    let downloadRequested = false;

    const requestDesktopUpdateDownload = async () => {
      if (disposed || downloadRequested) {
        return;
      }

      downloadRequested = true;
      try {
        const result = await desktopUpdateBridge.downloadUpdate();
        if (!result?.ok && String(result?.reason || "") !== "no-available-update") {
          const reason = asTrimmedString(result?.reason);
          pushToast(reason ? `${t("desktop.updateErrorToast")} (${reason})` : t("desktop.updateErrorToast"));
        }
      } catch {
        pushToast(t("desktop.updateErrorToast"));
      }
    };

    desktopUpdateBridge.getStatus()
      .then((status) => {
        if (disposed) {
          return;
        }

        if (asTrimmedString(status?.downloadedVersion)) {
          setDesktopUpdateReadyVersion(String(status.downloadedVersion).trim());
          setDesktopUpdateBannerDismissed(false);
          return;
        }

        if (asTrimmedString(status?.availableVersion)) {
          void requestDesktopUpdateDownload();
        }
      })
      .catch(() => {
        // Update status is best-effort.
      });

    desktopUpdateBridge.checkForUpdates().catch(() => {
      // Update check is best-effort.
    });

    const unsubscribe = desktopUpdateBridge.onStatus((event) => {
      const eventType = asTrimmedString(event?.event);
      const version = asTrimmedString(event?.version);
      const message = asTrimmedString(event?.message || event?.lastError);

      if (eventType === "available" && version) {
        pushToast(`${t("desktop.updateAvailableToast")} ${version}`);
        void requestDesktopUpdateDownload();
      }

      if (eventType === "downloaded" && version) {
        setDesktopUpdateReadyVersion(version);
        setDesktopUpdateBannerDismissed(false);
        pushToast(`${t("desktop.updateDownloadedToast")} ${version}`);
      }

      if (eventType === "error") {
        pushToast(message ? `${t("desktop.updateErrorToast")} (${message})` : t("desktop.updateErrorToast"));
      }
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [desktopUpdateBridge, pushToast, t]);

  const applyDesktopUpdate = useCallback(async () => {
    if (!desktopUpdateBridge || desktopUpdateApplying) {
      return;
    }

    setDesktopUpdateApplying(true);
    try {
      const result = await desktopUpdateBridge.applyUpdate();
      if (!result?.ok) {
        pushToast(`${t("desktop.updateApplyFailedToast")}: ${String(result?.reason || "unknown")}`);
        setDesktopUpdateApplying(false);
        return;
      }

      pushToast(t("desktop.updateApplyingToast"));
    } catch {
      pushToast(t("desktop.updateApplyFailedToast"));
      setDesktopUpdateApplying(false);
    }
  }, [desktopUpdateApplying, desktopUpdateBridge, pushToast, t]);

  return {
    desktopUpdateReadyVersion,
    desktopUpdateApplying,
    desktopUpdateBannerDismissed,
    dismissDesktopUpdateBanner: () => setDesktopUpdateBannerDismissed(true),
    applyDesktopUpdate
  };
}
