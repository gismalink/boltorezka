import type { ComponentProps } from "react";
import { AppWorkspacePanels } from "./AppWorkspacePanels";
import { EmptyServerOnboarding, GuestLoginGate } from "./AppGuardsAndOverlays";
import { ServerProfileModalContainer } from "./ServerProfileModalContainer";
import { UserDock } from "./UserDock";
import type { User } from "../domain";
import type { TranslateFn } from "../i18n";

type AppMainSectionProps = {
  t: TranslateFn;
  user: User | null;
  authMode: string;
  beginSso: (provider: "google" | "yandex") => void;
  showEmptyServerOnboarding: boolean;
  creatingServer: boolean;
  onCreateServer: (name: string) => Promise<void>;
  isMobileViewport: boolean;
  mobileTab: ComponentProps<typeof AppWorkspacePanels>["mobileTab"];
  onSelectMobileTab: ComponentProps<typeof AppWorkspacePanels>["onSelectTab"];
  userDockSharedProps: ComponentProps<typeof AppWorkspacePanels>["userDockSharedProps"];
  roomsPanelProps: ComponentProps<typeof AppWorkspacePanels>["roomsPanelProps"];
  chatPanelProps: ComponentProps<typeof AppWorkspacePanels>["chatPanelProps"];
  videoWindowsOverlayProps: ComponentProps<typeof AppWorkspacePanels>["videoWindowsOverlayProps"];
  userSettingsOpen: boolean;
  inviteAccepting: boolean;
  appMenuOpen: boolean;
  serverProfileModalProps: Omit<ComponentProps<typeof ServerProfileModalContainer>, "open" | "t">;
};

export function AppMainSection({
  t,
  user,
  authMode,
  beginSso,
  showEmptyServerOnboarding,
  creatingServer,
  onCreateServer,
  isMobileViewport,
  mobileTab,
  onSelectMobileTab,
  userDockSharedProps,
  roomsPanelProps,
  chatPanelProps,
  videoWindowsOverlayProps,
  userSettingsOpen,
  inviteAccepting,
  appMenuOpen,
  serverProfileModalProps
}: AppMainSectionProps) {
  return (
    <>
      {user ? (
        showEmptyServerOnboarding ? (
          <EmptyServerOnboarding
            t={t}
            creatingServer={creatingServer}
            onCreateServer={onCreateServer}
          />
        ) : (
          <AppWorkspacePanels
            isMobileViewport={isMobileViewport}
            mobileTab={mobileTab}
            onSelectTab={onSelectMobileTab}
            t={t}
            hasUser={Boolean(user)}
            userDockSharedProps={userDockSharedProps}
            roomsPanelProps={roomsPanelProps}
            chatPanelProps={chatPanelProps}
            videoWindowsOverlayProps={videoWindowsOverlayProps}
          />
        )
      ) : authMode !== "loading" ? (
        <GuestLoginGate t={t} onBeginSso={beginSso} />
      ) : null}

      {showEmptyServerOnboarding && userSettingsOpen && userDockSharedProps ? (
        <div className="no-server-user-settings-host">
          <UserDock {...userDockSharedProps} inlineSettingsMode={false} />
        </div>
      ) : null}

      {inviteAccepting ? (
        <div className="fixed inset-x-0 top-24 z-[160] flex justify-center px-4">
          <div className="rounded-xl border border-white/20 bg-black/75 px-4 py-2 text-sm text-pixel-text backdrop-blur">
            {t("server.inviteAccepting")}
          </div>
        </div>
      ) : null}

      <ServerProfileModalContainer
        open={appMenuOpen}
        t={t}
        permissions={serverProfileModalProps.permissions}
        state={serverProfileModalProps.state}
        data={serverProfileModalProps.data}
        actions={serverProfileModalProps.actions}
        meta={serverProfileModalProps.meta}
      />
    </>
  );
}