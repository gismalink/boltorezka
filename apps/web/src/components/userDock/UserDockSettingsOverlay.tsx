import type { UserDockProps } from "../types";

type UserDockSettingsOverlayProps = Pick<
  UserDockProps,
  | "t"
  | "user"
  | "userSettingsOpen"
  | "inlineSettingsMode"
  | "userSettingsRef"
  | "userSettingsTab"
  | "onSetUserSettingsOpen"
  | "onSetUserSettingsTab"
  | "profileUsername"
  | "profileNameDraft"
  | "profileEmail"
  | "profileSaving"
  | "profileStatusText"
  | "onSaveProfile"
  | "onSetProfileNameDraft"
  | "selectedLang"
  | "languageOptions"
  | "onSetSelectedLang"
  | "inputOptions"
  | "outputOptions"
  | "selectedInputId"
  | "selectedOutputId"
  | "onSetSelectedInputId"
  | "onSetSelectedOutputId"
  | "onRequestMediaAccess"
  | "onRefreshDevices"
  | "micVolume"
  | "outputVolume"
  | "onSetMicVolume"
  | "onSetOutputVolume"
  | "selectedVideoInputId"
  | "videoInputOptions"
  | "onSetSelectedVideoInputId"
  | "onRequestVideoAccess"
  | "serverSoundsMasterVolume"
  | "onSetServerSoundsMasterVolume"
  | "serverSoundsEnabled"
  | "onSetServerSoundEnabled"
  | "onPreviewServerSound"
  | "selfMonitorEnabled"
  | "onToggleSelfMonitor"
  | "noiseSuppressionEnabled"
  | "rnnoiseSuppressionLevel"
  | "rnnoiseRuntimeStatus"
  | "onToggleNoiseSuppression"
  | "onSetRnnoiseSuppressionLevel"
> & {
  mediaDevicesUnavailable: boolean;
  mediaControlsLocked: boolean;
  mediaDevicesWarningText: string;
  modalBarCount: number;
  modalActiveBars: number;
};

