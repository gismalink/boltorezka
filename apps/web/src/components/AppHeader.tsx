import type { RefObject } from "react";
import type { User } from "../domain";
import { PopupPortal } from "./PopupPortal";

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
  onOpenUserSettings
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="app-menu">
          <button
            type="button"
            className="secondary app-menu-btn"
            onClick={onToggleAppMenu}
            aria-label={t("server.menuAria")}
            aria-expanded={appMenuOpen}
          >
            B
          </button>
        </div>
        <h1 className="app-title">{t("app.title")}</h1>
      </div>
      <div className="header-actions">
        {user ? (
          <>
            <span className="user-chip">{user.name}</span>
            <div className="profile-menu" ref={profileMenuRef}>
              <button
                type="button"
                className="secondary profile-icon"
                onClick={onToggleProfileMenu}
                aria-label={t("profile.menuAria")}
              >
                <i className="bi bi-person-circle" aria-hidden="true" />
              </button>
              <PopupPortal open={profileMenuOpen} anchorRef={profileMenuRef} className="profile-popup" placement="bottom-end">
                <div>
                  <button type="button" className="secondary" onClick={onOpenUserSettings}>{t("profile.openSettings")}</button>
                  <button type="button" onClick={onLogout}>{t("auth.logout")}</button>
                </div>
              </PopupPortal>
            </div>
          </>
        ) : (
          <div className="auth-menu" ref={authMenuRef}>
            <button type="button" onClick={onToggleAuthMenu}>
              {t("auth.login")}
            </button>
            <PopupPortal open={authMenuOpen} anchorRef={authMenuRef} className="auth-popup" placement="bottom-end">
              <div>
                <button type="button" className="provider-btn" onClick={() => onBeginSso("google")}> 
                  <span className="provider-icon provider-google">G</span>
                  {t("auth.google")}
                </button>
                <button type="button" className="provider-btn" onClick={() => onBeginSso("yandex")}>
                  <span className="provider-icon provider-yandex">Я</span>
                  {t("auth.yandex")}
                </button>
              </div>
            </PopupPortal>
          </div>
        )}
      </div>
    </header>
  );
}
