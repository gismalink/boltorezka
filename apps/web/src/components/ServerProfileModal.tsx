import { useEffect, useRef } from "react";
import type { AudioQuality, TelemetrySummary, User } from "../domain";
import type { ServerVideoEffectType } from "../hooks/rtc/voiceCallTypes";

type ServerMenuTab = "users" | "events" | "telemetry" | "call" | "sound" | "video";

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
  serverVideoEffectType: ServerVideoEffectType;
  serverVideoResolution: "160x120" | "320x240" | "640x480";
  serverVideoFps: 10 | 15 | 24 | 30;
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
  onSetServerVideoPixelFxStrength: (value: number) => void;
  onSetServerVideoPixelFxPixelSize: (value: number) => void;
  onSetServerVideoPixelFxGridThickness: (value: number) => void;
  onSetServerVideoAsciiCellSize: (value: number) => void;
  onSetServerVideoAsciiContrast: (value: number) => void;
  onSetServerVideoAsciiColor: (value: string) => void;
  onSetServerVideoWindowMinWidth: (value: number) => void;
  onSetServerVideoWindowMaxWidth: (value: number) => void;
};

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
  serverVideoEffectType,
  serverVideoResolution,
  serverVideoFps,
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
      <section className="card voice-preferences-modal user-settings-modal server-profile-modal grid w-full max-w-[980px] min-w-0 gap-4 min-[801px]:grid-cols-[250px_1fr]">
        <div className="user-settings-sidebar grid min-w-0 content-start gap-2">
          <div className="voice-preferences-kicker">{t("server.title")}</div>
          {canPromote ? (
            <button
              type="button"
              className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-[800px]:min-w-0 max-[800px]:justify-center ${serverMenuTab === "users" ? "user-settings-tab-btn-active" : ""}`}
              onClick={() => onSetServerMenuTab("users")}
            >
              {t("server.tabUsers")}
            </button>
          ) : null}
          <button
            type="button"
            className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-[800px]:min-w-0 max-[800px]:justify-center ${serverMenuTab === "events" ? "user-settings-tab-btn-active" : ""}`}
            onClick={() => onSetServerMenuTab("events")}
          >
            {t("server.tabEvents")}
          </button>
          {canViewTelemetry ? (
            <button
              type="button"
              className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-[800px]:min-w-0 max-[800px]:justify-center ${serverMenuTab === "telemetry" ? "user-settings-tab-btn-active" : ""}`}
              onClick={() => onSetServerMenuTab("telemetry")}
            >
              {t("server.tabTelemetry")}
            </button>
          ) : null}
          <button
            type="button"
            className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-[800px]:min-w-0 max-[800px]:justify-center ${serverMenuTab === "call" ? "user-settings-tab-btn-active" : ""}`}
            onClick={() => onSetServerMenuTab("call")}
          >
            {t("server.tabCall")}
          </button>
          {canManageAudioQuality ? (
            <button
              type="button"
              className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-[800px]:min-w-0 max-[800px]:justify-center ${serverMenuTab === "sound" ? "user-settings-tab-btn-active" : ""}`}
              onClick={() => onSetServerMenuTab("sound")}
            >
              {t("server.tabSound")}
            </button>
          ) : null}
          {canManageAudioQuality ? (
            <button
              type="button"
              className={`secondary user-settings-tab-btn min-h-[42px] justify-start text-left max-[800px]:min-w-0 max-[800px]:justify-center ${serverMenuTab === "video" ? "user-settings-tab-btn-active" : ""}`}
              onClick={() => onSetServerMenuTab("video")}
            >
              {t("server.tabVideo")}
            </button>
          ) : null}
        </div>

        <div className="user-settings-content grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] content-start gap-4 overflow-auto overflow-x-hidden pr-0">
          <div className="voice-preferences-head flex items-center justify-between gap-3">
            <h2 className="mt-[var(--space-xxs)]">
              {serverMenuTab === "users" ? t("server.tabUsers") : null}
              {serverMenuTab === "events" ? t("server.tabEvents") : null}
              {serverMenuTab === "telemetry" ? t("server.tabTelemetry") : null}
              {serverMenuTab === "call" ? t("server.tabCall") : null}
              {serverMenuTab === "sound" ? t("server.tabSound") : null}
              {serverMenuTab === "video" ? t("server.tabVideo") : null}
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
              <ul className="admin-list grid gap-2">
                {adminUsers.map((item) => (
                  <li key={item.id} className="admin-row grid min-h-[42px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 max-[800px]:grid-cols-1">
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

              <div className="server-video-sliders">
                <label className="slider-label grid gap-2">
                  {t("server.videoWindowMinWidth")}: {serverVideoWindowMinWidth}px
                  <input
                    type="range"
                    min={80}
                    max={300}
                    step={1}
                    value={serverVideoWindowMinWidth}
                    onChange={(event) => onSetServerVideoWindowMinWidth(Number(event.target.value))}
                  />
                </label>

                <label className="slider-label grid gap-2">
                  {t("server.videoWindowMaxWidth")}: {serverVideoWindowMaxWidth}px
                  <input
                    type="range"
                    min={120}
                    max={480}
                    step={1}
                    value={serverVideoWindowMaxWidth}
                    onChange={(event) => onSetServerVideoWindowMaxWidth(Number(event.target.value))}
                  />
                </label>
              </div>

              {serverVideoEffectType === "pixel8" ? (
                <div className="server-video-sliders">
                  <label className="slider-label grid gap-2">
                    {t("server.videoFxStrength")}: {serverVideoPixelFxStrength}%
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={serverVideoPixelFxStrength}
                      onChange={(event) => onSetServerVideoPixelFxStrength(Number(event.target.value))}
                    />
                  </label>

                  <label className="slider-label grid gap-2">
                    {t("server.videoFxPixelSize")}: {serverVideoPixelFxPixelSize}px
                    <input
                      type="range"
                      min={2}
                      max={10}
                      step={1}
                      value={serverVideoPixelFxPixelSize}
                      onChange={(event) => onSetServerVideoPixelFxPixelSize(Number(event.target.value))}
                    />
                  </label>

                  <label className="slider-label grid gap-2">
                    {t("server.videoFxGridThickness")}: {serverVideoPixelFxGridThickness}px
                    <input
                      type="range"
                      min={1}
                      max={4}
                      step={1}
                      value={serverVideoPixelFxGridThickness}
                      onChange={(event) => onSetServerVideoPixelFxGridThickness(Number(event.target.value))}
                    />
                  </label>
                </div>
              ) : null}

              {serverVideoEffectType === "ascii" ? (
                <div className="server-video-sliders">
                  <label className="slider-label grid gap-2">
                    {t("server.videoAsciiCellSize")}: {serverVideoAsciiCellSize}px
                    <input
                      type="range"
                      min={4}
                      max={16}
                      step={1}
                      value={serverVideoAsciiCellSize}
                      onChange={(event) => onSetServerVideoAsciiCellSize(Number(event.target.value))}
                    />
                  </label>

                  <label className="slider-label grid gap-2">
                    {t("server.videoAsciiContrast")}: {serverVideoAsciiContrast}%
                    <input
                      type="range"
                      min={60}
                      max={200}
                      step={5}
                      value={serverVideoAsciiContrast}
                      onChange={(event) => onSetServerVideoAsciiContrast(Number(event.target.value))}
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
        </div>
      </section>
    </div>
  );
}
