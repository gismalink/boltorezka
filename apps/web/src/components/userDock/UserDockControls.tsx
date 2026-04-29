/**
 * UserDockControls.tsx — ряд быстрых контролов в UserDock (mute/deafen/screen-share/audio output).
 * Рендерит попапы выбора устройств и слайдеры громкости; состояние audio приходит из props.
 */
import { useEffect, useRef, useState } from "react";
import { PopupPortal, RangeSlider } from "../uicomponents";
import type { UserDockProps } from "../types";
import { formatPushToTalkHotkey, normalizePushToTalkHotkey } from "../../utils/pushToTalk";

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
  | "walkieTalkieEnabled"
  | "walkieTalkieHotkey"
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
  | "onSetWalkieTalkieEnabled"
  | "onSetWalkieTalkieHotkey"
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
  walkieTalkieEnabled,
  walkieTalkieHotkey,
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
  onSetWalkieTalkieEnabled,
  onSetWalkieTalkieHotkey,
  onSetOutputVolume,
  onDisconnectCall,
  isMobileViewport,
  mediaDevicesUnavailable,
  mediaControlsLocked,
  mediaDevicesWarningText
}: UserDockControlsProps) {
  const inputDeviceRowRef = useRef<HTMLButtonElement>(null);
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
  const walkieTalkieHotkeyLabel = formatPushToTalkHotkey(walkieTalkieHotkey);

  useEffect(() => {
    if (!cameraMenuOpen) {
      return;
    }

    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      const insideCamera = Boolean(target && cameraAnchorRef.current?.contains(target));
      const insidePopupLayer = Boolean(target && target instanceof HTMLElement && target.closest(".popup-layer-content"));
      if (!insideCamera && !insidePopupLayer) {
        setCameraMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [cameraMenuOpen]);

  useEffect(() => {
    if (cameraControlDisabled) {
      setCameraMenuOpen(false);
    }
  }, [cameraControlDisabled]);

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
                data-agent-id="userdock.rtc.noise-reduction"
                data-agent-state={noiseSuppressionEnabled ? "on" : "off"}
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
                data-agent-id="userdock.rtc.screen-share"
                data-agent-state={!canStartScreenShare ? "disabled" : screenShareActive ? "active" : "idle"}
              >
                <i className="bi bi-display" aria-hidden="true" />
              </button>
            </span>
            <span data-tooltip={t("rtc.comingSoon")}>
              <button
                type="button"
                className="secondary rtc-placeholder-btn"
                aria-label={t("rtc.effects")}
                disabled
                data-agent-id="userdock.rtc.effects"
                data-agent-state="disabled"
              >
                <i className="bi bi-stars" aria-hidden="true" />
              </button>
            </span>
            <span data-tooltip={t("rtc.comingSoon")}>
              <button
                type="button"
                className="secondary rtc-placeholder-btn"
                aria-label={t("rtc.activities")}
                disabled
                data-agent-id="userdock.rtc.activities"
                data-agent-state="disabled"
              >
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
                data-agent-id="userdock.audio.mic-toggle"
                data-agent-state={mediaControlsLocked ? "disabled" : micMuted ? "muted" : "unmuted"}
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
                data-agent-id="userdock.voice-settings.toggle"
                data-agent-state={voiceSettingsOpen ? "open" : "closed"}
              >
                <i className="bi bi-chevron-down" aria-hidden="true" />
              </button>
            </div>
            <PopupPortal
              open={voiceSettingsOpen}
              anchorRef={voiceSettingsAnchorRef}
              className="settings-popup voice-settings-popup"
              placement="top-end"
              disableFlip
            >
              <div className="grid gap-3">
                <div className="voice-menu-items grid gap-2">
                  <button
                    ref={inputDeviceRowRef}
                    type="button"
                    className={`secondary flex w-full items-center justify-between gap-3 px-[var(--space-lg)] py-[var(--space-lg)] text-left ${voiceSettingsPanel === "input_device" ? "voice-menu-row-active" : ""}`}
                    disabled={mediaDevicesUnavailable}
                    onClick={() => onSetVoiceSettingsPanel(voiceSettingsPanel === "input_device" ? null : "input_device")}
                    data-agent-id="userdock.voice-settings.input-device-row"
                    data-agent-state={mediaDevicesUnavailable ? "disabled" : voiceSettingsPanel === "input_device" ? "active" : "idle"}
                  >
                    <span className="voice-menu-text grid min-w-0 gap-0.5">
                      <span className="voice-menu-title">{t("settings.inputDevice")}</span>
                      <span className="voice-menu-subtitle">{currentInputLabel}</span>
                    </span>
                    <i className="bi bi-chevron-right" aria-hidden="true" />
                  </button>
                </div>

                {mediaDevicesUnavailable ? (
                  <p className="muted media-devices-warning">{mediaDevicesWarningText}</p>
                ) : null}

                <label className="slider-label grid gap-2">
                  {t("settings.micVolume")}
                  <RangeSlider
                    min={0}
                    max={100}
                    value={micVolume}
                    disabled={mediaControlsLocked}
                    valueSuffix="%"
                    onChange={onSetMicVolume}
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

                <div className="voice-sound-checkbox mt-[var(--space-xl)] flex items-center justify-between gap-3">
                  <span>{t("settings.walkieTalkieMode")}</span>
                  <button
                    type="button"
                    className={`ui-switch ${walkieTalkieEnabled ? "ui-switch-on" : ""}`}
                    role="switch"
                    aria-checked={walkieTalkieEnabled}
                    aria-label={t("settings.walkieTalkieMode")}
                    onClick={() => onSetWalkieTalkieEnabled(!walkieTalkieEnabled)}
                    data-agent-id="userdock.voice-settings.walkie-talkie"
                    data-agent-state={walkieTalkieEnabled ? "on" : "off"}
                  >
                    <span className="ui-switch-thumb" aria-hidden="true" />
                  </button>
                </div>

                {walkieTalkieEnabled ? (
                  <label className="grid min-w-0 gap-2 voice-hotkey-field">
                    <span className="subheading">{t("settings.walkieTalkieHotkey")}</span>
                    <input
                      className="voice-hotkey-input"
                      type="text"
                      value={walkieTalkieHotkeyLabel}
                      readOnly
                      onKeyDown={(event) => {
                        event.preventDefault();
                        onSetWalkieTalkieHotkey(normalizePushToTalkHotkey(event.code));
                      }}
                      onFocus={(event) => event.currentTarget.select()}
                      aria-label={t("settings.walkieTalkieHotkey")}
                      data-agent-id="userdock.voice-settings.walkie-talkie-hotkey"
                      data-agent-value={walkieTalkieHotkeyLabel}
                    />
                    <p className="muted media-devices-warning">{t("settings.walkieTalkieHotkeyHint")}</p>
                  </label>
                ) : null}

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
                  data-agent-id="settings.user-modal.open"
                  data-agent-state={mediaControlsLocked ? "disabled" : "ready"}
                    data-agent-value="sound"
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
                          data-agent-id="userdock.voice-settings.input-device.select"
                          data-agent-state={mediaDevicesUnavailable ? "disabled" : selectedInputId === device.id ? "selected" : "idle"}
                          data-agent-value={device.id}
                        >
                          <span>{device.label}</span>
                          <i className={`bi ${selectedInputId === device.id ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  </div>
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
                data-agent-id="userdock.audio.output-toggle"
                data-agent-state={mediaControlsLocked ? "disabled" : audioMuted ? "muted" : "unmuted"}
              >
                <i className={`bi bi-headphones ${audioMuted ? "headphones-icon-muted" : ""}`} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="secondary icon-btn split-caret-btn"
                data-tooltip={t("settings.outputHint")}
                disabled={mediaControlsLocked}
                onClick={onToggleAudioOutput}
                data-agent-id="userdock.audio.output-menu-toggle"
                data-agent-state={mediaControlsLocked ? "disabled" : audioOutputMenuOpen ? "open" : "closed"}
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
                      data-agent-id="userdock.audio.output-device.select"
                      data-agent-state={mediaDevicesUnavailable ? "disabled" : selectedOutputId === device.id ? "selected" : "idle"}
                      data-agent-value={device.id}
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
                  <RangeSlider
                    min={0}
                    max={100}
                    value={outputVolume}
                    disabled={mediaControlsLocked}
                    valueSuffix="%"
                    onChange={onSetOutputVolume}
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
                  data-agent-id="settings.user-modal.open"
                  data-agent-state={mediaControlsLocked ? "disabled" : "ready"}
                  data-agent-value="sound"
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
                data-agent-id="userdock.video.camera-toggle"
                data-agent-state={cameraControlDisabled ? "disabled" : cameraEnabled ? "on" : "off"}
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
                data-agent-id="userdock.video.camera-menu-toggle"
                data-agent-state={cameraControlDisabled ? "disabled" : cameraMenuOpen ? "open" : "closed"}
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
                      data-agent-id="userdock.video.camera-device.select"
                      data-agent-state={mediaDevicesUnavailable ? "disabled" : selectedVideoInputId === device.id ? "selected" : "idle"}
                      data-agent-value={device.id}
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
            data-agent-id="userdock.rtc.disconnect"
            data-agent-state="ready"
          >
            <i className="bi bi-telephone-x" aria-hidden="true" />
          </button>
        </div>
      </section>
    </>
  );
}
