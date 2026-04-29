/**
 * AppTopChrome.tsx — "обвязка" верхней части приложения (хедер + всплывающие элементы).
 *
 * Назначение:
 * - Комбинирует `AppHeader` с оверлеями профиля и другими popover’ами.
 * - Передаёт ref’ы и обработчики без хранения собственного состояния.
 */
import type { RefObject } from "react";
import { AppHeader } from "./AppHeader";
import {
  DesktopUpdateBanner,
  MediaAccessDeniedBanner,
  RemoteAudioAutoplayBanner
} from "./AppGuardsAndOverlays";
import { TooltipPortal } from "../TooltipPortal";
import type { ServerListItem, User } from "../domain";
import type { TranslateFn } from "../i18n";

type AppTopChromeProps = {
  t: TranslateFn;
  user: User | null;
  currentServerName: string | null;
  servers: ServerListItem[];
  currentServerId: string;
  creatingServer: boolean;
  creatingInvite: boolean;
  lastInviteUrl: string;
  buildDateLabel: string;
  pendingJoinRequestsCount: number;
  appMenuOpen: boolean;
  authMenuOpen: boolean;
  profileMenuOpen: boolean;
  authMenuRef: RefObject<HTMLDivElement>;
  profileMenuRef: RefObject<HTMLDivElement>;
  onToggleAppMenu: () => void;
  onToggleAuthMenu: () => void;
  onToggleProfileMenu: () => void;
  onBeginSso: (provider: "google" | "yandex") => void;
  onLogout: () => void;
  onOpenUserSettings: () => void;
  onChangeCurrentServer: (serverId: string) => void;
  onCreateServer: (name: string) => Promise<void>;
  onCreateServerInviteAndCopy: () => Promise<void>;
  mediaDevicesState: "ready" | "unsupported" | "denied" | "error";
  onRequestMediaAccess: () => void;
  remoteAudioAutoplayBlocked: boolean;
  audioMuted: boolean;
  desktopUpdateReadyVersion: string;
  desktopUpdateBannerDismissed: boolean;
  desktopUpdateApplying: boolean;
  onDismissDesktopUpdateBanner: () => void;
  onApplyDesktopUpdate: () => Promise<void>;
};

export function AppTopChrome({
  t,
  user,
  currentServerName,
  servers,
  currentServerId,
  creatingServer,
  creatingInvite,
  lastInviteUrl,
  buildDateLabel,
  pendingJoinRequestsCount,
  appMenuOpen,
  authMenuOpen,
  profileMenuOpen,
  authMenuRef,
  profileMenuRef,
  onToggleAppMenu,
  onToggleAuthMenu,
  onToggleProfileMenu,
  onBeginSso,
  onLogout,
  onOpenUserSettings,
  onChangeCurrentServer,
  onCreateServer,
  onCreateServerInviteAndCopy,
  mediaDevicesState,
  onRequestMediaAccess,
  remoteAudioAutoplayBlocked,
  audioMuted,
  desktopUpdateReadyVersion,
  desktopUpdateBannerDismissed,
  desktopUpdateApplying,
  onDismissDesktopUpdateBanner,
  onApplyDesktopUpdate
}: AppTopChromeProps) {
  return (
    <>
      <AppHeader
        t={t}
        user={user}
        currentServerName={currentServerName}
        servers={servers}
        currentServerId={currentServerId}
        creatingServer={creatingServer}
        creatingInvite={creatingInvite}
        lastInviteUrl={lastInviteUrl}
        buildDateLabel={buildDateLabel}
        pendingJoinRequestsCount={pendingJoinRequestsCount}
        appMenuOpen={appMenuOpen}
        authMenuOpen={authMenuOpen}
        profileMenuOpen={profileMenuOpen}
        authMenuRef={authMenuRef}
        profileMenuRef={profileMenuRef}
        onToggleAppMenu={onToggleAppMenu}
        onToggleAuthMenu={onToggleAuthMenu}
        onToggleProfileMenu={onToggleProfileMenu}
        onBeginSso={onBeginSso}
        onLogout={onLogout}
        onOpenUserSettings={onOpenUserSettings}
        onChangeCurrentServer={onChangeCurrentServer}
        onCreateServer={onCreateServer}
        onCreateServerInviteAndCopy={onCreateServerInviteAndCopy}
      />
      <TooltipPortal />

      {mediaDevicesState === "denied" ? <MediaAccessDeniedBanner t={t} onRequestMediaAccess={onRequestMediaAccess} /> : null}

      {remoteAudioAutoplayBlocked && !audioMuted && mediaDevicesState !== "denied" && !(desktopUpdateReadyVersion && !desktopUpdateBannerDismissed)
        ? <RemoteAudioAutoplayBanner t={t} />
        : null}

      {desktopUpdateReadyVersion && !desktopUpdateBannerDismissed ? (
        <DesktopUpdateBanner
          t={t}
          desktopUpdateReadyVersion={desktopUpdateReadyVersion}
          desktopUpdateApplying={desktopUpdateApplying}
          onDismiss={onDismissDesktopUpdateBanner}
          onApply={() => {
            void onApplyDesktopUpdate();
          }}
        />
      ) : null}
    </>
  );
}