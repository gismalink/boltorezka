import { useRef, useState } from "react";
import { PopupPortal } from "../PopupPortal";
import type { UserDockProps } from "../types";

type UserDockControlsProps = Pick<
  UserDockProps,
  | "t"
  | "currentRoomSupportsRtc"
  | "currentRoomSupportsVideo"
  | "screenShareActive"
  | "screenShareOwnedByCurrentUser"
  | "canStartScreenShare"
  | "noiseSuppressionEnabled"
  | "cameraEnabled"
  | "micMuted"
  | "audioMuted"
  | "audioOutputMenuOpen"
  | "voiceSettingsOpen"
  | "voiceSettingsPanel"
  | "inputOptions"
  | "outputOptions"
  | "videoInputOptions"
  | "selectedInputId"
  | "selectedOutputId"
  | "selectedVideoInputId"
  | "currentInputLabel"
  | "micVolume"
  | "outputVolume"
  | "micTestLevel"
  | "mediaDevicesState"
  | "audioOutputAnchorRef"
  | "voiceSettingsAnchorRef"
  | "onToggleMic"
  | "onToggleAudio"
  | "onToggleCamera"
  | "onToggleScreenShare"
  | "onToggleNoiseSuppression"
  | "onToggleVoiceSettings"
  | "onToggleAudioOutput"
  | "onOpenUserSettings"
  | "onSetVoiceSettingsOpen"
  | "onSetAudioOutputMenuOpen"
  | "onSetVoiceSettingsPanel"
  | "onSetSelectedInputId"
  | "onSetSelectedOutputId"
  | "onSetSelectedVideoInputId"
  | "onRequestVideoAccess"
  | "onSetMicVolume"
  | "onSetOutputVolume"
  | "onDisconnectCall"
  | "isMobileViewport"
> & {
  mediaDevicesUnavailable: boolean;
  mediaControlsLocked: boolean;
  mediaDevicesWarningText: string;
};

