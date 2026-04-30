/**
 * AppGuardsAndOverlays.tsx — оверлеи и гарды верхнего уровня поверх AppShell.
 *
 * Назначение:
 * - Экраны входа/онбординга (`GuestLoginGate`, `EmptyServerOnboarding`).
 * - Оверлеи 18+/обновления приложения, блокировок/ошибок.
 * - Объединяет все блокирующие UI-слои, чтобы AppShell оставался лаконичным.
 */
import { useRef, useState, type MouseEvent } from "react";
import type { UiTheme } from "../domain";
import { LegalLinks } from "./LegalLinks";
import { Button, PixelCheckbox, PopupPortal } from "./uicomponents";
import { asTrimmedString } from "../utils/stringUtils";

function detectUiLang(): "ru" | "en" {
  return document.documentElement.lang === "en" ? "en" : "ru";
}

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
            : "Вы вошли в Dato Desktop. Эту вкладку можно закрыть."}
        </p>
        <div className="mt-5 flex justify-center">
          <Button
            type="button"
            className="secondary"
            onClick={handleOpenWebVersion}
          >
            Открыть веб-версию
          </Button>
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
          <Button
            type="button"
            className="secondary"
            onClick={onRefresh}
          >
            {t("access.refresh")}
          </Button>
          <Button
            type="button"
            className="secondary"
            onClick={onLogout}
          >
            {t("access.logout")}
          </Button>
        </div>
      </section>
    </main>
  );
}

export function DeletedAccountGate({
  t,
  daysRemaining,
  restoring,
  onRestore,
  onLogout
}: {
  t: Translate;
  daysRemaining: number;
  restoring: boolean;
  onRestore: () => void;
  onLogout: () => void;
}) {
  return (
    <main className="app legacy-layout mx-auto grid h-[100dvh] max-h-[100dvh] w-full max-w-[760px] place-items-center p-6">
      <section className="settings-sheet w-full max-w-[560px] p-6 text-center">
        <h1 className="text-2xl font-semibold">{t("account.deletedTitle")}</h1>
        <p className="mt-3 text-sm opacity-80">
          {t("account.deletedMessagePrefix")} {daysRemaining} {t("account.deletedMessageSuffix")}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button
            type="button"
            className="secondary"
            disabled={restoring}
            onClick={onRestore}
          >
            {restoring ? t("account.restoring") : t("account.restore")}
          </Button>
          <Button
            type="button"
            className="secondary"
            onClick={onLogout}
          >
            {t("access.logout")}
          </Button>
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
      <Button
        type="button"
        className="secondary"
        disabled={desktopUpdateApplying}
        onClick={onDismiss}
      >
        {t("desktop.updateLater")}
      </Button>
      <Button
        type="button"
        className="secondary"
        disabled={desktopUpdateApplying}
        onClick={onApply}
      >
        {desktopUpdateApplying ? t("desktop.updateApplying") : t("desktop.updateRestartNow")}
      </Button>
    </div>
  );
}

export function MediaAccessDeniedBanner({ t, onRequestMediaAccess }: { t: Translate; onRequestMediaAccess: () => void }) {
  return (
    <div className="mic-denied-banner" role="status" aria-live="polite">
      <span>{t("mic.deniedBanner")}</span>
      <Button type="button" className="secondary" onClick={onRequestMediaAccess}>
        {t("settings.requestMediaAccess")}
      </Button>
    </div>
  );
}

export function RemoteAudioAutoplayBanner({ t }: { t: Translate }) {
  return (
    <div className="mic-denied-banner mic-denied-banner-info" role="status" aria-live="polite">
      <span>{t("rtc.autoplayBlockedHint")}</span>
    </div>
  );
}

export function GuestLoginGate({ t, onBeginSso }: { t: Translate; onBeginSso: (provider: "google" | "yandex") => void }) {
  const lang = detectUiLang();
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const authMenuRef = useRef<HTMLDivElement>(null);

  return (
    <section className="grid h-full min-h-0 place-items-center p-2">
      <div className="card w-full max-w-xl p-8 text-center">
        <h2 className="text-2xl font-bold text-pixel-text">{t("guest.welcomeTitle")}</h2>
        <p className="mt-3 text-sm leading-relaxed text-pixel-muted">{t("guest.welcomePromo")}</p>
        <div className="mt-6 inline-grid" ref={authMenuRef}>
          <Button
            type="button"
            className="inline-flex min-h-[42px] items-center justify-center px-5"
            onClick={() => setAuthMenuOpen((value) => !value)}
            aria-expanded={authMenuOpen}
            aria-label={t("auth.login")}
          >
            {t("guest.loginCta")}
          </Button>
          <PopupPortal open={authMenuOpen} anchorRef={authMenuRef} className="auth-popup" placement="bottom-end">
            <div className="grid gap-2">
              <Button
                type="button"
                className="provider-btn w-full flex items-center justify-start gap-3"
                onClick={() => {
                  setAuthMenuOpen(false);
                  onBeginSso("google");
                }}
              >
                <span className="provider-icon provider-google inline-flex h-5 w-5 items-center justify-center">G</span>
                {t("auth.google")}
              </Button>
              <Button
                type="button"
                className="provider-btn w-full flex items-center justify-start gap-3"
                onClick={() => {
                  setAuthMenuOpen(false);
                  onBeginSso("yandex");
                }}
              >
                <span className="provider-icon provider-yandex inline-flex h-5 w-5 items-center justify-center">Я</span>
                {t("auth.yandex")}
              </Button>
            </div>
          </PopupPortal>
        </div>
        <div className="mt-5 border-t border-white/10 pt-3">
          <LegalLinks compact lang={lang} />
        </div>
      </div>
    </section>
  );
}

