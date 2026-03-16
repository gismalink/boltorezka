import { useEffect, useMemo, useRef, useState } from "react";
import type { AudioQuality, TelemetrySummary, User } from "../domain";
import type { ServerScreenShareResolution, ServerVideoEffectType } from "../hooks/rtc/voiceCallTypes";
import { RangeSlider } from "./RangeSlider";

type ServerMenuTab = "users" | "events" | "telemetry" | "call" | "sound" | "video" | "chat_images" | "desktop_downloads";

type ServerProfileModalProps = {
  open: boolean;
  t: (key: string) => string;
  canPromote: boolean;
  canViewTelemetry: boolean;
  serverMenuTab: ServerMenuTab;
  adminUsers: User[];
  eventLog: string[];
  telemetrySummary: TelemetrySummary | null;
  callStatus: string;
  lastCallPeer: string;
  roomVoiceConnected: boolean;
  callEventLog: string[];
  serverAudioQuality: AudioQuality;
  serverAudioQualitySaving: boolean;
  canManageAudioQuality: boolean;
  serverChatImagePolicy: {
    maxDataUrlLength: number;
    maxImageSide: number;
    jpegQuality: number;
  };
  serverVideoEffectType: ServerVideoEffectType;
  serverVideoResolution: "160x120" | "320x240" | "640x480";
  serverVideoFps: 10 | 15 | 24 | 30;
  serverScreenShareResolution: ServerScreenShareResolution;
  serverVideoPixelFxStrength: number;
  serverVideoPixelFxPixelSize: number;
  serverVideoPixelFxGridThickness: number;
  serverVideoAsciiCellSize: number;
  serverVideoAsciiContrast: number;
  serverVideoAsciiColor: string;
  serverVideoWindowMinWidth: number;
  serverVideoWindowMaxWidth: number;
  serverVideoPreviewStream: MediaStream | null;
  onClose: () => void;
  onSetServerMenuTab: (value: ServerMenuTab) => void;
  onPromote: (userId: string) => void;
  onDemote: (userId: string) => void;
  onSetBan: (userId: string, banned: boolean) => void;
  onRefreshTelemetry: () => void;
  onSetServerAudioQuality: (value: AudioQuality) => void;
  onSetServerVideoEffectType: (value: ServerVideoEffectType) => void;
  onSetServerVideoResolution: (value: "160x120" | "320x240" | "640x480") => void;
  onSetServerVideoFps: (value: 10 | 15 | 24 | 30) => void;
  onSetServerScreenShareResolution: (value: ServerScreenShareResolution) => void;
  onSetServerVideoPixelFxStrength: (value: number) => void;
  onSetServerVideoPixelFxPixelSize: (value: number) => void;
  onSetServerVideoPixelFxGridThickness: (value: number) => void;
  onSetServerVideoAsciiCellSize: (value: number) => void;
  onSetServerVideoAsciiContrast: (value: number) => void;
  onSetServerVideoAsciiColor: (value: string) => void;
  onSetServerVideoWindowMinWidth: (value: number) => void;
  onSetServerVideoWindowMaxWidth: (value: number) => void;
};

type DesktopManifestFile = {
  name: string;
  relativePath?: string;
  urlPath?: string;
  url?: string;
};

type DesktopManifest = {
  channel?: string;
  sha?: string;
  builtAt?: string;
  files?: DesktopManifestFile[];
};

function pickDesktopArtifact(files: DesktopManifestFile[], platform: "windows" | "mac" | "linux"): DesktopManifestFile | null {
  const withHref = files.filter((item) => {
    const href = String(item.url || item.urlPath || "").trim();
    return href.length > 0;
  });

  const byName = (patterns: RegExp[]): DesktopManifestFile | null => {
    for (const pattern of patterns) {
      const found = withHref.find((item) => pattern.test(item.name));
      if (found) {
        return found;
      }
    }
    return null;
  };

  if (platform === "windows") {
    return byName([/\.exe$/i, /\.msi$/i, /\.nsis(\.7z)?$/i]);
  }

  if (platform === "mac") {
    return byName([/-mac\.zip$/i, /\.dmg$/i, /\.pkg$/i]);
  }

  return byName([/\.AppImage$/i, /\.deb$/i, /\.rpm$/i, /\.tar\.gz$/i, /linux/i]);
}

