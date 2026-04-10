import { useEffect, useRef } from "react";
import type { ServerScreenShareResolution, ServerVideoEffectType } from "../../hooks/rtc/voiceCallTypes";
import { RangeSlider } from "../uicomponents";

type ServerVideoSettingsTabProps = {
  t: (key: string) => string;
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

export function ServerVideoSettingsTab({
  t,
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
}: ServerVideoSettingsTabProps) {
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

  return (
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
  );
}
