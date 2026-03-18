import type { UiTheme } from "../domain";

type Translate = (key: string) => string;

export function DesktopBrowserCompletionGate({ desktopHandoffError }: { desktopHandoffError: string }) {
  const handleOpenWebVersion = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("desktop_handoff");
    url.searchParams.delete("desktop_handoff_bootstrap");
    url.searchParams.delete("desktop_handoff_refreshed");
    url.searchParams.delete("desktop_handoff_sent");
    url.searchParams.delete("desktop_handoff_attempt");
    url.searchParams.delete("desktop_handoff_complete");
    url.searchParams.delete("desktop_handoff_error");
    window.location.replace(url.toString());
  };

  return (
    <main className="app legacy-layout mx-auto grid h-[100dvh] max-h-[100dvh] w-full max-w-[760px] place-items-center p-6">
      <section className="settings-sheet w-full max-w-[560px] p-6 text-center">
        <h1 className="text-2xl font-semibold">Авторизация завершена</h1>
        <p className="mt-3 text-sm opacity-80">
          {desktopHandoffError
            ? "Не удалось подтвердить вход в Desktop. Попробуйте открыть приложение еще раз."
            : "Вы вошли в Boltorezka Desktop. Эту вкладку можно закрыть."}
        </p>
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            className="secondary"
            onClick={handleOpenWebVersion}
          >
            Открыть веб-версию
          </button>
        </div>
      </section>
    </main>
  );
}

export function AccessStateGate({
  blocked,
  pendingAccessRefreshInSec,
  t,
  onRefresh,
  onLogout
}: {
  blocked: boolean;
  pendingAccessRefreshInSec: number;
  t: Translate;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  return (
    <main className="app legacy-layout mx-auto grid h-[100dvh] max-h-[100dvh] w-full max-w-[760px] place-items-center p-6">
      <section className="settings-sheet w-full max-w-[560px] p-6 text-center">
        <h1 className="text-2xl font-semibold">
          {blocked ? t("access.blockedTitle") : t("access.pendingTitle")}
        </h1>
        <p className="mt-3 text-sm opacity-80">
          {blocked ? t("access.blockedMessage") : t("access.pendingMessage")}
        </p>
        {!blocked ? (
          <>
            <p className="mt-2 text-sm opacity-80">{t("access.pendingQueueHint")}</p>
            <p className="mt-1 text-xs opacity-70">
              {t("access.autoRefreshPrefix")} {pendingAccessRefreshInSec} {t("access.autoRefreshSuffix")}
            </p>
          </>
        ) : null}
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            className="secondary"
            onClick={onRefresh}
          >
            {t("access.refresh")}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={onLogout}
          >
            {t("access.logout")}
          </button>
        </div>
      </section>
    </main>
  );
}

export function DesktopUpdateBanner({
  t,
  desktopUpdateReadyVersion,
  desktopUpdateApplying,
  onDismiss,
  onApply
}: {
  t: Translate;
  desktopUpdateReadyVersion: string;
  desktopUpdateApplying: boolean;
  onDismiss: () => void;
  onApply: () => void;
}) {
  return (
    <div className="mic-denied-banner" role="status" aria-live="polite">
      <span>{`${t("desktop.updateReadyBanner")} ${desktopUpdateReadyVersion}`}</span>
      <button
        type="button"
        className="secondary"
        disabled={desktopUpdateApplying}
        onClick={onDismiss}
      >
        {t("desktop.updateLater")}
      </button>
      <button
        type="button"
        className="secondary"
        disabled={desktopUpdateApplying}
        onClick={onApply}
      >
        {desktopUpdateApplying ? t("desktop.updateApplying") : t("desktop.updateRestartNow")}
      </button>
    </div>
  );
}

export function MediaAccessDeniedBanner({ t, onRequestMediaAccess }: { t: Translate; onRequestMediaAccess: () => void }) {
  return (
    <div className="mic-denied-banner" role="status" aria-live="polite">
      <span>{t("mic.deniedBanner")}</span>
      <button type="button" className="secondary" onClick={onRequestMediaAccess}>
        {t("settings.requestMediaAccess")}
      </button>
    </div>
  );
}

export function GuestLoginGate({ t, onBeginGoogleSso }: { t: Translate; onBeginGoogleSso: () => void }) {
  return (
    <section className="grid h-full min-h-0 place-items-center p-2">
      <div className="card w-full max-w-xl p-8 text-center">
        <h2 className="text-2xl font-bold text-pixel-text">{t("guest.welcomeTitle")}</h2>
        <p className="mt-3 text-sm leading-relaxed text-pixel-muted">{t("guest.welcomePromo")}</p>
        <button
          type="button"
          className="mt-6 inline-flex min-h-[42px] items-center justify-center px-5"
          onClick={onBeginGoogleSso}
        >
          {t("guest.loginCta")}
        </button>
      </div>
    </section>
  );
}

export function AppUpdatedOverlay({ t, onContinue }: { t: Translate; onContinue: () => void }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-live="polite">
      <div className="w-full max-w-md rounded-2xl border border-white/20 bg-neutral-950/95 p-6 text-center shadow-2xl">
        <h2 className="text-2xl font-bold tracking-wide text-white">{t("overlay.appUpdatedTitle")}</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/80">{t("overlay.appUpdatedMessage")}</p>
        <button
          type="button"
          className="primary mt-6 inline-flex w-full items-center justify-center"
          onClick={onContinue}
          autoFocus
        >
          {t("overlay.appUpdatedContinue")}
        </button>
      </div>
    </div>
  );
}