export function UserDockSettingsOverlay({
  t,
  user,
  userSettingsOpen,
  inlineSettingsMode = false,
  userSettingsRef,
  userSettingsTab,
  onSetUserSettingsOpen,
  onSetUserSettingsTab,
  profileUsername,
  profileNameDraft,
  profileEmail,
  profileSaving,
  profileStatusText,
  onSaveProfile,
  onSetProfileNameDraft,
  selectedLang,
  languageOptions,
  onSetSelectedLang,
  inputOptions,
  outputOptions,
  selectedInputId,
  selectedOutputId,
  onSetSelectedInputId,
  onSetSelectedOutputId,
  onRequestMediaAccess,
  onRefreshDevices,
  micVolume,
  outputVolume,
  onSetMicVolume,
  onSetOutputVolume,
  selectedVideoInputId,
  videoInputOptions,
  onSetSelectedVideoInputId,
  onRequestVideoAccess,
  serverSoundsMasterVolume,
  onSetServerSoundsMasterVolume,
  serverSoundsEnabled,
  onSetServerSoundEnabled,
  onPreviewServerSound,
  selfMonitorEnabled,
  onToggleSelfMonitor,
  noiseSuppressionEnabled,
  rnnoiseSuppressionLevel,
  rnnoiseRuntimeStatus,
  onToggleNoiseSuppression,
  onSetRnnoiseSuppressionLevel,
  mediaDevicesUnavailable,
  mediaControlsLocked,
  mediaDevicesWarningText,
  modalBarCount,
  modalActiveBars
}: UserDockSettingsOverlayProps) {
  if (!userSettingsOpen && !inlineSettingsMode) {
    return null;
  }

  return (
    <div className={`voice-preferences-overlay fixed inset-0 z-[60] flex items-center justify-center p-[var(--space-3xl)] ${inlineSettingsMode ? "inline-settings-mode" : ""} ${inlineSettingsMode ? "contents" : ""}`}>
      <section className="card voice-preferences-modal user-settings-modal grid w-full max-w-[980px] min-w-0 gap-4 max-desktop:h-full max-desktop:max-h-none max-desktop:min-h-0 max-desktop:overflow-hidden max-desktop:p-4 desktop:grid-cols-[250px_1fr]" ref={userSettingsRef}>
        <div className="user-settings-sidebar grid min-w-0 content-start gap-3">
          <div className="voice-preferences-kicker">{t("settings.title")}</div>
          <div className="user-settings-tab-group grid min-w-0 gap-2 max-desktop:grid-cols-2 max-desktop:gap-2">
            <button
              type="button"
              className={`secondary user-settings-tab-btn justify-start text-left max-desktop:min-w-0 max-desktop:justify-center ${userSettingsTab === "profile" ? "user-settings-tab-btn-active" : ""}`}
              onClick={() => onSetUserSettingsTab("profile")}
            >
              {t("settings.tabProfile")}
            </button>
            <button
              type="button"
              className={`secondary user-settings-tab-btn justify-start text-left max-desktop:min-w-0 max-desktop:justify-center ${userSettingsTab === "sound" ? "user-settings-tab-btn-active" : ""}`}
              onClick={() => onSetUserSettingsTab("sound")}
            >
              {t("settings.tabSound")}
            </button>
            <button
              type="button"
              className={`secondary user-settings-tab-btn justify-start text-left max-desktop:min-w-0 max-desktop:justify-center ${userSettingsTab === "camera" ? "user-settings-tab-btn-active" : ""}`}
              onClick={() => onSetUserSettingsTab("camera")}
            >
              {t("settings.tabCamera")}
            </button>
            <button
              type="button"
              className={`secondary user-settings-tab-btn justify-start text-left max-desktop:min-w-0 max-desktop:justify-center ${userSettingsTab === "server_sounds" ? "user-settings-tab-btn-active" : ""}`}
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
              <div className="voice-preferences-grid grid gap-3 desktop:grid-cols-2">
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

              <div className="voice-preferences-grid grid gap-3 desktop:grid-cols-2">
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
                <div className="voice-level-bars mt-0 grid grid-cols-12 gap-0.5 desktop:grid-cols-[repeat(42,minmax(0,1fr))]" aria-hidden="true">
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
                <p className="muted media-devices-warning">{t("settings.inputProfileLocked")}</p>
                <label className="voice-sound-checkbox flex items-center justify-between gap-3">
                  <span>{t("settings.listenSelf")}</span>
                  <button
                    type="button"
                    className={`ui-switch ${selfMonitorEnabled ? "ui-switch-on" : ""}`}
                    role="switch"
                    aria-checked={selfMonitorEnabled}
                    aria-label={t("settings.listenSelf")}
                    data-tooltip={selfMonitorEnabled ? t("settings.listenSelfOn") : t("settings.listenSelfOff")}
                    onClick={onToggleSelfMonitor}
                  >
                    <span className="ui-switch-thumb" aria-hidden="true" />
                  </button>
                </label>
                <label className="voice-sound-checkbox flex items-center justify-between gap-3">
                  <span>{t("settings.useRnn")}</span>
                  <button
                    type="button"
                    className={`ui-switch ${noiseSuppressionEnabled ? "ui-switch-on" : ""}`}
                    role="switch"
                    aria-checked={noiseSuppressionEnabled}
                    aria-label={t("settings.useRnn")}
                    data-tooltip={noiseSuppressionEnabled ? t("rtc.noiseReductionOn") : t("rtc.noiseReductionOff")}
                    onClick={onToggleNoiseSuppression}
                  >
                    <span className="ui-switch-thumb" aria-hidden="true" />
                  </button>
                </label>
                <p className="muted media-devices-warning">{t("settings.rnnClientHint")}</p>
                {noiseSuppressionEnabled ? (
                  <>
                    <label className="grid gap-2">
                      <span className="subheading">{t("settings.rnnLevel")}</span>
                      <div className="quality-toggle-group" role="radiogroup" aria-label={t("settings.rnnLevel") }>
                        <button
                          type="button"
                          className={`secondary quality-toggle-btn ${rnnoiseSuppressionLevel === "soft" ? "quality-toggle-btn-active" : ""}`}
                          aria-pressed={rnnoiseSuppressionLevel === "soft"}
                          onClick={() => onSetRnnoiseSuppressionLevel("soft")}
                        >
                          {t("settings.rnnLevelSoft")}
                        </button>
                        <button
                          type="button"
                          className={`secondary quality-toggle-btn ${rnnoiseSuppressionLevel === "medium" ? "quality-toggle-btn-active" : ""}`}
                          aria-pressed={rnnoiseSuppressionLevel === "medium"}
                          onClick={() => onSetRnnoiseSuppressionLevel("medium")}
                        >
                          {t("settings.rnnLevelMedium")}
                        </button>
                        <button
                          type="button"
                          className={`secondary quality-toggle-btn ${rnnoiseSuppressionLevel === "strong" ? "quality-toggle-btn-active" : ""}`}
                          aria-pressed={rnnoiseSuppressionLevel === "strong"}
                          onClick={() => onSetRnnoiseSuppressionLevel("strong")}
                        >
                          {t("settings.rnnLevelStrong")}
                        </button>
                      </div>
                    </label>
                    <p className="muted media-devices-warning">{t("settings.rnnLevelHint")}</p>
                    <p className="muted media-devices-warning">
                      {rnnoiseRuntimeStatus === "active"
                        ? t("settings.rnnStatusActive")
                        : rnnoiseRuntimeStatus === "unavailable"
                          ? t("settings.rnnStatusUnavailable")
                          : rnnoiseRuntimeStatus === "error"
                            ? t("settings.rnnStatusError")
                            : t("settings.rnnStatusInactive")}
                    </p>
                  </>
                ) : null}
              </div>
            </>
          ) : userSettingsTab === "camera" ? (
            <>
              <div className="voice-preferences-grid grid gap-3 desktop:grid-cols-1">
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
                  <button
                    type="button"
                    className={`ui-switch ${serverSoundsEnabled.member_join ? "ui-switch-on" : ""}`}
                    role="switch"
                    aria-checked={serverSoundsEnabled.member_join}
                    aria-label={t("settings.serverSoundMemberJoin")}
                    onClick={() => onSetServerSoundEnabled("member_join", !serverSoundsEnabled.member_join)}
                  >
                    <span className="ui-switch-thumb" aria-hidden="true" />
                  </button>
                  <button type="button" className="secondary icon-btn tiny" onClick={() => onPreviewServerSound("member_join")}>♪</button>
                </div>
              </label>

              <label className="voice-sound-checkbox flex items-center justify-between gap-3">
                <span>{t("settings.serverSoundMemberLeave")}</span>
                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    className={`ui-switch ${serverSoundsEnabled.member_leave ? "ui-switch-on" : ""}`}
                    role="switch"
                    aria-checked={serverSoundsEnabled.member_leave}
                    aria-label={t("settings.serverSoundMemberLeave")}
                    onClick={() => onSetServerSoundEnabled("member_leave", !serverSoundsEnabled.member_leave)}
                  >
                    <span className="ui-switch-thumb" aria-hidden="true" />
                  </button>
                  <button type="button" className="secondary icon-btn tiny" onClick={() => onPreviewServerSound("member_leave")}>♪</button>
                </div>
              </label>

              <label className="voice-sound-checkbox flex items-center justify-between gap-3">
                <span>{t("settings.serverSoundDisconnected")}</span>
                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    className={`ui-switch ${serverSoundsEnabled.server_disconnected ? "ui-switch-on" : ""}`}
                    role="switch"
                    aria-checked={serverSoundsEnabled.server_disconnected}
                    aria-label={t("settings.serverSoundDisconnected")}
                    onClick={() => onSetServerSoundEnabled("server_disconnected", !serverSoundsEnabled.server_disconnected)}
                  >
                    <span className="ui-switch-thumb" aria-hidden="true" />
                  </button>
                  <button type="button" className="secondary icon-btn tiny" onClick={() => onPreviewServerSound("server_disconnected")}>♪</button>
                </div>
              </label>

              <label className="voice-sound-checkbox flex items-center justify-between gap-3">
                <span>{t("settings.serverSoundChatMessage")}</span>
                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    className={`ui-switch ${serverSoundsEnabled.chat_message ? "ui-switch-on" : ""}`}
                    role="switch"
                    aria-checked={serverSoundsEnabled.chat_message}
                    aria-label={t("settings.serverSoundChatMessage")}
                    onClick={() => onSetServerSoundEnabled("chat_message", !serverSoundsEnabled.chat_message)}
                  >
                    <span className="ui-switch-thumb" aria-hidden="true" />
                  </button>
                  <button type="button" className="secondary icon-btn tiny" onClick={() => onPreviewServerSound("chat_message")}>♪</button>
                </div>
              </label>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
