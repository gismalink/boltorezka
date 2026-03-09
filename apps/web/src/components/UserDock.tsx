import { useRef, useState } from "react";
import type { UserDockProps } from "./types";
import { PopupPortal } from "./PopupPortal";

export function UserDock({
  t,
  user,
  currentRoomSupportsRtc,
  currentRoomSupportsVideo,
  currentRoomTitle,
  callStatus,
  localVoiceMediaStatusSummary,
  lastCallPeer,
  cameraEnabled,
  micMuted,
  audioMuted,
  audioOutputMenuOpen,
  voiceSettingsOpen,
  userSettingsOpen,
  userSettingsTab,
  voiceSettingsPanel,
  profileUsername,
  profileNameDraft,
  profileEmail,
  profileSaving,
  profileStatusText,
  selectedLang,
  languageOptions,
  inputOptions,
  outputOptions,
  videoInputOptions,
  selectedInputId,
  selectedOutputId,
  selectedVideoInputId,
  selectedInputProfile,
  inputProfileLabel,
  currentInputLabel,
  micVolume,
  outputVolume,
  serverSoundsMasterVolume,
  serverSoundsEnabled,
  micTestLevel,
  mediaDevicesState,
  mediaDevicesHint,
  audioOutputAnchorRef,
  voiceSettingsAnchorRef,
  userSettingsRef,
  onToggleMic,
  onToggleAudio,
  onToggleCamera,
  onToggleVoiceSettings,
  onToggleAudioOutput,
  onOpenUserSettings,
  onSetVoiceSettingsOpen,
  onSetAudioOutputMenuOpen,
  onSetVoiceSettingsPanel,
  onSetUserSettingsOpen,
  onSetUserSettingsTab,
  onSetProfileNameDraft,
  onSetSelectedLang,
  onSaveProfile,
  onSetSelectedInputId,
  onSetSelectedOutputId,
  onSetSelectedVideoInputId,
  onSetSelectedInputProfile,
  onRefreshDevices,
  onRequestMediaAccess,
  onRequestVideoAccess,
  onSetMicVolume,
  onSetOutputVolume,
  onSetServerSoundsMasterVolume,
  onSetServerSoundEnabled,
  onPreviewServerSound,
  onDisconnectCall,
  isMobileViewport,
  inlineSettingsMode = false
}: UserDockProps) {
  const inputDeviceRowRef = useRef<HTMLButtonElement>(null);
  const inputProfileRowRef = useRef<HTMLButtonElement>(null);
  const cameraAnchorRef = useRef<HTMLDivElement>(null);
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false);
  const mediaDevicesUnavailable = mediaDevicesState !== "ready";
  const mediaControlsLocked = mediaDevicesState === "denied";
  const mediaDevicesWarningText = mediaDevicesHint || t("settings.mediaUnavailable");
  const miniBarCount = 20;
  const modalBarCount = 42;
  const miniActiveBars = Math.min(miniBarCount, Math.round(micTestLevel * miniBarCount));
  const modalActiveBars = Math.min(modalBarCount, Math.round(micTestLevel * modalBarCount));
  void localVoiceMediaStatusSummary;
  void callStatus;
  void lastCallPeer;
  void currentRoomTitle;
  return (
    <>
      <div className={`user-dock ${inlineSettingsMode ? "user-dock-inline-hidden" : ""} relative z-20 mt-auto flex min-h-0 flex-col gap-4`}>
        {currentRoomSupportsRtc ? (
          <section className="card compact rtc-connection-card flex flex-col gap-3 max-[800px]:hidden">
            <div className="rtc-actions-grid grid grid-cols-4 gap-2">
              <span data-tooltip={t("rtc.comingSoon")}>
                <button type="button" className="secondary rtc-placeholder-btn" aria-label={t("rtc.noiseReduction")} disabled>
                  <i className="bi bi-sliders" aria-hidden="true" />
                </button>
              </span>
              <span data-tooltip={t("rtc.comingSoon")}>
                <button type="button" className="secondary rtc-placeholder-btn" aria-label={t("rtc.screenShare")} disabled>
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

        <section className="card compact user-panel-card flex items-center justify-between gap-3 max-[800px]:grid max-[800px]:grid-cols-1 max-[800px]:gap-0">
          <div className={`user-panel-actions user-panel-actions-grid ${mediaControlsLocked ? "user-panel-actions-locked" : ""}`}>
            <div className="voice-settings-anchor relative max-[800px]:min-w-0" ref={voiceSettingsAnchorRef}>
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
                      className={`secondary voice-menu-row flex w-full items-center justify-between gap-3 text-left ${voiceSettingsPanel === "input_device" ? "voice-menu-row-active" : ""}`}
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
                      className={`secondary voice-menu-row flex w-full items-center justify-between gap-3 text-left ${voiceSettingsPanel === "input_profile" ? "voice-menu-row-active" : ""}`}
                      onClick={() => onSetVoiceSettingsPanel(voiceSettingsPanel === "input_profile" ? null : "input_profile")}
                    >
                      <span className="voice-menu-text grid min-w-0 gap-0.5">
                        <span className="voice-menu-title">{t("settings.inputProfile")}</span>
                        <span className="voice-menu-subtitle">{inputProfileLabel}</span>
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

                  <div className="voice-level-bars grid grid-cols-[repeat(20,minmax(0,1fr))] gap-0.5" aria-hidden="true">
                    {Array.from({ length: miniBarCount }).map((_, index) => (
                      <span
                        key={`bar-${index}`}
                        className={`voice-level-bar ${index < miniActiveBars ? "voice-level-bar-active" : ""}`}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    className="secondary voice-footer-row flex w-full items-center justify-between gap-4 text-left"
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
                    open={voiceSettingsPanel === "input_profile"}
                    anchorRef={inputProfileRowRef}
                    className="settings-popup voice-submenu-popup"
                    placement={isMobileViewport ? "bottom-start" : "right-start"}
                    offset={isMobileViewport ? 6 : 8}
                  >
                    <div>
                      <div className="device-list mt-4 grid gap-2">
                        <button
                          type="button"
                          className={`secondary device-item radio-item flex items-center justify-between gap-4 text-left ${selectedInputProfile === "noise_reduction" ? "device-item-active" : ""}`}
                          onClick={() => {
                            onSetSelectedInputProfile("noise_reduction");
                            onSetVoiceSettingsPanel(null);
                          }}
                        >
                          <span>{t("settings.voiceIsolation")}</span>
                          <i className={`bi ${selectedInputProfile === "noise_reduction" ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={`secondary device-item radio-item flex items-center justify-between gap-4 text-left ${selectedInputProfile === "studio" ? "device-item-active" : ""}`}
                          onClick={() => {
                            onSetSelectedInputProfile("studio");
                            onSetVoiceSettingsPanel(null);
                          }}
                        >
                          <span>{t("settings.studio")}</span>
                          <i className={`bi ${selectedInputProfile === "studio" ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={`secondary device-item radio-item flex items-center justify-between gap-4 text-left ${selectedInputProfile === "custom" ? "device-item-active" : ""}`}
                          onClick={() => {
                            onSetSelectedInputProfile("custom");
                            onSetVoiceSettingsPanel(null);
                          }}
                        >
                          <span>{t("settings.custom")}</span>
                          <i className={`bi ${selectedInputProfile === "custom" ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </PopupPortal>
                </div>
              </PopupPortal>
            </div>

            <div className="audio-output-anchor relative max-[800px]:min-w-0" ref={audioOutputAnchorRef}>
              <div className="audio-output-group split-control-group user-panel-split-group inline-flex items-center gap-0">
                <button
                  type="button"
                  className={`secondary icon-btn split-main-btn user-panel-main-btn ${audioMuted ? "icon-btn-danger" : ""}`}
                  data-tooltip={audioMuted ? t("audio.enableOutput") : t("audio.disableOutput")}
                  disabled={mediaControlsLocked}
                  onClick={onToggleAudio}
                >
                  <i className={`bi ${audioMuted ? "bi-volume-mute-fill" : "bi-headphones"}`} aria-hidden="true" />
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
                    className="secondary voice-footer-row flex w-full items-center justify-between gap-4 text-left"
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

            <div className="camera-anchor relative max-[800px]:min-w-0" ref={cameraAnchorRef}>
              <div className="audio-output-group split-control-group user-panel-split-group inline-flex items-center gap-0">
                <button
                  type="button"
                  className={`secondary icon-btn split-main-btn user-panel-main-btn ${cameraEnabled ? "" : "icon-btn-danger"}`}
                  data-tooltip={cameraEnabled ? t("video.disableCamera") : t("video.enableCamera")}
                  disabled={mediaControlsLocked || !currentRoomSupportsVideo}
                  onClick={onToggleCamera}
                >
                  <i className={`bi ${cameraEnabled ? "bi-camera-video-fill" : "bi-camera-video-off-fill"}`} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="secondary icon-btn split-caret-btn"
                  data-tooltip={t("video.cameraDevice")}
                  disabled={mediaControlsLocked || !currentRoomSupportsVideo}
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
              className="secondary icon-btn split-main-btn user-panel-main-btn user-panel-disconnect-btn"
              data-tooltip={t("mobile.disconnect")}
              onClick={onDisconnectCall}
            >
              <i className="bi bi-telephone-x" aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>

      {userSettingsOpen || inlineSettingsMode ? (
        <div className={`voice-preferences-overlay fixed inset-0 z-[60] flex items-center justify-center p-[var(--space-3xl)] ${inlineSettingsMode ? "inline-settings-mode" : ""} ${inlineSettingsMode ? "contents" : ""}`}>
          <section className="card voice-preferences-modal user-settings-modal grid w-full max-w-[980px] min-w-0 gap-4 max-[800px]:h-full max-[800px]:max-h-none max-[800px]:min-h-0 max-[800px]:overflow-hidden max-[800px]:p-4 min-[801px]:grid-cols-[250px_1fr]" ref={userSettingsRef}>
            <div className="user-settings-sidebar grid min-w-0 content-start gap-3">
              <div className="voice-preferences-kicker">{t("settings.title")}</div>
              <div className="user-settings-tab-group grid min-w-0 gap-2 max-[800px]:grid-cols-2 max-[800px]:gap-2">
                <button
                  type="button"
                  className={`secondary user-settings-tab-btn justify-start text-left max-[800px]:min-w-0 max-[800px]:justify-center ${userSettingsTab === "profile" ? "user-settings-tab-btn-active" : ""}`}
                  onClick={() => onSetUserSettingsTab("profile")}
                >
                  {t("settings.tabProfile")}
                </button>
                <button
                  type="button"
                  className={`secondary user-settings-tab-btn justify-start text-left max-[800px]:min-w-0 max-[800px]:justify-center ${userSettingsTab === "sound" ? "user-settings-tab-btn-active" : ""}`}
                  onClick={() => onSetUserSettingsTab("sound")}
                >
                  {t("settings.tabSound")}
                </button>
                <button
                  type="button"
                  className={`secondary user-settings-tab-btn justify-start text-left max-[800px]:min-w-0 max-[800px]:justify-center ${userSettingsTab === "camera" ? "user-settings-tab-btn-active" : ""}`}
                  onClick={() => onSetUserSettingsTab("camera")}
                >
                  {t("settings.tabCamera")}
                </button>
                <button
                  type="button"
                  className={`secondary user-settings-tab-btn justify-start text-left max-[800px]:min-w-0 max-[800px]:justify-center ${userSettingsTab === "server_sounds" ? "user-settings-tab-btn-active" : ""}`}
                  onClick={() => onSetUserSettingsTab("server_sounds")}
                >
                  {t("settings.tabServerSounds")}
                </button>
              </div>
            </div>

            <div className="user-settings-content grid min-h-0 min-w-0 content-start gap-4 overflow-auto overflow-x-hidden pr-0">
              <div className="voice-preferences-head flex items-center justify-between gap-2">
                <h2 className="mt-[var(--space-xxs)]">{userSettingsTab === "profile" ? t("settings.tabProfile") : userSettingsTab === "sound" ? t("settings.tabSound") : userSettingsTab === "camera" ? t("settings.tabCamera") : t("settings.tabServerSounds")}</h2>
                {!inlineSettingsMode ? (
                  <button type="button" className="secondary icon-btn" onClick={() => onSetUserSettingsOpen(false)} aria-label={t("settings.closeVoiceAria")}>
                    <i className="bi bi-x-lg" aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              {userSettingsTab === "profile" ? (
                <form className="grid gap-4" onSubmit={onSaveProfile}>
                  <div className="grid gap-3">
                    <h3 className="subheading">{t("settings.profileSection")}</h3>
                    <label className="grid gap-[var(--space-md)]">
                      <span className="subheading">{t("settings.username")}</span>
                      <input className="profile-readonly-input" value={profileUsername} readOnly aria-readonly="true" />
                    </label>
                    <label className="grid gap-[var(--space-md)]">
                      <span className="subheading">{t("settings.displayName")}</span>
                      <input value={profileNameDraft} onChange={(event) => onSetProfileNameDraft(event.target.value)} />
                    </label>
                    <label className="grid gap-[var(--space-md)]">
                      <span className="subheading">{t("settings.email")}</span>
                      <input className="profile-readonly-input" value={profileEmail} readOnly aria-readonly="true" />
                    </label>
                    <label className="grid gap-[var(--space-md)]">
                      <span className="subheading">ID</span>
                      <input className="profile-readonly-input" value={user.id} readOnly aria-readonly="true" />
                    </label>
                    <label className="grid gap-[var(--space-md)]">
                      <span className="subheading">{t("settings.language")}</span>
                      <select value={selectedLang} onChange={(event) => onSetSelectedLang(event.target.value as "ru" | "en") }>
                        {languageOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {profileStatusText ? <p className="muted media-devices-warning">{profileStatusText}</p> : null}

                  <button type="submit" disabled={profileSaving}>
                    {profileSaving ? t("settings.saving") : t("settings.save")}
                  </button>
                </form>
              ) : userSettingsTab === "sound" ? (
                <>
                  <div className="voice-preferences-grid grid gap-3 min-[801px]:grid-cols-2">
                    <label className="grid gap-[var(--space-md)]">
                      <span className="subheading">{t("settings.microphone")}</span>
                      <select value={selectedInputId} disabled={mediaDevicesUnavailable} onChange={(event) => onSetSelectedInputId(event.target.value)}>
                        {inputOptions.map((device) => (
                          <option key={device.id} value={device.id}>{device.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-[var(--space-md)]">
                      <span className="subheading">{t("settings.speaker")}</span>
                      <select value={selectedOutputId} disabled={mediaDevicesUnavailable} onChange={(event) => onSetSelectedOutputId(event.target.value)}>
                        {outputOptions.map((device) => (
                          <option key={device.id} value={device.id}>{device.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" className="secondary" onClick={onRequestMediaAccess}>
                      {t("settings.requestMediaAccess")}
                    </button>
                    <button type="button" className="secondary" onClick={onRefreshDevices}>
                      {t("settings.refreshDevices")}
                    </button>
                  </div>

                  {mediaDevicesUnavailable ? (
                    <p className="muted media-devices-warning">{mediaDevicesWarningText}</p>
                  ) : null}

                  <div className="voice-preferences-grid grid gap-3 min-[801px]:grid-cols-2">
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
                    <label className="slider-label grid gap-2">
                      {t("settings.outputVolume")}
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={outputVolume}
                        disabled={mediaControlsLocked}
                        onChange={(event) => onSetOutputVolume(Number(event.target.value))}
                      />
                    </label>
                  </div>

                  <div className="voice-test-row grid gap-2">
                    <div className="subheading">{t("settings.micTest")}</div>
                    <div className="voice-level-bars mt-0 grid grid-cols-12 gap-0.5 min-[801px]:grid-cols-[repeat(42,minmax(0,1fr))]" aria-hidden="true">
                      {Array.from({ length: modalBarCount }).map((_, index) => (
                        <span
                          key={`modal-bar-${index}`}
                          className={`voice-level-bar ${index < modalActiveBars ? "voice-level-bar-active" : ""}`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="voice-divider" />

                  <div className="grid gap-2">
                    <h3 className="subheading">{t("settings.inputProfile")}</h3>
                    <button
                      type="button"
                      className={`secondary device-item radio-item flex items-center justify-between gap-4 text-left ${selectedInputProfile === "noise_reduction" ? "device-item-active" : ""}`}
                      disabled={mediaControlsLocked}
                      onClick={() => onSetSelectedInputProfile("noise_reduction")}
                    >
                      <span>{t("settings.voiceIsolation")}</span>
                      <i className={`bi ${selectedInputProfile === "noise_reduction" ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`secondary device-item radio-item flex items-center justify-between gap-4 text-left ${selectedInputProfile === "studio" ? "device-item-active" : ""}`}
                      disabled={mediaControlsLocked}
                      onClick={() => onSetSelectedInputProfile("studio")}
                    >
                      <span>{t("settings.studio")}</span>
                      <i className={`bi ${selectedInputProfile === "studio" ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`secondary device-item radio-item flex items-center justify-between gap-4 text-left ${selectedInputProfile === "custom" ? "device-item-active" : ""}`}
                      disabled={mediaControlsLocked}
                      onClick={() => onSetSelectedInputProfile("custom")}
                    >
                      <span>{t("settings.custom")}</span>
                      <i className={`bi ${selectedInputProfile === "custom" ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
                    </button>
                  </div>
                </>
              ) : userSettingsTab === "camera" ? (
                <>
                  <div className="voice-preferences-grid grid gap-3 min-[801px]:grid-cols-1">
                    <label className="grid gap-[var(--space-md)]">
                      <span className="subheading">{t("video.cameraDevice")}</span>
                      <select value={selectedVideoInputId} disabled={mediaDevicesUnavailable} onChange={(event) => onSetSelectedVideoInputId(event.target.value)}>
                        {videoInputOptions.map((device) => (
                          <option key={device.id} value={device.id}>{device.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" className="secondary" onClick={onRequestVideoAccess}>
                      {t("video.enableCamera")}
                    </button>
                    <button type="button" className="secondary" onClick={onRefreshDevices}>
                      {t("settings.refreshDevices")}
                    </button>
                  </div>

                  {mediaDevicesUnavailable ? (
                    <p className="muted media-devices-warning">{mediaDevicesWarningText}</p>
                  ) : null}
                </>
              ) : (
                <section className="grid gap-4">
                  <h3 className="subheading">{t("settings.serverSoundsSection")}</h3>
                  <label className="slider-label grid gap-2">
                    {t("settings.serverSoundsMasterVolume")}
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={serverSoundsMasterVolume}
                      onChange={(event) => onSetServerSoundsMasterVolume(Number(event.target.value))}
                    />
                  </label>

                  <label className="voice-sound-checkbox flex items-center justify-between gap-3">
                    <span>{t("settings.serverSoundMemberJoin")}</span>
                    <div className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={serverSoundsEnabled.member_join}
                        onChange={(event) => onSetServerSoundEnabled("member_join", event.target.checked)}
                      />
                      <button type="button" className="secondary icon-btn tiny" onClick={() => onPreviewServerSound("member_join")}>♪</button>
                    </div>
                  </label>

                  <label className="voice-sound-checkbox flex items-center justify-between gap-3">
                    <span>{t("settings.serverSoundMemberLeave")}</span>
                    <div className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={serverSoundsEnabled.member_leave}
                        onChange={(event) => onSetServerSoundEnabled("member_leave", event.target.checked)}
                      />
                      <button type="button" className="secondary icon-btn tiny" onClick={() => onPreviewServerSound("member_leave")}>♪</button>
                    </div>
                  </label>

                  <label className="voice-sound-checkbox flex items-center justify-between gap-3">
                    <span>{t("settings.serverSoundDisconnected")}</span>
                    <div className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={serverSoundsEnabled.server_disconnected}
                        onChange={(event) => onSetServerSoundEnabled("server_disconnected", event.target.checked)}
                      />
                      <button type="button" className="secondary icon-btn tiny" onClick={() => onPreviewServerSound("server_disconnected")}>♪</button>
                    </div>
                  </label>

                  <label className="voice-sound-checkbox flex items-center justify-between gap-3">
                    <span>{t("settings.serverSoundChatMessage")}</span>
                    <div className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={serverSoundsEnabled.chat_message}
                        onChange={(event) => onSetServerSoundEnabled("chat_message", event.target.checked)}
                      />
                      <button type="button" className="secondary icon-btn tiny" onClick={() => onPreviewServerSound("chat_message")}>♪</button>
                    </div>
                  </label>
                </section>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
