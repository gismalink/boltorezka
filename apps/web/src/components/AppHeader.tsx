import { useRef, useState, type RefObject } from "react";
import type { ServerListItem, User } from "../domain";
import { Button, PopupPortal } from "./uicomponents";

type AppHeaderProps = {
  t: (key: string) => string;
  user: User | null;
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
  currentServerName: string | null;
  servers: ServerListItem[];
  currentServerId: string;
  creatingServer: boolean;
  creatingInvite: boolean;
  lastInviteUrl: string;
  onChangeCurrentServer: (serverId: string) => void;
  onCreateServer: (name: string) => Promise<void>;
  onCreateServerInviteAndCopy: () => Promise<void>;
  buildDateLabel?: string;
  pendingJoinRequestsCount?: number;
};

export function AppHeader({
  t,
  user,
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
  currentServerName,
  servers,
  currentServerId,
  creatingServer,
  creatingInvite,
  lastInviteUrl,
  onChangeCurrentServer,
  onCreateServer,
  onCreateServerInviteAndCopy,
  buildDateLabel,
  pendingJoinRequestsCount = 0,
}: AppHeaderProps) {
  const [createServerOpen, setCreateServerOpen] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  const createServerRef = useRef<HTMLDivElement>(null);
  const menuGlyph = String(currentServerName || "").trim().slice(0, 1).toUpperCase() || "D";
  const serverTitle = String(currentServerName || "").trim();
  const cachedInviteUrl = String(lastInviteUrl || "").trim();

  const submitCreateServer = async () => {
    const name = String(newServerName || "").trim();
    if (!name || creatingServer) {
      return;
    }

    await onCreateServer(name);
    setCreateServerOpen(false);
    setNewServerName("");
  };

  return (
    <header className="app-header flex items-center justify-between gap-4 desktop:gap-6">
      <div className="header-brand flex items-center gap-3 desktop:gap-4">
        <div className="app-menu">
          <Button
            type="button"
            className="secondary app-menu-btn relative inline-flex min-h-10 min-w-10 items-center justify-center px-2.5 font-bold"
            onClick={onToggleAppMenu}
            aria-label={t("server.menuAria")}
            aria-expanded={appMenuOpen}
          >
            {menuGlyph}
            {pendingJoinRequestsCount > 0 ? (
              <span className="menu-notification-badge" aria-hidden="true">
                {pendingJoinRequestsCount > 99 ? "99+" : pendingJoinRequestsCount}
              </span>
            ) : null}
          </Button>
        </div>
        <div className={`title-block server-title-hover-root flex min-w-0 flex-col ${createServerOpen ? "server-title-hover-root-open" : ""}`}>
          <h1 className="app-title font-heading text-[22px] leading-none text-pixel-text desktop:text-[28px]">
            {serverTitle ? `${t("app.title")} // ${serverTitle}` : t("app.title")}
          </h1>
          {buildDateLabel ? (
            <div className="logo-version" aria-label={`Build version ${buildDateLabel}`}>
              {buildDateLabel}
            </div>
          ) : null}
          {user ? (
            <div className="server-title-hover-panel hidden desktop:grid gap-2">
              <label className="grid gap-1 text-sm text-pixel-text/80">
                <span>{t("server.switcher")}</span>
                <select
                  className="secondary min-w-[220px]"
                  aria-label={t("server.switcherAria")}
                  value={currentServerId}
                  onChange={(event) => onChangeCurrentServer(event.target.value)}
                >
                  {servers.map((server) => (
                    <option key={server.id} value={server.id}>{server.name}</option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                className="secondary"
                onClick={() => { void onCreateServerInviteAndCopy(); }}
                disabled={creatingInvite || !currentServerId}
              >
                {creatingInvite
                  ? t("server.inviteCreateLoading")
                  : cachedInviteUrl
                    ? t("server.inviteCopiedAction")
                    : t("server.inviteQuick")}
              </Button>
              {cachedInviteUrl ? (
                <a
                  href={cachedInviteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-pixel-text/70 break-all"
                  title={cachedInviteUrl}
                >
                  {cachedInviteUrl}
                </a>
              ) : null}
              <div className="mt-1 grid gap-2 border-t border-white/15 pt-2" ref={createServerRef}>
                <Button
                  type="button"
                  className="secondary"
                  aria-label={t("server.createAria")}
                  onClick={() => setCreateServerOpen((value) => !value)}
                >
                  {t("server.createOwn")}
                </Button>
                <PopupPortal open={createServerOpen} anchorRef={createServerRef} className="profile-popup" placement="bottom-start">
                  <div className="grid gap-2 min-w-[260px]">
                    <label className="text-sm text-pixel-text/80" htmlFor="create-server-name-input">{t("server.createTitle")}</label>
                    <input
                      id="create-server-name-input"
                      className="secondary"
                      value={newServerName}
                      maxLength={64}
                      onChange={(event) => setNewServerName(event.target.value)}
                      placeholder={t("server.createPlaceholder")}
                    />
                    <div className="flex gap-2 justify-end">
                      <Button type="button" className="secondary" onClick={() => setCreateServerOpen(false)}>{t("server.createCancel")}</Button>
                      <Button type="button" onClick={() => { void submitCreateServer(); }} disabled={creatingServer || newServerName.trim().length < 3}>
                        {creatingServer ? t("server.createLoading") : t("server.createSubmit")}
                      </Button>
                    </div>
                  </div>
                </PopupPortal>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="header-actions flex items-center gap-3 desktop:gap-4">
        {user ? (
          <>
            <span className="user-chip hidden max-w-[220px] truncate font-semibold text-pixel-text desktop:inline">{user.name}</span>
            <div className="profile-menu" ref={profileMenuRef}>
              <Button
                type="button"
                className="secondary profile-icon inline-flex h-10 w-10 items-center justify-center"
                onClick={onToggleProfileMenu}
                aria-label={t("profile.menuAria")}
              >
                <i className="bi bi-person-circle" aria-hidden="true" />
              </Button>
              <PopupPortal open={profileMenuOpen} anchorRef={profileMenuRef} className="profile-popup" placement="bottom-end">
                <div>
                  <Button type="button" className="secondary w-full text-left" onClick={onOpenUserSettings}>{t("profile.openSettings")}</Button>
                  <Button type="button" onClick={onLogout}>{t("auth.logout")}</Button>
                </div>
              </PopupPortal>
            </div>
          </>
        ) : (
          <div className="auth-menu" ref={authMenuRef}>
            <Button type="button" className="min-w-[112px]" onClick={onToggleAuthMenu}>
              {t("auth.login")}
            </Button>
            <PopupPortal open={authMenuOpen} anchorRef={authMenuRef} className="auth-popup" placement="bottom-end">
              <div className="grid gap-2">
                <Button type="button" className="provider-btn w-full flex items-center justify-start gap-3" onClick={() => onBeginSso("google")}> 
                  <span className="provider-icon provider-google inline-flex h-5 w-5 items-center justify-center">G</span>
                  {t("auth.google")}
                </Button>
                <Button type="button" className="provider-btn w-full flex items-center justify-start gap-3" onClick={() => onBeginSso("yandex")}>
                  <span className="provider-icon provider-yandex inline-flex h-5 w-5 items-center justify-center">Я</span>
                  {t("auth.yandex")}
                </Button>
              </div>
            </PopupPortal>
          </div>
        )}
      </div>
    </header>
  );
}
