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
  onDisconnectCall
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
      <div className="user-dock">
        {currentRoomSupportsRtc ? (
          <section className="card compact rtc-connection-card">
            <div className="rtc-title-row">
              <div>
                <div className="rtc-title">{t("rtc.connection")}</div>
                <div className="muted rtc-subtitle">
                  {currentRoomTitle}
                  {lastCallPeer ? ` · ${lastCallPeer}` : ""}
                </div>
                <div className="muted rtc-subtitle">{t("call.status")}: {callStatus}</div>
              </div>
              <div className="rtc-top-actions">
                <button type="button" className="secondary icon-btn tiny" data-tooltip={t("rtc.muteConnection")} onClick={onToggleMic}>
                  <i className="bi bi-soundwave" aria-hidden="true" />
                </button>
                <button type="button" className="secondary icon-btn tiny" data-tooltip={t("rtc.disconnect")} onClick={onDisconnectCall}>
                  <i className="bi bi-telephone-x" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="rtc-actions-grid">
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

        <section className="card compact user-panel-card">
          <div className="user-panel-main">
            <button
              type="button"
              className="user-avatar-badge user-avatar-button"
              data-tooltip={t("profile.openSettings")}
              aria-label={t("profile.openSettings")}
              onClick={() => onOpenUserSettings("profile")}
            >
              {(user.name || "U").charAt(0).toUpperCase()}
            </button>
            <div className="user-meta">
              <div className="user-name-line">{user.name}</div>
              <div className="muted user-status-line">{userStatusLabel}</div>
            </div>
          </div>
          <div className="user-panel-actions">
            <div className="voice-settings-anchor" ref={voiceSettingsAnchorRef}>
              <div className="audio-output-group split-control-group">
                <button
                  type="button"
                  className={`secondary icon-btn split-main-btn ${micMuted ? "icon-btn-danger" : ""}`}
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
                <div>
                  <div className="voice-menu-items">
                    <button
                      ref={inputDeviceRowRef}
                      type="button"
                      className={`secondary voice-menu-row ${voiceSettingsPanel === "input_device" ? "voice-menu-row-active" : ""}`}
                      disabled={mediaDevicesUnavailable}
                      onClick={() => onSetVoiceSettingsPanel(voiceSettingsPanel === "input_device" ? null : "input_device")}
                    >
                      <span className="voice-menu-text">
                        <span className="voice-menu-title">{t("settings.inputDevice")}</span>
                        <span className="voice-menu-subtitle">{currentInputLabel}</span>
                      </span>
                      <i className="bi bi-chevron-right" aria-hidden="true" />
                    </button>
                    <button
                      ref={inputProfileRowRef}
                      type="button"
                      className={`secondary voice-menu-row ${voiceSettingsPanel === "input_profile" ? "voice-menu-row-active" : ""}`}
                      onClick={() => onSetVoiceSettingsPanel(voiceSettingsPanel === "input_profile" ? null : "input_profile")}
                    >
                      <span className="voice-menu-text">
                        <span className="voice-menu-title">{t("settings.inputProfile")}</span>
                        <span className="voice-menu-subtitle">{inputProfileLabel}</span>
                      </span>
                      <i className="bi bi-chevron-right" aria-hidden="true" />
                    </button>
                  </div>

                  {mediaDevicesUnavailable ? (
                    <p className="muted media-devices-warning">{mediaDevicesWarningText}</p>
                  ) : null}

                  <label className="slider-label">
                    {t("settings.micVolume")}
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={micVolume}
                      onChange={(event) => onSetMicVolume(Number(event.target.value))}
                    />
                  </label>

                  <div className="voice-level-bars" aria-hidden="true">
                    {Array.from({ length: miniBarCount }).map((_, index) => (
                      <span
                        key={`bar-${index}`}
                        className={`voice-level-bar ${index < miniActiveBars ? "voice-level-bar-active" : ""}`}
                      />
                    ))}
                  </div>

                  <button
                    type="button"
                    className="secondary voice-footer-row"
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
                      <div className="device-list">
                        {inputOptions.map((device) => (
                          <button
                            key={device.id}
                            type="button"
                            className={`secondary device-item radio-item ${selectedInputId === device.id ? "device-item-active" : ""}`}
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
                        <button type="button" className="secondary device-item">{t("settings.showMore")}</button>
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
                      <div className="device-list">
                        <button
                          type="button"
                          className={`secondary device-item radio-item ${selectedInputProfile === "noise_reduction" ? "device-item-active" : ""}`}
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
                          className={`secondary device-item radio-item ${selectedInputProfile === "studio" ? "device-item-active" : ""}`}
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
                          className={`secondary device-item radio-item ${selectedInputProfile === "custom" ? "device-item-active" : ""}`}
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

            <div className="audio-output-anchor" ref={audioOutputAnchorRef}>
              <div className="audio-output-group split-control-group">
                <button
                  type="button"
                  className={`secondary icon-btn split-main-btn ${audioMuted ? "icon-btn-danger" : ""}`}
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
                <div>
                  <div className="subheading">{t("settings.outputDevice")}</div>
                  <div className="device-list">
                    {outputOptions.map((device) => (
                      <button
                        key={device.id}
                        type="button"
                        className={`secondary device-item radio-item ${selectedOutputId === device.id ? "device-item-active" : ""}`}
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
                  <label className="slider-label">
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
                    className="secondary voice-footer-row"
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

      {userSettingsOpen ? (
        <div className="voice-preferences-overlay">
          <section className="card voice-preferences-modal user-settings-modal" ref={userSettingsRef}>
            <div className="user-settings-sidebar">
              <div className="voice-preferences-kicker">{t("settings.title")}</div>
              <button
                type="button"
                className={`secondary user-settings-tab-btn ${userSettingsTab === "profile" ? "user-settings-tab-btn-active" : ""}`}
                onClick={() => onSetUserSettingsTab("profile")}
              >
                {t("settings.tabProfile")}
              </button>
              <button
                type="button"
                className={`secondary user-settings-tab-btn ${userSettingsTab === "sound" ? "user-settings-tab-btn-active" : ""}`}
                onClick={() => onSetUserSettingsTab("sound")}
              >
                {t("settings.tabSound")}
              </button>
            </div>

            <div className="user-settings-content">
              <div className="voice-preferences-head">
                <h2>{userSettingsTab === "profile" ? t("settings.tabProfile") : t("settings.tabSound")}</h2>
                <button type="button" className="secondary icon-btn" onClick={() => onSetUserSettingsOpen(false)} aria-label={t("settings.closeVoiceAria")}>
                  <i className="bi bi-x-lg" aria-hidden="true" />
                </button>
              </div>

              {userSettingsTab === "profile" ? (
                <form className="stack" onSubmit={onSaveProfile}>
                  <div className="stack">
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
                  <div className="voice-preferences-grid">
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

                  <div className="row">
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

                  <div className="voice-preferences-grid">
                    <label className="slider-label">
                      {t("settings.micVolume")}
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={micVolume}
                        onChange={(event) => onSetMicVolume(Number(event.target.value))}
                      />
                    </label>
                    <label className="slider-label">
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

                  <div className="voice-test-row">
                    <div className="subheading">{t("settings.micTest")}</div>
                    <div className="voice-level-bars" aria-hidden="true">
                      {Array.from({ length: modalBarCount }).map((_, index) => (
                        <span
                          key={`modal-bar-${index}`}
                          className={`voice-level-bar ${index < modalActiveBars ? "voice-level-bar-active" : ""}`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="voice-divider" />

                  <div className="stack">
                    <h3 className="subheading">{t("settings.inputProfile")}</h3>
                    <button
                      type="button"
                      className={`secondary device-item radio-item ${selectedInputProfile === "noise_reduction" ? "device-item-active" : ""}`}
                      onClick={() => onSetSelectedInputProfile("noise_reduction")}
                    >
                      <span>{t("settings.voiceIsolation")}</span>
                      <i className={`bi ${selectedInputProfile === "noise_reduction" ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`secondary device-item radio-item ${selectedInputProfile === "studio" ? "device-item-active" : ""}`}
                      onClick={() => onSetSelectedInputProfile("studio")}
                    >
                      <span>{t("settings.studio")}</span>
                      <i className={`bi ${selectedInputProfile === "studio" ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`secondary device-item radio-item ${selectedInputProfile === "custom" ? "device-item-active" : ""}`}
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
