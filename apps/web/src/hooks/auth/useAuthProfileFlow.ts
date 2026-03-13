import { FormEvent, type MutableRefObject, useEffect } from "react";
import { api } from "../../api";
import type { AuthController } from "../../services";
import type { User } from "../../domain";
import type { VoiceSettingsPanel } from "../../components";

type UseAuthProfileFlowArgs = {
  authController: AuthController;
  token: string;
  authMode: string;
  autoSsoAttemptedRef: MutableRefObject<boolean>;
  profileNameDraft: string;
  selectedUiTheme: "8-neon-bit" | "material-classic";
  t: (key: string) => string;
  setAuthMode: (value: string) => void;
  setAuthMenuOpen: (value: boolean) => void;
  setProfileMenuOpen: (value: boolean) => void;
  setAudioOutputMenuOpen: (value: boolean) => void;
  setVoiceSettingsOpen: (value: boolean) => void;
  setVoiceSettingsPanel: (value: VoiceSettingsPanel) => void;
  setUserSettingsTab: (value: "profile" | "sound" | "camera" | "server_sounds") => void;
  setUserSettingsOpen: (value: boolean) => void;
  setProfileSaving: (value: boolean) => void;
  setProfileStatusText: (value: string) => void;
  setUser: (value: User | null) => void;
  pushToast: (message: string) => void;
  onProfileSaved?: () => void;
};

export function useAuthProfileFlow({
  authController,
  token,
  authMode,
  autoSsoAttemptedRef,
  profileNameDraft,
  selectedUiTheme,
  t,
  setAuthMode,
  setAuthMenuOpen,
  setProfileMenuOpen,
  setAudioOutputMenuOpen,
  setVoiceSettingsOpen,
  setVoiceSettingsPanel,
  setUserSettingsTab,
  setUserSettingsOpen,
  setProfileSaving,
  setProfileStatusText,
  setUser,
  pushToast,
  onProfileSaved
}: UseAuthProfileFlowArgs) {
  useEffect(() => {
    api.authMode()
      .then((res) => setAuthMode(res.mode))
      .catch(() => setAuthMode("sso"));
  }, [setAuthMode]);

  useEffect(() => {
    if (token || authMode !== "sso" || autoSsoAttemptedRef.current) {
      return;
    }

    if (typeof window !== "undefined" && window.boltorezkaDesktop) {
      // Desktop must not silently restore SSO from ambient browser cookies.
      // Session should be established only via explicit desktop handoff/login.
      return;
    }

    autoSsoAttemptedRef.current = true;
    void authController.completeSso({ silent: true });
  }, [token, authMode, authController, autoSsoAttemptedRef]);

  useEffect(() => {
    if (typeof window === "undefined" || window.boltorezkaDesktop || authMode !== "sso") {
      return;
    }

    const url = new URL(window.location.href);
    if (url.searchParams.get("desktop_handoff") !== "1") {
      return;
    }
    if (url.searchParams.get("desktop_handoff_bootstrap") === "1") {
      return;
    }

    url.searchParams.set("desktop_handoff_bootstrap", "1");
    window.history.replaceState({}, "", url.toString());
    void authController.completeSso({ silent: true }).finally(() => {
      const updated = new URL(window.location.href);
      if (updated.searchParams.get("desktop_handoff") !== "1") {
        return;
      }
      updated.searchParams.set("desktop_handoff_refreshed", "1");
      window.history.replaceState({}, "", updated.toString());
    });
  }, [authMode, authController]);

  useEffect(() => {
    if (typeof window === "undefined" || !token || authMode !== "sso") {
      return;
    }

    const url = new URL(window.location.href);
    if (url.searchParams.get("desktop_handoff") !== "1") {
      return;
    }
    if (url.searchParams.get("desktop_handoff_refreshed") !== "1") {
      return;
    }
    if (url.searchParams.get("desktop_handoff_sent") === "1") {
      return;
    }

    url.searchParams.set("desktop_handoff_sent", "1");
    window.history.replaceState({}, "", url.toString());

    void authController.startDesktopBrowserHandoff(token).catch(() => {
      // Keep user on the web session if deep-link handoff is blocked or unavailable.
    });
  }, [token, authMode, authController]);

  useEffect(() => {
    if (typeof window === "undefined" || token || authMode !== "sso") {
      return;
    }

    const url = new URL(window.location.href);
    const handoffCode = String(url.searchParams.get("desktop_sso_code") || "").trim();
    if (!handoffCode) {
      return;
    }

    void authController.completeDesktopHandoff(handoffCode);
    url.searchParams.delete("desktop_sso_code");
    url.searchParams.delete("desktop_sso_complete");
    window.history.replaceState({}, "", url.toString());
  }, [token, authMode, authController]);

  useEffect(() => {
    if (typeof window === "undefined" || token || authMode !== "sso") {
      return;
    }

    if (window.boltorezkaDesktop) {
      return;
    }

    const url = new URL(window.location.href);
    const isDesktopCompleteFlag = url.searchParams.get("desktop_sso_complete") === "1";
    const hasDesktopCode = Boolean(url.searchParams.get("desktop_sso_code"));
    if (!isDesktopCompleteFlag || hasDesktopCode) {
      return;
    }

    void authController.completeSso({ silent: false });
    url.searchParams.delete("desktop_sso_complete");
    window.history.replaceState({}, "", url.toString());
  }, [token, authMode, authController]);

  const beginSso = (provider: "google" | "yandex") => {
    setAuthMenuOpen(false);
    authController.beginSso(provider);
  };

  const logout = () => {
    setProfileMenuOpen(false);
    void authController.logout(token);
  };

  const openUserSettings = (tab: "profile" | "sound" | "camera") => {
    setProfileMenuOpen(false);
    setAudioOutputMenuOpen(false);
    setVoiceSettingsOpen(false);
    setVoiceSettingsPanel(null);
    setUserSettingsTab(tab);
    setUserSettingsOpen(true);
  };

  const saveMyProfile = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = profileNameDraft.trim();
    if (!trimmedName) {
      setProfileStatusText(t("profile.saveError"));
      return;
    }

    setProfileSaving(true);
    setProfileStatusText("");

    try {
      const response = await api.updateMe(token, {
        name: trimmedName,
        uiTheme: selectedUiTheme
      });
      if (response.user) {
        setUser(response.user);
      }
      onProfileSaved?.();
      setProfileStatusText(t("profile.saveSuccess"));
      pushToast(t("profile.saveSuccess"));
    } catch (error) {
      const message = (error as Error).message || t("profile.saveError");
      setProfileStatusText(message);
      pushToast(message);
    } finally {
      setProfileSaving(false);
    }
  };

  return {
    beginSso,
    logout,
    openUserSettings,
    saveMyProfile
  };
}