export function EmptyServerOnboarding({
  t,
  creatingServer,
  onCreateServer
}: {
  t: Translate;
  creatingServer: boolean;
  onCreateServer: (name: string) => Promise<void>;
}) {
  const [serverName, setServerName] = useState("");

  const submit = async () => {
    const trimmed = asTrimmedString(serverName);
    if (!trimmed || creatingServer) {
      return;
    }

    await onCreateServer(trimmed);
    setServerName("");
  };

  return (
    <section className="grid h-full min-h-0 place-items-center p-2">
      <div className="card w-full max-w-xl p-8 text-center">
        <h2 className="text-2xl font-bold text-pixel-text">{t("server.onboardingTitle")}</h2>
        <p className="mt-3 text-sm leading-relaxed text-pixel-muted">{t("server.onboardingHint")}</p>
        <p className="mt-2 text-xs leading-relaxed text-pixel-muted/85">{t("server.onboardingSubHint")}</p>
        <label className="mt-5 grid gap-2 text-left">
          <span className="muted">{t("server.createTitle")}</span>
          <input
            value={serverName}
            maxLength={64}
            onChange={(event) => setServerName(event.target.value)}
            placeholder={t("server.createPlaceholder")}
          />
        </label>
        <Button
          type="button"
          className="mt-6 inline-flex min-h-[42px] items-center justify-center px-5"
          onClick={() => {
            void submit();
          }}
          disabled={creatingServer || serverName.trim().length < 3}
        >
          {creatingServer ? t("server.createLoading") : t("server.onboardingCta")}
        </Button>
      </div>
    </section>
  );
}

export function AppUpdatedOverlay({ t, onContinue }: { t: Translate; onContinue: () => void }) {
  return (
    <div className="voice-preferences-overlay fixed inset-0 z-[300] grid place-items-center p-4" role="dialog" aria-modal="true" aria-live="polite">
      <div className="card voice-preferences-modal w-full max-w-[560px] !h-auto !max-h-[90vh] overflow-auto p-6 text-center">
        <h2>{t("overlay.appUpdatedTitle")}</h2>
        <p className="mt-3 muted">{t("overlay.appUpdatedMessage")}</p>
        <Button
          type="button"
          className="primary mt-6 inline-flex w-full items-center justify-center"
          onClick={onContinue}
          autoFocus
        >
          {t("overlay.appUpdatedContinue")}
        </Button>
      </div>
    </div>
  );
}

