/**
 * AppShellOverlays.tsx — сборка всех оверлеев, рисуемых поверх AppShell.
 *
 * Назначение:
 * - Рендерит тосты, модальные окна, экран 18+, уведомления об обновлении и блокировки.
 * - Не имеет состояния — всё приходит в props.
 */
import {
  AgeVerificationRequiredOverlay,
  AppUpdatedOverlay,
  FirstRunIntroOverlay,
  SessionMovedOverlay
} from "./AppGuardsAndOverlays";
import { CookieConsentBanner } from "./CookieConsentBanner";
import { LegalLinks } from "./LegalLinks";
import { ToastStack } from "./ToastStack";
import type { AppToast } from "../hooks";
import type { Lang, TranslateFn } from "../i18n";
import type { UiTheme, User } from "../domain";

type AppShellOverlaysProps = {
  toasts: AppToast[];
  showAppUpdatedOverlay: boolean;
  t: TranslateFn;
  acknowledgeUpdatedApp: () => void;
  user: User | null;
  showFirstRunIntro: boolean;
  profileNameDraft: string;
  selectedUiTheme: UiTheme;
  setProfileNameDraft: (value: string) => void;
  setSelectedUiTheme: (value: UiTheme) => void;
  profileSaving: boolean;
  completeFirstRunIntro: () => Promise<void>;
  sessionMovedOverlayMessage: string;
  setSessionMovedOverlayMessage: (value: string) => void;
  ageGateBlockedRoomSlug: string;
  serverAgeConfirming: boolean;
  openUserSettings: (tab: "profile" | "sound" | "camera") => void;
  handleConfirmServerAge: () => Promise<void>;
  setAgeGateBlockedRoomSlug: (value: string) => void;
  joinRoom: (slug: string) => void;
  lang: Lang;
  cookieConsentAccepted: boolean;
  onAcceptCookieConsent: () => void;
};

export function AppShellOverlays({
  toasts,
  showAppUpdatedOverlay,
  t,
  acknowledgeUpdatedApp,
  user,
  showFirstRunIntro,
  profileNameDraft,
  selectedUiTheme,
  setProfileNameDraft,
  setSelectedUiTheme,
  profileSaving,
  completeFirstRunIntro,
  sessionMovedOverlayMessage,
  setSessionMovedOverlayMessage,
  ageGateBlockedRoomSlug,
  serverAgeConfirming,
  openUserSettings,
  handleConfirmServerAge,
  setAgeGateBlockedRoomSlug,
  joinRoom,
  lang,
  cookieConsentAccepted,
  onAcceptCookieConsent
}: AppShellOverlaysProps) {
  return (
    <>
      <ToastStack toasts={toasts} />

      {showAppUpdatedOverlay ? <AppUpdatedOverlay t={t} onContinue={acknowledgeUpdatedApp} /> : null}

      {user && showFirstRunIntro ? (
        <FirstRunIntroOverlay
          t={t}
          profileNameDraft={profileNameDraft}
          selectedUiTheme={selectedUiTheme}
          onChangeProfileName={setProfileNameDraft}
          onChangeTheme={setSelectedUiTheme}
          profileSaving={profileSaving}
          onContinue={() => {
            void completeFirstRunIntro();
          }}
        />
      ) : null}

      {sessionMovedOverlayMessage ? (
        <SessionMovedOverlay
          message={sessionMovedOverlayMessage}
          onReopenHere={() => {
            setSessionMovedOverlayMessage("");
            window.location.reload();
          }}
        />
      ) : null}

      {ageGateBlockedRoomSlug ? (
        <AgeVerificationRequiredOverlay
          t={t}
          roomSlug={ageGateBlockedRoomSlug}
          confirming={serverAgeConfirming}
          onOpenAgeSettings={() => openUserSettings("profile")}
          onConfirmAgeAndRetry={() => {
            const blockedRoomSlug = ageGateBlockedRoomSlug;
            void (async () => {
              await handleConfirmServerAge();
              setAgeGateBlockedRoomSlug("");
              joinRoom(blockedRoomSlug);
            })();
          }}
          onClose={() => setAgeGateBlockedRoomSlug("")}
        />
      ) : null}

      <footer className="pointer-events-none fixed inset-x-0 bottom-1 z-[150] hidden px-3 desktop:block">
        <div className="mx-auto w-fit rounded-full border border-white/15 bg-black/35 px-4 py-1 backdrop-blur">
          <div className="pointer-events-auto">
            <LegalLinks compact lang={lang} />
          </div>
        </div>
      </footer>

      <CookieConsentBanner
        lang={lang}
        visible={!cookieConsentAccepted}
        onAccept={onAcceptCookieConsent}
      />
    </>
  );
}