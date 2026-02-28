import type { UserDockProps } from "./types";

export function UserDock({
  user,
  currentRoomSupportsRtc,
  currentRoomTitle,
  micMuted,
  audioMuted,
  audioOutputMenuOpen,
  voiceSettingsOpen,
  voicePreferencesOpen,
  voiceSettingsPanel,
  inputOptions,
  outputOptions,
  selectedInputId,
  selectedOutputId,
  selectedInputProfile,
  inputProfileLabel,
  currentInputLabel,
  micVolume,
  outputVolume,
  audioOutputAnchorRef,
  voiceSettingsAnchorRef,
  voicePreferencesRef,
  onToggleMic,
  onToggleAudio,
  onToggleVoiceSettings,
  onToggleAudioOutput,
  onSetVoiceSettingsOpen,
  onSetAudioOutputMenuOpen,
  onSetVoiceSettingsPanel,
  onSetVoicePreferencesOpen,
  onSetSelectedInputId,
  onSetSelectedOutputId,
  onSetSelectedInputProfile,
  onSetMicVolume,
  onSetOutputVolume
}: UserDockProps) {
  return (
    <>
      <div className="user-dock">
        {currentRoomSupportsRtc ? (
          <section className="card compact rtc-connection-card">
            <div className="rtc-title-row">
              <div>
                <div className="rtc-title">Подключение к RTC</div>
                <div className="muted rtc-subtitle">{currentRoomTitle}</div>
              </div>
              <div className="rtc-top-actions">
                <button type="button" className="secondary icon-btn tiny" data-tooltip="Mute connection">
                  <i className="bi bi-soundwave" aria-hidden="true" />
                </button>
                <button type="button" className="secondary icon-btn tiny" data-tooltip="Disconnect">
                  <i className="bi bi-telephone-x" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="rtc-actions-grid">
              <button type="button" className="secondary" data-tooltip="Noise reduction">
                <i className="bi bi-sliders" aria-hidden="true" />
              </button>
              <button type="button" className="secondary" data-tooltip="Screen share">
                <i className="bi bi-display" aria-hidden="true" />
              </button>
              <button type="button" className="secondary" data-tooltip="Effects">
                <i className="bi bi-stars" aria-hidden="true" />
              </button>
              <button type="button" className="secondary" data-tooltip="Activities">
                <i className="bi bi-lightning-charge" aria-hidden="true" />
              </button>
            </div>
          </section>
        ) : null}

        <section className="card compact user-panel-card">
          <div className="user-panel-main">
            <div className="user-avatar-badge">{(user.name || "U").charAt(0).toUpperCase()}</div>
            <div className="user-meta">
              <div className="user-name-line">{user.name}</div>
              <div className="muted user-status-line">{currentRoomSupportsRtc ? "В голосовом чате" : "В сети"}</div>
            </div>
          </div>
          <div className="user-panel-actions">
            <div className="voice-settings-anchor" ref={voiceSettingsAnchorRef}>
              <div className="audio-output-group split-control-group">
                <button
                  type="button"
                  className={`secondary icon-btn split-main-btn ${micMuted ? "icon-btn-danger" : ""}`}
                  data-tooltip={micMuted ? "Включить микрофон" : "Выключить микрофон"}
                  onClick={onToggleMic}
                >
                  <i className={`bi ${micMuted ? "bi-mic-mute-fill" : "bi-mic-fill"}`} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="secondary icon-btn split-caret-btn"
                  data-tooltip="Настройки ввода"
                  onClick={onToggleVoiceSettings}
                >
                  <i className="bi bi-chevron-down" aria-hidden="true" />
                </button>
              </div>
              {voiceSettingsOpen ? (
                <div className="floating-popup settings-popup voice-settings-popup">
                  <div className="voice-menu-items">
                    <button
                      type="button"
                      className={`secondary voice-menu-row ${voiceSettingsPanel === "input_device" ? "voice-menu-row-active" : ""}`}
                      onClick={() => onSetVoiceSettingsPanel(voiceSettingsPanel === "input_device" ? null : "input_device")}
                    >
                      <span className="voice-menu-text">
                        <span className="voice-menu-title">Устройство ввода</span>
                        <span className="voice-menu-subtitle">{currentInputLabel}</span>
                      </span>
                      <i className="bi bi-chevron-right" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`secondary voice-menu-row ${voiceSettingsPanel === "input_profile" ? "voice-menu-row-active" : ""}`}
                      onClick={() => onSetVoiceSettingsPanel(voiceSettingsPanel === "input_profile" ? null : "input_profile")}
                    >
                      <span className="voice-menu-text">
                        <span className="voice-menu-title">Профиль ввода</span>
                        <span className="voice-menu-subtitle">{inputProfileLabel}</span>
                      </span>
                      <i className="bi bi-chevron-right" aria-hidden="true" />
                    </button>
                  </div>

                  <label className="slider-label">
                    Громкость микрофона
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={micVolume}
                      onChange={(event) => onSetMicVolume(Number(event.target.value))}
                    />
                  </label>

                  <div className="voice-level-bars" aria-hidden="true">
                    {Array.from({ length: 20 }).map((_, index) => (
                      <span key={`bar-${index}`} className="voice-level-bar" />
                    ))}
                  </div>

                  <button
                    type="button"
                    className="secondary voice-footer-row"
                    onClick={() => {
                      onSetVoiceSettingsOpen(false);
                      onSetAudioOutputMenuOpen(false);
                      onSetVoiceSettingsPanel(null);
                      onSetVoicePreferencesOpen(true);
                    }}
                  >
                    <span>Настройки голоса</span>
                    <i className="bi bi-gear" aria-hidden="true" />
                  </button>

                  {voiceSettingsPanel === "input_device" ? (
                    <div className="floating-popup settings-popup voice-submenu-popup">
                      <div className="device-list">
                        {inputOptions.map((device) => (
                          <button
                            key={device.id}
                            type="button"
                            className={`secondary device-item radio-item ${selectedInputId === device.id ? "device-item-active" : ""}`}
                            onClick={() => {
                              onSetSelectedInputId(device.id);
                              onSetVoiceSettingsPanel(null);
                            }}
                          >
                            <span>{device.label}</span>
                            <i className={`bi ${selectedInputId === device.id ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
                          </button>
                        ))}
                        <button type="button" className="secondary device-item">Показать больше...</button>
                      </div>
                    </div>
                  ) : null}

                  {voiceSettingsPanel === "input_profile" ? (
                    <div className="floating-popup settings-popup voice-submenu-popup">
                      <div className="device-list">
                        <button
                          type="button"
                          className={`secondary device-item radio-item ${selectedInputProfile === "noise_reduction" ? "device-item-active" : ""}`}
                          onClick={() => {
                            onSetSelectedInputProfile("noise_reduction");
                            onSetVoiceSettingsPanel(null);
                          }}
                        >
                          <span>Изоляция голоса</span>
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
                          <span>Студия</span>
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
                          <span>Пользовательский</span>
                          <i className={`bi ${selectedInputProfile === "custom" ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="audio-output-anchor" ref={audioOutputAnchorRef}>
              <div className="audio-output-group split-control-group">
                <button
                  type="button"
                  className={`secondary icon-btn split-main-btn ${audioMuted ? "icon-btn-danger" : ""}`}
                  data-tooltip={audioMuted ? "Включить звук" : "Отключить звук"}
                  onClick={onToggleAudio}
                >
                  <i className={`bi ${audioMuted ? "bi-volume-mute-fill" : "bi-headphones"}`} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="secondary icon-btn split-caret-btn"
                  data-tooltip="Устройство вывода"
                  onClick={onToggleAudioOutput}
                >
                  <i className="bi bi-chevron-down" aria-hidden="true" />
                </button>
              </div>
              {audioOutputMenuOpen ? (
                <div className="floating-popup settings-popup voice-mini-popup">
                  <div className="subheading">Устройство вывода</div>
                  <div className="device-list">
                    {outputOptions.map((device) => (
                      <button
                        key={device.id}
                        type="button"
                        className={`secondary device-item ${selectedOutputId === device.id ? "device-item-active" : ""}`}
                        onClick={() => onSetSelectedOutputId(device.id)}
                      >
                        {device.label}
                      </button>
                    ))}
                  </div>
                  <label className="slider-label">
                    Громкость звука
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
                      onSetVoicePreferencesOpen(true);
                    }}
                  >
                    <span>Настройки голоса</span>
                    <i className="bi bi-gear" aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      {voicePreferencesOpen ? (
        <div className="voice-preferences-overlay">
          <section className="card voice-preferences-modal" ref={voicePreferencesRef}>
            <div className="voice-preferences-head">
              <div>
                <div className="voice-preferences-kicker">Настройки пользователя</div>
                <h2>Голос и видео</h2>
              </div>
              <button type="button" className="secondary icon-btn" onClick={() => onSetVoicePreferencesOpen(false)} aria-label="Close voice settings">
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>

            <div className="voice-preferences-grid">
              <label className="stack">
                <span className="subheading">Микрофон</span>
                <select value={selectedInputId} onChange={(event) => onSetSelectedInputId(event.target.value)}>
                  {inputOptions.map((device) => (
                    <option key={device.id} value={device.id}>{device.label}</option>
                  ))}
                </select>
              </label>
              <label className="stack">
                <span className="subheading">Динамик</span>
                <select value={selectedOutputId} onChange={(event) => onSetSelectedOutputId(event.target.value)}>
                  {outputOptions.map((device) => (
                    <option key={device.id} value={device.id}>{device.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="voice-preferences-grid">
              <label className="slider-label">
                Громкость микрофона
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={micVolume}
                  onChange={(event) => onSetMicVolume(Number(event.target.value))}
                />
              </label>
              <label className="slider-label">
                Громкость динамика
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
              <button type="button">Проверка микрофона</button>
              <div className="voice-level-bars" aria-hidden="true">
                {Array.from({ length: 42 }).map((_, index) => (
                  <span key={`modal-bar-${index}`} className="voice-level-bar" />
                ))}
              </div>
            </div>

            <div className="voice-divider" />

            <div className="stack">
              <h3 className="subheading">Профиль ввода</h3>
              <button
                type="button"
                className={`secondary device-item radio-item ${selectedInputProfile === "noise_reduction" ? "device-item-active" : ""}`}
                onClick={() => onSetSelectedInputProfile("noise_reduction")}
              >
                <span>Изоляция голоса</span>
                <i className={`bi ${selectedInputProfile === "noise_reduction" ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`secondary device-item radio-item ${selectedInputProfile === "studio" ? "device-item-active" : ""}`}
                onClick={() => onSetSelectedInputProfile("studio")}
              >
                <span>Студия</span>
                <i className={`bi ${selectedInputProfile === "studio" ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`secondary device-item radio-item ${selectedInputProfile === "custom" ? "device-item-active" : ""}`}
                onClick={() => onSetSelectedInputProfile("custom")}
              >
                <span>Пользовательский</span>
                <i className={`bi ${selectedInputProfile === "custom" ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