export function FirstRunIntroOverlay({
  t,
  selectedUiTheme,
  onSelectTheme,
  profileNameDraft,
  onChangeProfileName,
  profileSaving,
  onContinue
}: {
  t: Translate;
  selectedUiTheme: UiTheme;
  onSelectTheme: (theme: UiTheme) => void;
  profileNameDraft: string;
  onChangeProfileName: (value: string) => void;
  profileSaving: boolean;
  onContinue: () => void;
}) {
  return (
    <div className="voice-preferences-overlay fixed inset-0 z-[305] grid place-items-center p-4" role="dialog" aria-modal="true" aria-live="polite">
      <section className="card voice-preferences-modal w-full max-w-[620px] !h-auto !max-h-[90vh] overflow-auto p-6">
        <h2>{t("intro.title")}</h2>
        <p className="muted">{t("intro.description")}</p>

        <div className="mt-5 grid gap-2">
          <span className="subheading">{t("intro.skinLabel")}</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              className={`secondary min-h-[40px] ${selectedUiTheme === "8-neon-bit" ? "user-settings-tab-btn-active" : ""}`}
              onClick={() => onSelectTheme("8-neon-bit")}
            >
              {t("settings.theme8NeonBit")}
            </button>
            <button
              type="button"
              className={`secondary min-h-[40px] ${selectedUiTheme === "material-classic" ? "user-settings-tab-btn-active" : ""}`}
              onClick={() => onSelectTheme("material-classic")}
            >
              {t("settings.themeMaterialClassic")}
            </button>
          </div>
        </div>

        <label className="mt-5 grid gap-2">
          <span className="subheading">{t("intro.displayNameLabel")}</span>
          <input
            value={profileNameDraft}
            onChange={(event) => onChangeProfileName(event.target.value)}
            placeholder={t("settings.displayName")}
          />
        </label>

        <button
          type="button"
          className="primary mt-6 inline-flex w-full min-h-[42px] items-center justify-center"
          disabled={profileSaving}
          onClick={onContinue}
        >
          {profileSaving ? t("settings.saving") : t("intro.continueCta")}
        </button>
      </section>
    </div>
  );
}

export function SessionMovedOverlay({ message, onReopenHere }: { message: string; onReopenHere: () => void }) {
  return (
    <div className="voice-preferences-overlay fixed inset-0 z-[310] grid place-items-center p-4" role="dialog" aria-modal="true" aria-live="assertive">
      <section className="card voice-preferences-modal w-full max-w-[620px] !h-auto !max-h-[90vh] overflow-auto p-6 text-center">
        <h2>Приложение открыто в другом месте</h2>
        <p className="mt-3 muted">
          Эта сессия перенесена в другое окно или вкладку. Работа с каналами здесь остановлена.
        </p>
        <p className="mt-2 text-xs muted">{message}</p>
        <button
          type="button"
          className="primary mt-6 inline-flex w-full items-center justify-center"
          onClick={onReopenHere}
        >
          Открыть здесь
        </button>
      </section>
    </div>
  );
}