export function FirstRunIntroOverlay({
  t,
  profileNameDraft,
  selectedUiTheme,
  onChangeProfileName,
  onChangeTheme,
  profileSaving,
  onContinue
}: {
  t: Translate;
  profileNameDraft: string;
  selectedUiTheme: UiTheme;
  onChangeProfileName: (value: string) => void;
  onChangeTheme: (value: UiTheme) => void;
  profileSaving: boolean;
  onContinue: () => void;
}) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [legalDoc, setLegalDoc] = useState<"terms" | "privacy" | null>(null);

  const openLegalDoc = (doc: "terms" | "privacy") => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setLegalDoc(doc);
  };

  return (
    <div className="voice-preferences-overlay fixed inset-0 z-[305] grid place-items-center p-4" role="dialog" aria-modal="true" aria-live="polite">
      <section className="card voice-preferences-modal w-full max-w-[560px] desktop:max-w-[420px] !h-auto !max-h-[90vh] overflow-auto p-6 text-center">
        <h2 className="text-[34px] leading-none">{t("intro.title")}</h2>
        <p className="mt-4 muted">{t("intro.description")}</p>

        <label className="mt-6 mx-auto grid w-full max-w-[340px] desktop:max-w-[300px] gap-2">
          <span className="subheading text-center">{t("intro.displayNameLabel")}</span>
          <input
            value={profileNameDraft}
            onChange={(event) => onChangeProfileName(event.target.value)}
            placeholder={t("settings.displayName")}
          />
        </label>

        <label className="mt-3 mx-auto grid w-full max-w-[340px] desktop:max-w-[300px] gap-2">
          <span className="subheading text-center">{t("intro.skinLabel")}</span>
          <select
            value={selectedUiTheme}
            onChange={(event) => onChangeTheme(event.target.value as UiTheme)}
          >
            <option value="8-neon-bit">{t("settings.theme8NeonBit")}</option>
            <option value="material-classic">{t("settings.themeMaterialClassic")}</option>
            <option value="aka-dis">{t("settings.themeAkaDis")}</option>
            <option value="alpha-strike">{t("settings.themeAlphaStrike")}</option>
          </select>
        </label>

        <div className="mt-5 grid justify-items-center gap-2">
          <PixelCheckbox
            checked={termsAccepted}
            onChange={setTermsAccepted}
            ariaLabel={t("intro.acceptTermsPrefix")}
            label={(
              <span className="muted text-sm">
              {t("intro.acceptTermsPrefix")}{" "}
              <a
                href="/terms"
                className="legal-doc-inline-link underline underline-offset-2"
                onClick={openLegalDoc("terms")}
              >
                {t("intro.termsLink")}
              </a>
              </span>
            )}
          />
          <PixelCheckbox
            checked={privacyAccepted}
            onChange={setPrivacyAccepted}
            ariaLabel={t("intro.acceptPrivacyPrefix")}
            label={(
              <span className="muted text-sm">
              {t("intro.acceptPrivacyPrefix")}{" "}
              <a
                href="/privacy"
                className="legal-doc-inline-link underline underline-offset-2"
                onClick={openLegalDoc("privacy")}
              >
                {t("intro.privacyLink")}
              </a>
              </span>
            )}
          />
        </div>

        <Button
          type="button"
          className="primary mt-6 inline-flex min-h-[42px] min-w-[280px] desktop:min-w-[240px] items-center justify-center px-6"
          disabled={profileSaving || !termsAccepted || !privacyAccepted}
          disabledReason={!profileSaving && (!termsAccepted || !privacyAccepted) ? t("intro.continueDisabledReason") : undefined}
          onClick={onContinue}
        >
          {profileSaving ? t("settings.saving") : t("intro.continueCta")}
        </Button>
      </section>

      {legalDoc ? (
        <div className="legal-doc-modal-backdrop fixed inset-0 z-[306] grid place-items-center p-4" role="dialog" aria-modal="true">
          <section className="legal-doc-modal-sheet card w-full max-w-[760px] p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold">
                {legalDoc === "terms" ? t("intro.termsLink") : t("intro.privacyLink")}
              </h3>
              <Button
                type="button"
                className="secondary"
                onClick={() => setLegalDoc(null)}
              >
                {t("intro.legalClose")}
              </Button>
            </div>
            <iframe
              title={legalDoc === "terms" ? t("intro.termsLink") : t("intro.privacyLink")}
              src={legalDoc === "terms" ? "/terms?embed=1" : "/privacy?embed=1"}
              className="legal-doc-modal-frame h-[58vh] w-full rounded"
            />
          </section>
        </div>
      ) : null}
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
        <Button
          type="button"
          className="primary mt-6 inline-flex w-full items-center justify-center"
          onClick={onReopenHere}
        >
          Открыть здесь
        </Button>
      </section>
    </div>
  );
}

export function AgeVerificationRequiredOverlay({
  t,
  roomSlug,
  confirming,
  onOpenAgeSettings,
  onConfirmAgeAndRetry,
  onClose
}: {
  t: Translate;
  roomSlug: string;
  confirming: boolean;
  onOpenAgeSettings: () => void;
  onConfirmAgeAndRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div className="voice-preferences-overlay fixed inset-0 z-[315] grid place-items-center p-4" role="dialog" aria-modal="true" aria-live="assertive">
      <section className="card voice-preferences-modal w-full max-w-[620px] !h-auto !max-h-[90vh] overflow-auto p-6 text-center">
        <h2>{t("rooms.ageGateOverlayTitle")}</h2>
        <p className="mt-3 muted">{t("rooms.ageGateOverlayHint").replace("{room}", roomSlug)}</p>
        <div className="mt-6 grid gap-2">
          <Button
            type="button"
            className="secondary"
            onClick={onOpenAgeSettings}
          >
            {t("rooms.ageGateOverlayOpenProfile")}
          </Button>
          <Button
            type="button"
            className="primary"
            disabled={confirming}
            onClick={onConfirmAgeAndRetry}
          >
            {confirming ? t("settings.ageConfirmActionLoading") : t("rooms.ageGateOverlayConfirmAndRetry")}
          </Button>
          <Button
            type="button"
            className="secondary"
            onClick={onClose}
          >
            {t("common.no")}
          </Button>
        </div>
      </section>
    </div>
  );
}