export function UserDockControls({
  t,
  currentRoomSupportsRtc,
  currentRoomSupportsVideo,
  screenShareActive,
  screenShareOwnedByCurrentUser,
  canStartScreenShare,
  noiseSuppressionEnabled,
  cameraEnabled,
  micMuted,
  audioMuted,
  audioOutputMenuOpen,
  voiceSettingsOpen,
  voiceSettingsPanel,
  inputOptions,
  outputOptions,
  videoInputOptions,
  selectedInputId,
  selectedOutputId,
  selectedVideoInputId,
  currentInputLabel,
  micVolume,
  outputVolume,
  micTestLevel,
  audioOutputAnchorRef,
  voiceSettingsAnchorRef,
  onToggleMic,
  onToggleAudio,
  onToggleCamera,
  onToggleScreenShare,
  onToggleNoiseSuppression,
  onToggleVoiceSettings,
  onToggleAudioOutput,
  onOpenUserSettings,
  onSetVoiceSettingsOpen,
  onSetAudioOutputMenuOpen,
  onSetVoiceSettingsPanel,
  onSetSelectedInputId,
  onSetSelectedOutputId,
  onSetSelectedVideoInputId,
  onRequestVideoAccess,
  onSetMicVolume,
  onSetOutputVolume,
  onDisconnectCall,
  isMobileViewport,
  mediaDevicesUnavailable,
  mediaControlsLocked,
  mediaDevicesWarningText
}: UserDockControlsProps) {
  const inputDeviceRowRef = useRef<HTMLButtonElement>(null);
  const inputProfileRowRef = useRef<HTMLButtonElement>(null);
  const cameraAnchorRef = useRef<HTMLDivElement>(null);
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false);

  const cameraControlDisabled = mediaControlsLocked || !currentRoomSupportsVideo;
  const cameraTooltip = !currentRoomSupportsVideo
    ? t("video.cameraUnavailableInRoom")
    : cameraEnabled
      ? t("video.disableCamera")
      : t("video.enableCamera");
  const screenShareBlockedByOtherUser = screenShareActive && !screenShareOwnedByCurrentUser && !canStartScreenShare;
  const screenShareTooltip = screenShareBlockedByOtherUser
    ? t("rtc.screenShareBusy")
    : screenShareActive
      ? t("rtc.stopScreenShare")
      : t("rtc.screenShare");
  const miniBarCount = 20;
  const miniActiveBars = Math.min(miniBarCount, Math.round(micTestLevel * miniBarCount));

  return (
    <>
      {currentRoomSupportsRtc ? (
        <section className="card compact rtc-connection-card flex flex-col gap-3 max-desktop:hidden">
          <div className="rtc-actions-grid grid grid-cols-4 gap-2">
            <span data-tooltip={noiseSuppressionEnabled ? t("rtc.noiseReductionOn") : t("rtc.noiseReductionOff")}>
              <button
                type="button"
                className={`secondary rtc-placeholder-btn ${noiseSuppressionEnabled ? "icon-btn-danger" : ""}`}
                aria-label={t("rtc.noiseReduction")}
                onClick={onToggleNoiseSuppression}
              >
                <i className="bi bi-soundwave" aria-hidden="true" />
              </button>
            </span>
            <span data-tooltip={screenShareTooltip}>
              <button
                type="button"
                className={`secondary rtc-placeholder-btn ${screenShareActive ? "icon-btn-danger" : ""}`}
                aria-label={t("rtc.screenShare")}
                onClick={onToggleScreenShare}
                disabled={!canStartScreenShare}
              >
                <i className="bi bi-display" aria-hidden="true" />
              </button>
            </span>
            <span data-tooltip={t("rtc.comingSoon")}>
              <button type="button" className="secondary rtc-placeholder-btn" aria-label={t("rtc.effects")} disabled>
                <i className="bi bi-stars" aria-hidden="true" />
              </button>
            </span>
            <span data-tooltip={t("rtc.comingSoon")}>
              <button type="button" className="secondary rtc-placeholder-btn" aria-label={t("rtc.activities")} disabled>
                <i className="bi bi-lightning-charge" aria-hidden="true" />
              </button>
            </span>
          </div>
        </section>
      ) : null}

      <section className="card compact user-panel-card flex items-center justify-between gap-3 max-desktop:grid max-desktop:grid-cols-1 max-desktop:gap-0">
        <div className={`user-panel-actions user-panel-actions-grid ${mediaControlsLocked ? "user-panel-actions-locked" : ""}`}>
          <div className="voice-settings-anchor relative max-desktop:min-w-0" ref={voiceSettingsAnchorRef}>
            <div className="audio-output-group split-control-group user-panel-split-group inline-flex items-center gap-0">
              <button
                type="button"
                className={`secondary icon-btn split-main-btn user-panel-main-btn ${micMuted ? "icon-btn-danger" : ""}`}
                data-tooltip={micMuted ? t("audio.enableMic") : t("audio.disableMic")}
                disabled={mediaControlsLocked}
                onClick={onToggleMic}
              >
                <span
                  className="mic-live-fill"
                  style={{ transform: `scaleY(${Math.max(0.05, micMuted ? 0 : micTestLevel)})` }}
                  aria-hidden="true"
                />
                <i className={`bi ${micMuted ? "bi-mic-mute-fill" : "bi-mic-fill"}`} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="secondary icon-btn split-caret-btn"
                data-tooltip={t("settings.audioInputHint")}
                disabled={mediaControlsLocked}
                onClick={onToggleVoiceSettings}
              >
                <i className="bi bi-chevron-down" aria-hidden="true" />
              </button>
            </div>
            <PopupPortal
              open={voiceSettingsOpen}
              anchorRef={voiceSettingsAnchorRef}
              className="settings-popup voice-settings-popup"
              placement="top-end"
            >
              <div className="grid gap-3">
                <div className="voice-menu-items grid gap-2">
                  <button
                    ref={inputDeviceRowRef}
                    type="button"
                    className={`secondary flex w-full items-center justify-between gap-3 px-[var(--space-lg)] py-[var(--space-lg)] text-left ${voiceSettingsPanel === "input_device" ? "voice-menu-row-active" : ""}`}
                    disabled={mediaDevicesUnavailable}
                    onClick={() => onSetVoiceSettingsPanel(voiceSettingsPanel === "input_device" ? null : "input_device")}
                  >
                    <span className="voice-menu-text grid min-w-0 gap-0.5">
                      <span className="voice-menu-title">{t("settings.inputDevice")}</span>
                      <span className="voice-menu-subtitle">{currentInputLabel}</span>
                    </span>
                    <i className="bi bi-chevron-right" aria-hidden="true" />
                  </button>
                  <button
                    ref={inputProfileRowRef}
                    type="button"
                    className="secondary flex w-full items-center justify-between gap-3 px-[var(--space-lg)] py-[var(--space-lg)] text-left"
                    disabled
                  >
                    <span className="voice-menu-text grid min-w-0 gap-0.5">
                      <span className="voice-menu-title">{t("settings.inputProfile")}</span>
                      <span className="voice-menu-subtitle">{t("settings.inputProfileLocked")}</span>
                    </span>
                    <i className="bi bi-chevron-right" aria-hidden="true" />
                  </button>
                </div>

                {mediaDevicesUnavailable ? (
                  <p className="muted media-devices-warning">{mediaDevicesWarningText}</p>
                ) : null}

                <label className="slider-label grid gap-2">
                  {t("settings.micVolume")}
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={micVolume}
                    disabled={mediaControlsLocked}
                    onChange={(event) => onSetMicVolume(Number(event.target.value))}
                  />
                </label>

                <div className="mt-[var(--space-md)] grid grid-cols-[repeat(20,minmax(0,1fr))] gap-0.5" aria-hidden="true">
                  {Array.from({ length: miniBarCount }).map((_, index) => (
                    <span
                      key={`bar-${index}`}
                      className={`voice-level-bar ${index < miniActiveBars ? "voice-level-bar-active" : ""}`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  className="secondary mt-[var(--space-xl)] flex w-full items-center justify-between gap-4 text-left"
                  disabled={mediaControlsLocked}
                  onClick={() => {
                    onSetVoiceSettingsOpen(false);
                    onSetAudioOutputMenuOpen(false);
                    onSetVoiceSettingsPanel(null);
                    onOpenUserSettings("sound");
                  }}
                >
                  <span>{t("settings.voiceSettings")}</span>
                  <i className="bi bi-gear" aria-hidden="true" />
                </button>

                <PopupPortal
                  open={voiceSettingsPanel === "input_device"}
                  anchorRef={inputDeviceRowRef}
                  className="settings-popup voice-submenu-popup"
                  placement={isMobileViewport ? "bottom-start" : "right-start"}
                  offset={isMobileViewport ? 6 : 8}
                >
                  <div>
                    <div className="device-list mt-4 grid gap-2">
                      {inputOptions.map((device) => (
                        <button
                          key={device.id}
                          type="button"
                          className={`secondary device-item radio-item flex items-center justify-between gap-4 text-left ${selectedInputId === device.id ? "device-item-active" : ""}`}
                          disabled={mediaDevicesUnavailable}
                          onClick={() => {
                            onSetSelectedInputId(device.id);
                            onSetVoiceSettingsPanel(null);
                          }}
                        >
                          <span>{device.label}</span>
                          <i className={`bi ${selectedInputId === device.id ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
                        </button>
                      ))}
                      <button type="button" className="secondary device-item justify-start text-left">{t("settings.showMore")}</button>
                    </div>
                  </div>
                </PopupPortal>

                <PopupPortal
                  open={false}
                  anchorRef={inputProfileRowRef}
                  className="settings-popup voice-submenu-popup"
                  placement={isMobileViewport ? "bottom-start" : "right-start"}
                  offset={isMobileViewport ? 6 : 8}
                >
                  <div />
                </PopupPortal>
              </div>
            </PopupPortal>
          </div>

          <div className="audio-output-anchor relative max-desktop:min-w-0" ref={audioOutputAnchorRef}>
            <div className="audio-output-group split-control-group user-panel-split-group inline-flex items-center gap-0">
              <button
                type="button"
                className={`secondary icon-btn split-main-btn user-panel-main-btn ${audioMuted ? "icon-btn-danger" : ""}`}
                data-tooltip={audioMuted ? t("audio.enableOutput") : t("audio.disableOutput")}
                disabled={mediaControlsLocked}
                onClick={onToggleAudio}
              >
                <i className={`bi bi-headphones ${audioMuted ? "headphones-icon-muted" : ""}`} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="secondary icon-btn split-caret-btn"
                data-tooltip={t("settings.outputHint")}
                disabled={mediaControlsLocked}
                onClick={onToggleAudioOutput}
              >
                <i className="bi bi-chevron-down" aria-hidden="true" />
              </button>
            </div>
            <PopupPortal
              open={audioOutputMenuOpen}
              anchorRef={audioOutputAnchorRef}
              className="settings-popup voice-mini-popup"
              placement="top-end"
            >
              <div className="grid gap-3">
                <div className="subheading">{t("settings.outputDevice")}</div>
                <div className="device-list mt-4 grid gap-1.5">
                  {outputOptions.map((device) => (
                    <button
                      key={device.id}
                      type="button"
                      className={`secondary device-item radio-item flex items-center justify-between gap-4 text-left ${selectedOutputId === device.id ? "device-item-active" : ""}`}
                      disabled={mediaDevicesUnavailable}
                      onClick={() => onSetSelectedOutputId(device.id)}
                    >
                      <span>{device.label}</span>
                      <i className={`bi ${selectedOutputId === device.id ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
                    </button>
                  ))}
                </div>
                {mediaDevicesUnavailable ? (
                  <p className="muted media-devices-warning">{mediaDevicesWarningText}</p>
                ) : null}
                <label className="slider-label grid gap-2">
                  {t("settings.soundVolume")}
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={outputVolume}
                    disabled={mediaControlsLocked}
                    onChange={(event) => onSetOutputVolume(Number(event.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className="secondary mt-[var(--space-xl)] flex w-full items-center justify-between gap-4 text-left"
                  disabled={mediaControlsLocked}
                  onClick={() => {
                    onSetAudioOutputMenuOpen(false);
                    onSetVoiceSettingsOpen(false);
                    onSetVoiceSettingsPanel(null);
                    onOpenUserSettings("sound");
                  }}
                >
                  <span>{t("settings.voiceSettings")}</span>
                  <i className="bi bi-gear" aria-hidden="true" />
                </button>
              </div>
            </PopupPortal>
          </div>

          <div className="camera-anchor relative max-desktop:min-w-0" ref={cameraAnchorRef}>
            <div className="audio-output-group split-control-group user-panel-split-group inline-flex items-center gap-0">
              <button
                type="button"
                className={`secondary icon-btn split-main-btn user-panel-main-btn ${cameraEnabled ? "" : "icon-btn-danger"}`}
                data-tooltip={cameraTooltip}
                disabled={cameraControlDisabled}
                onClick={onToggleCamera}
              >
                <i className={`bi ${cameraEnabled ? "bi-camera-video-fill" : "bi-camera-video-off-fill"}`} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="secondary icon-btn split-caret-btn"
                data-tooltip={t("video.cameraDevice")}
                disabled={cameraControlDisabled}
                onClick={() => {
                  onRequestVideoAccess();
                  setCameraMenuOpen((value) => !value);
                }}
              >
                <i className="bi bi-chevron-down" aria-hidden="true" />
              </button>
            </div>
            <PopupPortal
              open={cameraMenuOpen}
              anchorRef={cameraAnchorRef}
              className="settings-popup voice-mini-popup"
              placement="top-end"
            >
              <div className="grid gap-3">
                <div className="subheading">{t("video.cameraDevice")}</div>
                <div className="device-list mt-4 grid gap-1.5">
                  {videoInputOptions.map((device) => (
                    <button
                      key={device.id}
                      type="button"
                      className={`secondary device-item radio-item flex items-center justify-between gap-4 text-left ${selectedVideoInputId === device.id ? "device-item-active" : ""}`}
                      disabled={mediaDevicesUnavailable}
                      onClick={() => {
                        onSetSelectedVideoInputId(device.id);
                        setCameraMenuOpen(false);
                      }}
                    >
                      <span>{device.label}</span>
                      <i className={`bi ${selectedVideoInputId === device.id ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
                    </button>
                  ))}
                </div>
                {mediaDevicesUnavailable ? (
                  <p className="muted media-devices-warning">{mediaDevicesWarningText}</p>
                ) : null}
              </div>
            </PopupPortal>
          </div>

          <button
            type="button"
            className="secondary icon-btn user-panel-disconnect-btn flex w-full items-center justify-center"
            data-tooltip={t("mobile.disconnect")}
            onClick={onDisconnectCall}
          >
            <i className="bi bi-telephone-x" aria-hidden="true" />
          </button>
        </div>
      </section>
    </>
  );
}
