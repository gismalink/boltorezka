import { FormEvent, type MutableRefObject, useEffect } from "react";
import { api } from "../api";
import type { AuthController } from "../services";
import type { User } from "../domain";
import type { VoiceSettingsPanel } from "../components";

type UseAuthProfileFlowArgs = {
  authController: AuthController;
  token: string;
  authMode: string;
  autoSsoAttemptedRef: MutableRefObject<boolean>;
  profileNameDraft: string;
  t: (key: string) => string;
  setAuthMode: (value: string) => void;
  setAuthMenuOpen: (value: boolean) => void;
  setProfileMenuOpen: (value: boolean) => void;
  setAudioOutputMenuOpen: (value: boolean) => void;
  setVoiceSettingsOpen: (value: boolean) => void;
  setVoiceSettingsPanel: (value: VoiceSettingsPanel) => void;
  setUserSettingsTab: (value: "profile" | "sound") => void;
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

    autoSsoAttemptedRef.current = true;
    void authController.completeSso({ silent: true });
  }, [token, authMode, authController, autoSsoAttemptedRef]);

  const beginSso = (provider: "google" | "yandex") => {
    setAuthMenuOpen(false);
    authController.beginSso(provider);
  };

  const logout = () => {
    setProfileMenuOpen(false);
    authController.logout();
  };

  const openUserSettings = (tab: "profile" | "sound") => {
    setProfileMenuOpen(false);
    setAudioOutputMenuOpen(false);
    setVoiceSettingsOpen(false);
    setVoiceSettingsPanel(null);
    setUserSettingsTab(tab);
    setUserSettingsOpen(true);
  };

  const saveMyProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }

    const trimmedName = profileNameDraft.trim();
    if (!trimmedName) {
      setProfileStatusText(t("profile.saveError"));
      return;
    }

    setProfileSaving(true);
    setProfileStatusText("");

    try {
      const response = await api.updateMe(token, { name: trimmedName });
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
