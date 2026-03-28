import { useCallback, type Dispatch, type SetStateAction } from "react";
import { api } from "../../../api";
import type { UiTheme, User } from "../../../domain";

type UseOnboardingOverlayActionsArgs = {
  token: string;
  user: User | null;
  profileNameDraft: string;
  selectedUiTheme: UiTheme;
  versionUpdatePendingKey: string;
  setProfileSaving: Dispatch<SetStateAction<boolean>>;
  setProfileStatusText: Dispatch<SetStateAction<string>>;
  setUser: Dispatch<SetStateAction<User | null>>;
  setShowFirstRunIntro: Dispatch<SetStateAction<boolean>>;
  setShowAppUpdatedOverlay: Dispatch<SetStateAction<boolean>>;
  pushToast: (message: string) => void;
  t: (key: string) => string;
};

export function useOnboardingOverlayActions({
  token,
  user,
  profileNameDraft,
  selectedUiTheme,
  versionUpdatePendingKey,
  setProfileSaving,
  setProfileStatusText,
  setUser,
  setShowFirstRunIntro,
  setShowAppUpdatedOverlay,
  pushToast,
  t
}: UseOnboardingOverlayActionsArgs) {
  const acknowledgeUpdatedApp = useCallback(() => {
    sessionStorage.removeItem(versionUpdatePendingKey);
    setShowAppUpdatedOverlay(false);
  }, [setShowAppUpdatedOverlay, versionUpdatePendingKey]);

  const completeFirstRunIntro = useCallback(async () => {
    if (!user?.id) {
      return;
    }

    const trimmedName = profileNameDraft.trim();
    if (!trimmedName) {
      pushToast(t("profile.saveError"));
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
      localStorage.setItem(`boltorezka_intro_v1_seen:${user.id}`, "1");
      setShowFirstRunIntro(false);
      pushToast(t("profile.saveSuccess"));
    } catch (error) {
      const message = (error as Error).message || t("profile.saveError");
      setProfileStatusText(message);
      pushToast(message);
    } finally {
      setProfileSaving(false);
    }
  }, [
    profileNameDraft,
    pushToast,
    selectedUiTheme,
    setProfileSaving,
    setProfileStatusText,
    setShowFirstRunIntro,
    setUser,
    t,
    token,
    user?.id
  ]);

  return {
    acknowledgeUpdatedApp,
    completeFirstRunIntro
  };
}