export function ServerProfileModal({
  open,
  t,
  canPromote,
  canViewTelemetry,
  serverMenuTab,
  adminUsers,
  eventLog,
  telemetrySummary,
  callStatus,
  lastCallPeer,
  roomVoiceConnected,
  callEventLog,
  serverAudioQuality,
  serverAudioQualitySaving,
  canManageAudioQuality,
  serverChatImagePolicy,
  serverVideoEffectType,
  serverVideoResolution,
  serverVideoFps,
  serverScreenShareResolution,
  serverVideoPixelFxStrength,
  serverVideoPixelFxPixelSize,
  serverVideoPixelFxGridThickness,
  serverVideoAsciiCellSize,
  serverVideoAsciiContrast,
  serverVideoAsciiColor,
  serverVideoWindowMinWidth,
  serverVideoWindowMaxWidth,
  serverVideoPreviewStream,
  onClose,
  onSetServerMenuTab,
  onPromote,
  onDemote,
  onSetBan,
  onRefreshTelemetry,
  onSetServerAudioQuality,
  onSetServerVideoEffectType,
  onSetServerVideoResolution,
  onSetServerVideoFps,
  onSetServerScreenShareResolution,
  onSetServerVideoPixelFxStrength,
  onSetServerVideoPixelFxPixelSize,
  onSetServerVideoPixelFxGridThickness,
  onSetServerVideoAsciiCellSize,
  onSetServerVideoAsciiContrast,
  onSetServerVideoAsciiColor,
  onSetServerVideoWindowMinWidth,
  onSetServerVideoWindowMaxWidth
}: ServerProfileModalProps) {
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [desktopManifest, setDesktopManifest] = useState<DesktopManifest | null>(null);
  const [desktopManifestLoading, setDesktopManifestLoading] = useState(false);
  const [desktopManifestError, setDesktopManifestError] = useState("");
  const totalUsers = adminUsers.length;
  const totalAdmins = adminUsers.filter((item) => item.role === "admin" || item.role === "super_admin").length;
  const totalBanned = adminUsers.filter((item) => item.is_banned).length;
  const rnnoiseProcessSamples = telemetrySummary?.metrics.rnnoise_process_cost_samples ?? 0;
  const rnnoiseProcessAvgMs = rnnoiseProcessSamples > 0
    ? (telemetrySummary?.metrics.rnnoise_process_cost_us_sum ?? 0) / rnnoiseProcessSamples / 1000
    : 0;

  const desktopChannel = useMemo<"test" | "prod">(() => {
    if (typeof window === "undefined") {
      return "prod";
    }

    const hostname = window.location.hostname.toLowerCase();
    return hostname.startsWith("test.") || hostname.includes(".test.") ? "test" : "prod";
  }, []);

  const desktopCards = useMemo(
    () => [
      { id: "windows" as const, label: t("server.desktopPlatformWindows"), iconClass: "bi-windows" },
      { id: "mac" as const, label: t("server.desktopPlatformMac"), iconClass: "bi-apple" },
      { id: "linux" as const, label: t("server.desktopPlatformLinux"), iconClass: "bi-ubuntu" }
    ].map((platform) => {
      const files = Array.isArray(desktopManifest?.files) ? desktopManifest.files : [];
      const artifact = pickDesktopArtifact(files, platform.id);
      const href = String(artifact?.url || artifact?.urlPath || "").trim();
      return {
        ...platform,
        href: href.length > 0 ? href : null,
        fileName: artifact?.name || ""
      };
    }),
    [desktopManifest, t]
  );

  useEffect(() => {
    const element = previewVideoRef.current;
    if (!element) {
      return;
    }

    if (!serverVideoPreviewStream) {
      element.srcObject = null;
      return;
    }

    element.srcObject = serverVideoPreviewStream;
    void element.play().catch(() => {
      return;
    });
  }, [serverVideoPreviewStream]);

  useEffect(() => {
    if (!open || serverMenuTab !== "desktop_downloads") {
      return;
    }

    const controller = new AbortController();
    let disposed = false;

    async function loadDesktopManifest() {
      setDesktopManifestLoading(true);
      setDesktopManifestError("");

      try {
        const response = await fetch(`/desktop/${desktopChannel}/latest.json`, {
          cache: "no-store",
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`status ${response.status}`);
        }

        const payload = (await response.json()) as DesktopManifest;
        if (!disposed) {
          setDesktopManifest(payload);
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
  }, [desktopChannel, open, serverMenuTab]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="voice-preferences-overlay fixed inset-0 z-40 grid place-items-center overflow-y-auto p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="card voice-preferences-modal user-settings-modal server-profile-modal grid w-full max-w-[980px] min-w-0 gap-4 max-desktop:h-full max-desktop:max-h-none max-desktop:min-h-0 max-desktop:overflow-hidden max-desktop:p-4 desktop:grid-cols-[250px_1fr]">
        <div className="user-settings-sidebar grid min-w-0 content-start gap-2">
          <div className="voice-preferences-kicker">{t("server.title")}</div>
          {canPromote ? (
            <button
              type="button"
              className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-desktop:min-w-0 max-desktop:justify-center ${serverMenuTab === "users" ? "user-settings-tab-btn-active" : ""}`}
              onClick={() => onSetServerMenuTab("users")}
            >
              {t("server.tabUsers")}
            </button>
          ) : null}
          <button
            type="button"
            className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-desktop:min-w-0 max-desktop:justify-center ${serverMenuTab === "events" ? "user-settings-tab-btn-active" : ""}`}
            onClick={() => onSetServerMenuTab("events")}
          >
            {t("server.tabEvents")}
          </button>
          {canViewTelemetry ? (
            <button
              type="button"
              className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-desktop:min-w-0 max-desktop:justify-center ${serverMenuTab === "telemetry" ? "user-settings-tab-btn-active" : ""}`}
              onClick={() => onSetServerMenuTab("telemetry")}
            >
              {t("server.tabTelemetry")}
            </button>
          ) : null}
          <button
            type="button"
            className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-desktop:min-w-0 max-desktop:justify-center ${serverMenuTab === "call" ? "user-settings-tab-btn-active" : ""}`}
            onClick={() => onSetServerMenuTab("call")}
          >
            {t("server.tabCall")}
          </button>
          {canManageAudioQuality ? (
            <button
              type="button"
              className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-desktop:min-w-0 max-desktop:justify-center ${serverMenuTab === "sound" ? "user-settings-tab-btn-active" : ""}`}
              onClick={() => onSetServerMenuTab("sound")}
            >
              {t("server.tabSound")}
            </button>
          ) : null}
          {canManageAudioQuality ? (
            <button
              type="button"
              className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-desktop:min-w-0 max-desktop:justify-center ${serverMenuTab === "video" ? "user-settings-tab-btn-active" : ""}`}
              onClick={() => onSetServerMenuTab("video")}
            >
              {t("server.tabVideo")}
            </button>
          ) : null}
          <button
            type="button"
            className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-desktop:min-w-0 max-desktop:justify-center ${serverMenuTab === "chat_images" ? "user-settings-tab-btn-active" : ""}`}
            onClick={() => onSetServerMenuTab("chat_images")}
          >
            {t("server.tabChatImages")}
          </button>
          <button
            type="button"
            className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-desktop:min-w-0 max-desktop:justify-center ${serverMenuTab === "desktop_downloads" ? "user-settings-tab-btn-active" : ""}`}
            onClick={() => onSetServerMenuTab("desktop_downloads")}
          >
            {t("server.tabDesktopApp")}
          </button>
        </div>

        <div className="user-settings-content grid min-h-0 min-w-0 content-start gap-4 overflow-auto overflow-x-hidden pr-0">
          <div className="voice-preferences-head flex items-center justify-between gap-3">
            <h2 className="mt-[var(--space-xxs)]">
              {serverMenuTab === "users" ? t("server.tabUsers") : null}
              {serverMenuTab === "events" ? t("server.tabEvents") : null}
              {serverMenuTab === "telemetry" ? t("server.tabTelemetry") : null}
              {serverMenuTab === "call" ? t("server.tabCall") : null}
              {serverMenuTab === "sound" ? t("server.tabSound") : null}
              {serverMenuTab === "video" ? t("server.tabVideo") : null}
              {serverMenuTab === "chat_images" ? t("server.tabChatImages") : null}
              {serverMenuTab === "desktop_downloads" ? t("server.tabDesktopApp") : null}
            </h2>
            <button
              type="button"
              className="secondary icon-btn"
              onClick={onClose}
              aria-label={t("settings.closeVoiceAria")}
            >
              <i className="bi bi-x-lg" aria-hidden="true" />
            </button>
          </div>

          {serverMenuTab === "users" && canPromote ? (
            <section className="grid gap-3">
              <h3>{t("admin.title")}</h3>
              <p className="muted">Users total: {totalUsers} · Admins: {totalAdmins} · Banned: {totalBanned}</p>
              <ul className="admin-list grid gap-2">
                {adminUsers.map((item) => (
                  <li key={item.id} className="admin-row grid min-h-[42px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 max-desktop:grid-cols-1">
                    <span className="min-w-0 break-words">
                      {item.email} ({item.role})
                      {item.is_banned ? ` · ${t("admin.banned")}` : ""}
                    </span>
                    <div className="row-actions flex flex-wrap items-stretch gap-2">
                      {item.role === "user" ? (
                        <button className="min-h-[34px]" onClick={() => onPromote(item.id)}>{t("admin.promote")}</button>
                      ) : null}
                      {item.role === "admin" ? (
                        <button className="secondary min-h-[34px]" onClick={() => onDemote(item.id)}>{t("admin.demote")}</button>
                      ) : null}
                      {item.role !== "super_admin" ? (
                        item.is_banned ? (
                          <button className="secondary min-h-[34px]" onClick={() => onSetBan(item.id, false)}>{t("admin.unban")}</button>
                        ) : (
                          <button className="secondary min-h-[34px]" onClick={() => onSetBan(item.id, true)}>{t("admin.ban")}</button>
                        )
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {serverMenuTab === "events" ? (
            <section className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-3">
              <h3>{t("events.title")}</h3>
              <div className="log h-full max-h-none overflow-auto">
                {eventLog.map((line, index) => (
                  <div key={`${line}-${index}`}>{line}</div>
                ))}
              </div>
            </section>
          ) : null}

          {serverMenuTab === "telemetry" && canViewTelemetry ? (
            <section className="grid gap-3">
              <h3>{t("telemetry.title")}</h3>
              <p className="muted">{t("telemetry.day")}: {telemetrySummary?.day || "-"}</p>
              <div className="grid gap-1">
                <div>ack_sent: {telemetrySummary?.metrics.ack_sent ?? 0}</div>
                <div>nack_sent: {telemetrySummary?.metrics.nack_sent ?? 0}</div>
                <div>chat_sent: {telemetrySummary?.metrics.chat_sent ?? 0}</div>
                <div>chat_idempotency_hit: {telemetrySummary?.metrics.chat_idempotency_hit ?? 0}</div>
                <div>telemetry_web_event: {telemetrySummary?.metrics.telemetry_web_event ?? 0}</div>
                <div>rnnoise_toggle_on: {telemetrySummary?.metrics.rnnoise_toggle_on ?? 0}</div>
                <div>rnnoise_toggle_off: {telemetrySummary?.metrics.rnnoise_toggle_off ?? 0}</div>
                <div>rnnoise_init_error: {telemetrySummary?.metrics.rnnoise_init_error ?? 0}</div>
                <div>rnnoise_fallback_unavailable: {telemetrySummary?.metrics.rnnoise_fallback_unavailable ?? 0}</div>
                <div>rnnoise_process_cost_samples: {rnnoiseProcessSamples}</div>
                <div>rnnoise_process_avg_ms: {rnnoiseProcessAvgMs.toFixed(3)}</div>
              </div>
              <button onClick={onRefreshTelemetry}>{t("telemetry.refresh")}</button>
            </section>
          ) : null}

          {serverMenuTab === "call" ? (
            <section className="signaling-panel grid min-h-0 flex-1 grid-rows-[auto_auto_auto_minmax(0,1fr)] gap-3">
              <h3>{t("call.title")}</h3>
              <p className="muted">{t("call.status")}: {callStatus}{lastCallPeer ? ` (${lastCallPeer})` : ""}</p>
              <p className="muted">
                {roomVoiceConnected ? t("call.autoConnected") : t("call.autoWaiting")}
              </p>
              <div className="log call-log h-full max-h-none overflow-auto">
                {callEventLog.map((line, index) => (
                  <div key={`${line}-${index}`}>{line}</div>
                ))}
              </div>
            </section>
          ) : null}

          {serverMenuTab === "sound" && canManageAudioQuality ? (
            <section className="grid gap-3">
              <h3>{t("server.soundTitle")}</h3>
              <p className="muted">{t("server.soundHint")}</p>
              <div className="grid gap-2">
                <span>{t("server.soundQuality")}</span>
                <div className="quality-toggle-group" role="radiogroup" aria-label={t("server.soundQuality")}>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${serverAudioQuality === "retro" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => onSetServerAudioQuality("retro")}
                    disabled={!canManageAudioQuality || serverAudioQualitySaving}
                    aria-pressed={serverAudioQuality === "retro"}
                  >
                    {t("server.soundRetro")}
                  </button>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${serverAudioQuality === "low" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => onSetServerAudioQuality("low")}
                    disabled={!canManageAudioQuality || serverAudioQualitySaving}
                    aria-pressed={serverAudioQuality === "low"}
                  >
                    {t("server.soundLow")}
                  </button>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${serverAudioQuality === "standard" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => onSetServerAudioQuality("standard")}
                    disabled={!canManageAudioQuality || serverAudioQualitySaving}
                    aria-pressed={serverAudioQuality === "standard"}
                  >
                    {t("server.soundStandard")}
                  </button>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${serverAudioQuality === "high" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => onSetServerAudioQuality("high")}
                    disabled={!canManageAudioQuality || serverAudioQualitySaving}
                    aria-pressed={serverAudioQuality === "high"}
                  >
                    {t("server.soundHigh")}
                  </button>
                </div>
              </div>
              {!canManageAudioQuality ? (
                <p className="muted">{t("server.soundReadonly")}</p>
              ) : null}
            </section>
          ) : null}

          {serverMenuTab === "video" && canManageAudioQuality ? (
            <section className="grid gap-3">
              <h3>{t("server.videoTitle")}</h3>
              <p className="muted">{t("server.videoHint")}</p>

              <div className="grid gap-2">
                <span>{t("server.videoPreview")}</span>
                <div className="server-video-preview-frame">
                  <video
                    ref={previewVideoRef}
                    className="server-video-preview-media"
                    autoPlay
                    playsInline
                    muted
                  />
                </div>
                <p className="muted">{t("server.videoPreviewHint")}</p>
              </div>

              <label className="grid gap-2">
                <span>{t("server.videoEffectType")}</span>
                <select
                  value={serverVideoEffectType}
                  onChange={(event) => onSetServerVideoEffectType(event.target.value as ServerVideoEffectType)}
                >
                  <option value="none">{t("server.videoEffectNone")}</option>
                  <option value="pixel8">{t("server.videoEffectPixel8")}</option>
                  <option value="ascii">{t("server.videoEffectAscii")}</option>
                </select>
              </label>

              <div className="grid gap-2">
                <span>{t("server.videoResolution")}</span>
                <div className="quality-toggle-group" role="radiogroup" aria-label={t("server.videoResolution")}>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${serverVideoResolution === "160x120" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => onSetServerVideoResolution("160x120")}
                    aria-pressed={serverVideoResolution === "160x120"}
                  >
                    160x120
                  </button>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${serverVideoResolution === "320x240" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => onSetServerVideoResolution("320x240")}
                    aria-pressed={serverVideoResolution === "320x240"}
                  >
                    320x240
                  </button>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${serverVideoResolution === "640x480" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => onSetServerVideoResolution("640x480")}
                    aria-pressed={serverVideoResolution === "640x480"}
                  >
                    640x480
                  </button>
                </div>
              </div>

              <div className="grid gap-2">
                <span>{t("server.videoFps")}</span>
                <div className="quality-toggle-group" role="radiogroup" aria-label={t("server.videoFps")}>
                  {[10, 15, 24, 30].map((fps) => (
                    <button
                      key={fps}
                      type="button"
                      className={`secondary quality-toggle-btn ${serverVideoFps === fps ? "quality-toggle-btn-active" : ""}`}
                      onClick={() => onSetServerVideoFps(fps as 10 | 15 | 24 | 30)}
                      aria-pressed={serverVideoFps === fps}
                    >
                      {fps} FPS
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <span>{t("server.screenShareResolution")}</span>
                <div className="quality-toggle-group" role="radiogroup" aria-label={t("server.screenShareResolution")}>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${serverScreenShareResolution === "hd" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => onSetServerScreenShareResolution("hd")}
                    aria-pressed={serverScreenShareResolution === "hd"}
                  >
                    {t("server.screenShareHd")}
                  </button>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${serverScreenShareResolution === "fullhd" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => onSetServerScreenShareResolution("fullhd")}
                    aria-pressed={serverScreenShareResolution === "fullhd"}
                  >
                    {t("server.screenShareFullhd")}
                  </button>
                  <button
                    type="button"
                    className={`secondary quality-toggle-btn ${serverScreenShareResolution === "max" ? "quality-toggle-btn-active" : ""}`}
                    onClick={() => onSetServerScreenShareResolution("max")}
                    aria-pressed={serverScreenShareResolution === "max"}
                  >
                    {t("server.screenShareMax")}
                  </button>
                </div>
              </div>

              <div className="server-video-sliders">
                <label className="slider-label grid gap-2">
                  {t("server.videoWindowMinWidth")}: {serverVideoWindowMinWidth}px
                  <RangeSlider
                    min={80}
                    max={300}
                    step={1}
                    value={serverVideoWindowMinWidth}
                    valueSuffix="px"
                    onChange={onSetServerVideoWindowMinWidth}
                  />
                </label>

                <label className="slider-label grid gap-2">
                  {t("server.videoWindowMaxWidth")}: {serverVideoWindowMaxWidth}px
                  <RangeSlider
                    min={120}
                    max={480}
                    step={1}
                    value={serverVideoWindowMaxWidth}
                    valueSuffix="px"
                    onChange={onSetServerVideoWindowMaxWidth}
                  />
                </label>
              </div>

              {serverVideoEffectType === "pixel8" ? (
                <div className="server-video-sliders">
                  <label className="slider-label grid gap-2">
                    {t("server.videoFxStrength")}: {serverVideoPixelFxStrength}%
                    <RangeSlider
                      min={0}
                      max={100}
                      step={1}
                      value={serverVideoPixelFxStrength}
                      valueSuffix="%"
                      onChange={onSetServerVideoPixelFxStrength}
                    />
                  </label>

                  <label className="slider-label grid gap-2">
                    {t("server.videoFxPixelSize")}: {serverVideoPixelFxPixelSize}px
                    <RangeSlider
                      min={2}
                      max={10}
                      step={1}
                      value={serverVideoPixelFxPixelSize}
                      valueSuffix="px"
                      onChange={onSetServerVideoPixelFxPixelSize}
                    />
                  </label>

                  <label className="slider-label grid gap-2">
                    {t("server.videoFxGridThickness")}: {serverVideoPixelFxGridThickness}px
                    <RangeSlider
                      min={1}
                      max={4}
                      step={1}
                      value={serverVideoPixelFxGridThickness}
                      valueSuffix="px"
                      onChange={onSetServerVideoPixelFxGridThickness}
                    />
                  </label>
                </div>
              ) : null}

              {serverVideoEffectType === "ascii" ? (
                <div className="server-video-sliders">
                  <label className="slider-label grid gap-2">
                    {t("server.videoAsciiCellSize")}: {serverVideoAsciiCellSize}px
                    <RangeSlider
                      min={4}
                      max={16}
                      step={1}
                      value={serverVideoAsciiCellSize}
                      valueSuffix="px"
                      onChange={onSetServerVideoAsciiCellSize}
                    />
                  </label>

                  <label className="slider-label grid gap-2">
                    {t("server.videoAsciiContrast")}: {serverVideoAsciiContrast}%
                    <RangeSlider
                      min={60}
                      max={200}
                      step={5}
                      value={serverVideoAsciiContrast}
                      valueSuffix="%"
                      onChange={onSetServerVideoAsciiContrast}
                    />
                  </label>

                  <label className="grid gap-2 server-video-slider-color">
                    <span>{t("server.videoAsciiColor")}</span>
                    <input
                      type="color"
                      value={serverVideoAsciiColor}
                      onChange={(event) => onSetServerVideoAsciiColor(event.target.value)}
                    />
                  </label>
                </div>
              ) : null}
            </section>
          ) : null}

          {serverMenuTab === "chat_images" ? (
            <section className="grid gap-3">
              <h3>{t("server.chatImagesTitle")}</h3>
              <p className="muted">{t("server.chatImagesHint")}</p>
              <div className="grid gap-2">
                <div>maxDataUrlLength: {serverChatImagePolicy.maxDataUrlLength}</div>
                <div>maxImageSide: {serverChatImagePolicy.maxImageSide}px</div>
                <div>jpegQuality: {serverChatImagePolicy.jpegQuality}</div>
              </div>
              <p className="muted">{t("server.chatImagesReadonly")}</p>
            </section>
          ) : null}

          {serverMenuTab === "desktop_downloads" ? (
            <section className="grid gap-3">
              <h3>{t("server.desktopTitle")}</h3>
              <p className="muted">{t("server.desktopHint")}</p>
              <p className="muted">
                {t("server.desktopChannel")}: {desktopManifest?.channel || desktopChannel}
                {desktopManifest?.sha ? ` · ${t("server.desktopVersionSha")}: ${desktopManifest.sha.slice(0, 8)}` : ""}
              </p>
              {desktopChannel === "test" ? <p className="muted text-xs">{t("server.desktopUnsignedWarning")}</p> : null}
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
          ) : null}
        </div>
      </section>
    </div>
  );
}
