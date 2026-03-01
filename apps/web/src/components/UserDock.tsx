import { useRef } from "react";
import type { UserDockProps } from "./types";
import { PopupPortal } from "./PopupPortal";

export function UserDock({
  t,
  user,
  currentRoomSupportsRtc,
  currentRoomTitle,
  callStatus,
  lastCallPeer,
  roomVoiceConnected,
  micMuted,
  audioMuted,
  audioOutputMenuOpen,
  voiceSettingsOpen,
  userSettingsOpen,
  userSettingsTab,
  voiceSettingsPanel,
  profileNameDraft,
  profileEmail,
  profileSaving,
  profileStatusText,
  selectedLang,
  languageOptions,
  inputOptions,
  outputOptions,
  selectedInputId,
  selectedOutputId,
  selectedInputProfile,
  inputProfileLabel,
  currentInputLabel,
  micVolume,
  outputVolume,
  micTestLevel,
  mediaDevicesState,
  mediaDevicesHint,
  audioOutputAnchorRef,
  voiceSettingsAnchorRef,
  userSettingsRef,
  onToggleMic,
  onToggleAudio,
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
  onSetSelectedInputProfile,
  onRefreshDevices,
  onRequestMediaAccess,
  onSetMicVolume,
  onSetOutputVolume,
  onDisconnectCall,
  inlineSettingsMode = false
}: UserDockProps) {
  const inputDeviceRowRef = useRef<HTMLButtonElement>(null);
  const inputProfileRowRef = useRef<HTMLButtonElement>(null);
  const mediaDevicesUnavailable = mediaDevicesState !== "ready";
  const mediaDevicesWarningText = mediaDevicesHint || t("settings.mediaUnavailable");
  const miniBarCount = 20;
  const modalBarCount = 42;
  const miniActiveBars = Math.min(miniBarCount, Math.round(micTestLevel * miniBarCount));
  const modalActiveBars = Math.min(modalBarCount, Math.round(micTestLevel * modalBarCount));
  const userStatusLabel = !currentRoomSupportsRtc
    ? t("status.online")
    : callStatus === "active"
      ? t("rtc.connected")
      : roomVoiceConnected || callStatus === "connecting" || callStatus === "ringing"
        ? t("rtc.connecting")
        : t("status.online");

  return (
    <>
      <div className={`user-dock ${inlineSettingsMode ? "user-dock-inline-hidden" : ""} relative z-20 mt-auto flex min-h-0 flex-col gap-4`}>
        {currentRoomSupportsRtc ? (
          <section className="card compact rtc-connection-card flex flex-col gap-3 max-[900px]:hidden">
            <div className="rtc-title-row flex items-start justify-between gap-3">
              <div>
                <div className="rtc-title">{t("rtc.connection")}</div>
                <div className="muted rtc-subtitle">
                  {currentRoomTitle}
                  {lastCallPeer ? ` · ${lastCallPeer}` : ""}
                </div>
                <div className="muted rtc-subtitle">{t("call.status")}: {callStatus}</div>
              </div>
              <div className="rtc-top-actions inline-flex gap-2">
                <button type="button" className="secondary icon-btn tiny" data-tooltip={t("rtc.muteConnection")} onClick={onToggleMic}>
                  <i className="bi bi-soundwave" aria-hidden="true" />
                </button>
                <button type="button" className="secondary icon-btn tiny" data-tooltip={t("rtc.disconnect")} onClick={onDisconnectCall}>
                  <i className="bi bi-telephone-x" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="rtc-actions-grid grid grid-cols-4 gap-2">
              <button type="button" className="secondary" data-tooltip={t("rtc.noiseReduction")}>
                <i className="bi bi-sliders" aria-hidden="true" />
              </button>
              <button type="button" className="secondary" data-tooltip={t("rtc.screenShare")}>
                <i className="bi bi-display" aria-hidden="true" />
              </button>
              <button type="button" className="secondary" data-tooltip={t("rtc.effects")}>
                <i className="bi bi-stars" aria-hidden="true" />
              </button>
              <button type="button" className="secondary" data-tooltip={t("rtc.activities")}>
                <i className="bi bi-lightning-charge" aria-hidden="true" />
              </button>
            </div>
          </section>
        ) : null}

        <section className="card compact user-panel-card flex items-center justify-between gap-3 max-[900px]:grid max-[900px]:grid-cols-1 max-[900px]:gap-0">
          <div className="user-panel-main flex min-w-0 items-center gap-3 max-[900px]:hidden">
            <button
              type="button"
              className="user-avatar-badge user-avatar-button"
              data-tooltip={t("profile.openSettings")}
              aria-label={t("profile.openSettings")}
              onClick={() => onOpenUserSettings("profile")}
            >
              {(user.name || "U").charAt(0).toUpperCase()}
            </button>
            <div className="user-meta min-w-0 flex-1">
              <div className="user-name-line truncate">{user.name}</div>
              <div className="muted user-status-line">{userStatusLabel}</div>
            </div>
          </div>
          <div className="user-panel-actions flex items-center gap-2 max-[900px]:grid max-[900px]:w-full max-[900px]:grid-cols-2">
            <div className="voice-settings-anchor relative max-[900px]:min-w-0" ref={voiceSettingsAnchorRef}>
              <div className="audio-output-group split-control-group inline-flex items-center gap-0 max-[900px]:grid max-[900px]:w-full max-[900px]:grid-cols-[minmax(0,1fr)_22px]">
                <button
                  type="button"
                  className={`secondary icon-btn split-main-btn max-[900px]:w-full ${micMuted ? "icon-btn-danger" : ""}`}
                  data-tooltip={micMuted ? t("audio.enableMic") : t("audio.disableMic")}
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
                    placement="right-start"
                    offset={8}
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
                    placement="right-start"
                    offset={8}
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

            <div className="audio-output-anchor relative max-[900px]:min-w-0" ref={audioOutputAnchorRef}>
              <div className="audio-output-group split-control-group inline-flex items-center gap-0 max-[900px]:grid max-[900px]:w-full max-[900px]:grid-cols-[minmax(0,1fr)_22px]">
                <button
                  type="button"
                  className={`secondary icon-btn split-main-btn max-[900px]:w-full ${audioMuted ? "icon-btn-danger" : ""}`}
                  data-tooltip={audioMuted ? t("audio.enableOutput") : t("audio.disableOutput")}
                  onClick={onToggleAudio}
                >
                  <i className={`bi ${audioMuted ? "bi-volume-mute-fill" : "bi-headphones"}`} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="secondary icon-btn split-caret-btn"
                  data-tooltip={t("settings.outputHint")}
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
                      onChange={(event) => onSetOutputVolume(Number(event.target.value))}
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary voice-footer-row flex w-full items-center justify-between gap-4 text-left"
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
          </div>
        </section>
      </div>

      {userSettingsOpen || inlineSettingsMode ? (
        <div className={`voice-preferences-overlay fixed inset-0 z-[60] flex items-center justify-center p-[var(--space-3xl)] ${inlineSettingsMode ? "inline-settings-mode" : ""} ${inlineSettingsMode ? "contents" : ""}`}>
          <section className="card voice-preferences-modal user-settings-modal grid w-full max-w-[980px] min-w-0 gap-4 max-[900px]:h-full max-[900px]:max-h-none max-[900px]:min-h-0 max-[900px]:overflow-hidden max-[900px]:p-4 md:grid-cols-[250px_1fr]" ref={userSettingsRef}>
            <div className="user-settings-sidebar grid min-w-0 content-start gap-3">
              <div className="voice-preferences-kicker">{t("settings.title")}</div>
              <div className="user-settings-tab-group grid min-w-0 gap-2 max-[920px]:grid-cols-2 max-[920px]:gap-2">
                <button
                  type="button"
                  className={`secondary user-settings-tab-btn justify-start text-left max-[920px]:min-w-0 max-[920px]:justify-center ${userSettingsTab === "profile" ? "user-settings-tab-btn-active" : ""}`}
                  onClick={() => onSetUserSettingsTab("profile")}
                >
                  {t("settings.tabProfile")}
                </button>
                <button
                  type="button"
                  className={`secondary user-settings-tab-btn justify-start text-left max-[920px]:min-w-0 max-[920px]:justify-center ${userSettingsTab === "sound" ? "user-settings-tab-btn-active" : ""}`}
                  onClick={() => onSetUserSettingsTab("sound")}
                >
                  {t("settings.tabSound")}
                </button>
              </div>
            </div>

            <div className="user-settings-content grid min-h-0 min-w-0 content-start gap-4 overflow-auto overflow-x-hidden pr-0">
              <div className="voice-preferences-head flex items-center justify-between gap-2">
                <h2 className="mt-[var(--space-xxs)]">{userSettingsTab === "profile" ? t("settings.tabProfile") : t("settings.tabSound")}</h2>
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
                    <label className="stack">
                      <span className="subheading">{t("settings.displayName")}</span>
                      <input value={profileNameDraft} onChange={(event) => onSetProfileNameDraft(event.target.value)} />
                    </label>
                    <label className="stack">
                      <span className="subheading">{t("settings.email")}</span>
                      <input value={profileEmail} readOnly disabled />
                    </label>
                    <label className="stack">
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
              ) : (
                <>
                  <div className="voice-preferences-grid grid gap-3 md:grid-cols-2">
                    <label className="stack">
                      <span className="subheading">{t("settings.microphone")}</span>
                      <select value={selectedInputId} disabled={mediaDevicesUnavailable} onChange={(event) => onSetSelectedInputId(event.target.value)}>
                        {inputOptions.map((device) => (
                          <option key={device.id} value={device.id}>{device.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="stack">
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

                  <div className="voice-preferences-grid grid gap-3 md:grid-cols-2">
                    <label className="slider-label grid gap-2">
                      {t("settings.micVolume")}
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={micVolume}
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
                        onChange={(event) => onSetOutputVolume(Number(event.target.value))}
                      />
                    </label>
                  </div>

                  <div className="voice-test-row grid gap-2">
                    <div className="subheading">{t("settings.micTest")}</div>
                    <div className="voice-level-bars mt-0 grid grid-cols-12 gap-0.5 md:grid-cols-[repeat(42,minmax(0,1fr))]" aria-hidden="true">
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
                      onClick={() => onSetSelectedInputProfile("noise_reduction")}
                    >
                      <span>{t("settings.voiceIsolation")}</span>
                      <i className={`bi ${selectedInputProfile === "noise_reduction" ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`secondary device-item radio-item flex items-center justify-between gap-4 text-left ${selectedInputProfile === "studio" ? "device-item-active" : ""}`}
                      onClick={() => onSetSelectedInputProfile("studio")}
                    >
                      <span>{t("settings.studio")}</span>
                      <i className={`bi ${selectedInputProfile === "studio" ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`secondary device-item radio-item flex items-center justify-between gap-4 text-left ${selectedInputProfile === "custom" ? "device-item-active" : ""}`}
                      onClick={() => onSetSelectedInputProfile("custom")}
                    >
                      <span>{t("settings.custom")}</span>
                      <i className={`bi ${selectedInputProfile === "custom" ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
