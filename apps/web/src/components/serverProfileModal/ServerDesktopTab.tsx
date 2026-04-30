/**
 * ServerDesktopTab.tsx — вкладка desktop-обновлений в ServerProfileModal.
 * Показывает статус канала (test/prod), версию, прогресс загрузки и кнопки check/download/apply
 * через `getDesktopUpdateBridge`. Для web-сборки вкладка отключена.
 */
import { useEffect, useMemo, useState } from "react";
import { getDesktopUpdateBridge } from "../../desktopBridge";
import { resolvePublicOrigin } from "../../runtimeOrigin";
import type { DesktopManifest } from "./serverProfileUtils";
import {
  getFallbackDesktopChannel,
  normalizeDesktopChannel,
  pickDesktopArtifact,
  resolveDesktopArtifactHref,
  resolveDesktopChannelFromOrigin
} from "./serverProfileUtils";
import { useServerProfileModalCtx } from "./ServerProfileModalContext";
import { asTrimmedString } from "../../utils/stringUtils";

type ServerDesktopTabProps = {
  open: boolean;
  serverMenuTab: string;
};

export function ServerDesktopTab({ open, serverMenuTab }: ServerDesktopTabProps) {
  const { t } = useServerProfileModalCtx();
  const [desktopManifest, setDesktopManifest] = useState<DesktopManifest | null>(null);
  const [desktopManifestLoading, setDesktopManifestLoading] = useState(false);
  const [desktopManifestError, setDesktopManifestError] = useState("");
  const [desktopBridgeChannel, setDesktopBridgeChannel] = useState<"test" | "prod" | null>(null);
  const [desktopManifestChannel, setDesktopManifestChannel] = useState<"test" | "prod" | null>(null);

  const desktopPublicOrigin = useMemo(() => resolvePublicOrigin(), []);

  const desktopOriginChannel = useMemo<"test" | "prod">(() => {
    if (desktopPublicOrigin) {
      return resolveDesktopChannelFromOrigin(desktopPublicOrigin);
    }

    if (typeof window === "undefined") {
      return "prod";
    }

    const hostname = window.location.hostname.toLowerCase();
    return hostname.startsWith("test.") || hostname.includes(".test.") ? "test" : "prod";
  }, [desktopPublicOrigin]);

  const desktopChannel = useMemo<"test" | "prod">(() => {
    if (desktopOriginChannel === "test") {
      return "test";
    }

    if (desktopBridgeChannel) {
      return desktopBridgeChannel;
    }

    return desktopOriginChannel;
  }, [desktopBridgeChannel, desktopOriginChannel]);

  const effectiveDesktopChannel = desktopManifestChannel || desktopChannel;

  const desktopCards = useMemo(
    () => [
      { id: "windows" as const, label: t("server.desktopPlatformWindows"), iconClass: "bi-windows" },
      { id: "mac" as const, label: t("server.desktopPlatformMac"), iconClass: "bi-apple" },
      { id: "linux" as const, label: t("server.desktopPlatformLinux"), iconClass: "bi-ubuntu" }
    ].map((platform) => {
      const files = Array.isArray(desktopManifest?.files) ? desktopManifest.files : [];
      const artifact = pickDesktopArtifact(files, platform.id);
      const href = resolveDesktopArtifactHref(
        artifact,
        effectiveDesktopChannel,
        asTrimmedString(desktopManifest?.sha),
        desktopPublicOrigin
      );
      return {
        ...platform,
        href,
        fileName: artifact?.name || ""
      };
    }),
    [desktopManifest, desktopPublicOrigin, effectiveDesktopChannel, t]
  );

  useEffect(() => {
    if (!open || serverMenuTab !== "desktop_downloads") {
      return;
    }

    const desktopUpdate = getDesktopUpdateBridge();
    if (!desktopUpdate) {
      return;
    }

    let disposed = false;

    void desktopUpdate.getStatus()
      .then((status) => {
        if (!disposed) {
          setDesktopBridgeChannel(normalizeDesktopChannel(status.channel));
        }
      })
      .catch(() => {
        return;
      });

    return () => {
      disposed = true;
    };
  }, [open, serverMenuTab]);

  useEffect(() => {
    if (!open || serverMenuTab !== "desktop_downloads") {
      return;
    }

    const controller = new AbortController();
    let disposed = false;

    async function fetchDesktopManifestForChannel(channel: "test" | "prod"): Promise<DesktopManifest> {
      const manifestPath = `/desktop/${channel}/latest.json`;
      const manifestUrl = desktopPublicOrigin ? `${desktopPublicOrigin}${manifestPath}` : manifestPath;
      const response = await fetch(manifestUrl, {
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`[${channel}] status ${response.status}`);
      }

      const rawBody = await response.text();
      let payload: DesktopManifest;
      try {
        payload = JSON.parse(rawBody) as DesktopManifest;
      } catch {
        const contentType = String(response.headers.get("content-type") || "").toLowerCase();
        const bodyPreview = rawBody.slice(0, 80).replace(/\s+/g, " ").trim();
        throw new Error(`[${channel}] invalid json (${contentType || "unknown"}): ${bodyPreview || "empty body"}`);
      }

      return payload;
    }

    async function loadDesktopManifest() {
      setDesktopManifestLoading(true);
      setDesktopManifestError("");
      setDesktopManifestChannel(null);

      try {
        const channelsToTry: Array<"test" | "prod"> = [desktopChannel];
        const fallbackChannel = getFallbackDesktopChannel(desktopChannel);
        if (fallbackChannel !== desktopChannel) {
          channelsToTry.push(fallbackChannel);
        }

        if (desktopOriginChannel !== desktopChannel && desktopOriginChannel !== fallbackChannel) {
          channelsToTry.push(desktopOriginChannel);
        }

        const seen = new Set<string>();
        const uniqueChannels = channelsToTry.filter((channel) => {
          if (seen.has(channel)) {
            return false;
          }
          seen.add(channel);
          return true;
        });

        const errors: string[] = [];
        let resolved: { payload: DesktopManifest; channel: "test" | "prod" } | null = null;

        for (const channel of uniqueChannels) {
          try {
            const payload = await fetchDesktopManifestForChannel(channel);
            resolved = { payload, channel };
            break;
          } catch (error) {
            errors.push(error instanceof Error ? error.message : `[${channel}] unknown error`);
          }
        }

        if (!resolved) {
          throw new Error(errors.join(" | "));
        }

        const manifestReportedChannel = normalizeDesktopChannel(String(resolved.payload.channel || ""));

        if (!disposed) {
          setDesktopManifest(resolved.payload);
          setDesktopManifestChannel(manifestReportedChannel || resolved.channel);
        }
      } catch (error) {
        if (disposed || controller.signal.aborted) {
          return;
        }

        setDesktopManifest(null);
        setDesktopManifestError(error instanceof Error ? error.message : "unknown");
      } finally {
        if (!disposed) {
          setDesktopManifestLoading(false);
        }
      }
    }

    void loadDesktopManifest();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [desktopChannel, desktopOriginChannel, desktopPublicOrigin, open, serverMenuTab]);

  return (
    <section className="grid gap-3">
      <h3>{t("server.desktopTitle")}</h3>
      <p className="muted">{t("server.desktopHint")}</p>
      <p className="muted">
        {t("server.desktopChannel")}: {desktopManifest?.channel || effectiveDesktopChannel}
        {desktopManifest?.appVersion ? ` · ${t("server.desktopAppVersion")}: ${desktopManifest.appVersion}` : ""}
        {desktopManifest?.sha ? ` · ${t("server.desktopVersionSha")}: ${desktopManifest.sha.slice(0, 8)}` : ""}
      </p>
      {effectiveDesktopChannel === "test" ? <p className="muted text-xs">{t("server.desktopUnsignedWarning")}</p> : null}
      {desktopManifestLoading ? <p className="muted">{t("server.desktopLoading")}</p> : null}
      {desktopManifestError ? <p className="muted">{t("server.desktopError")}: {desktopManifestError}</p> : null}
      <div className="grid gap-3 desktop:grid-cols-3">
        {desktopCards.map((platform) => (
          <div key={platform.id} className="card compact grid place-items-center gap-2 p-3 text-center">
            <i className={`bi ${platform.iconClass} text-xl`} aria-hidden="true" />
            <div className="text-sm font-semibold">{platform.label}</div>
            {platform.href ? (
              <button
                type="button"
                className="secondary"
                onClick={() => window.open(platform.href!, "_blank", "noopener,noreferrer")}
                title={platform.fileName}
                aria-label={`${t("server.desktopDownload")}: ${platform.fileName}`}
              >
                {t("server.desktopDownload")}
              </button>
            ) : (
              <button
                type="button"
                className="secondary"
                disabled
                title={t("server.desktopSoon")}
                aria-label={`${t("server.desktopDownload")} (${t("server.desktopSoon")})`}
              >
                {t("server.desktopDownload")}
              </button>
            )}
            <div className="muted text-xs">
              {platform.href ? t("server.desktopAvailable") : t("server.desktopUnavailable")}
            </div>
            <div className="muted text-xs break-all">
              {platform.fileName || "-"}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
