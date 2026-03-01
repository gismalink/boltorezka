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
    <header className="app-header flex items-center justify-between gap-4 md:gap-6">
      <div className="header-brand flex items-center gap-3 md:gap-4">
        <div className="app-menu">
          <button
            type="button"
            className="secondary app-menu-btn inline-flex min-h-10 min-w-10 items-center justify-center px-2.5 font-bold"
            onClick={onToggleAppMenu}
            aria-label={t("server.menuAria")}
            aria-expanded={appMenuOpen}
          >
            B
          </button>
        </div>
        <h1 className="app-title font-heading text-[22px] leading-none text-pixel-text md:text-[28px]">{t("app.title")}</h1>
      </div>
      <div className="header-actions flex items-center gap-3 md:gap-4">
        {user ? (
          <>
            <span className="user-chip hidden max-w-[220px] truncate font-semibold text-pixel-text sm:inline">{user.name}</span>
            <div className="profile-menu" ref={profileMenuRef}>
              <button
                type="button"
                className="secondary profile-icon inline-flex h-10 w-10 items-center justify-center"
                onClick={onToggleProfileMenu}
                aria-label={t("profile.menuAria")}
              >
                <i className="bi bi-person-circle" aria-hidden="true" />
              </button>
              <PopupPortal open={profileMenuOpen} anchorRef={profileMenuRef} className="profile-popup" placement="bottom-end">
                <div>
                  <button type="button" className="secondary w-full text-left" onClick={onOpenUserSettings}>{t("profile.openSettings")}</button>
                  <button type="button" onClick={onLogout}>{t("auth.logout")}</button>
                </div>
              </PopupPortal>
            </div>
          </>
        ) : (
          <div className="auth-menu" ref={authMenuRef}>
            <button type="button" className="min-w-[112px]" onClick={onToggleAuthMenu}>
              {t("auth.login")}
            </button>
            <PopupPortal open={authMenuOpen} anchorRef={authMenuRef} className="auth-popup" placement="bottom-end">
              <div className="grid gap-2">
                <button type="button" className="provider-btn w-full" onClick={() => onBeginSso("google")}> 
                  <span className="provider-icon provider-google">G</span>
                  {t("auth.google")}
                </button>
                <button type="button" className="provider-btn w-full" onClick={() => onBeginSso("yandex")}>
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
