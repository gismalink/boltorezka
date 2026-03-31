import { useCallback, type Dispatch, type SetStateAction } from "react";
import { api } from "../../api";
import type { User } from "../../domain";
import { clearPersistedBearerToken } from "../../utils/authStorage";

type DeletedAccountInfo = {
  daysRemaining: number;
  purgeScheduledAt: string | null;
};

type UseDeletedAccountActionsArgs = {
  token: string;
  deleteAccountPending: boolean;
  restoreDeletedAccountPending: boolean;
  setDeleteAccountPending: Dispatch<SetStateAction<boolean>>;
  setRestoreDeletedAccountPending: Dispatch<SetStateAction<boolean>>;
  setDeleteAccountStatusText: Dispatch<SetStateAction<string>>;
  setDeletedAccountInfo: Dispatch<SetStateAction<DeletedAccountInfo | null>>;
  setToken: Dispatch<SetStateAction<string>>;
  setUser: Dispatch<SetStateAction<User | null>>;
  pushToast: (message: string) => void;
  t: (key: string) => string;
};

export function useDeletedAccountActions({
  token,
  deleteAccountPending,
  restoreDeletedAccountPending,
  setDeleteAccountPending,
  setRestoreDeletedAccountPending,
  setDeleteAccountStatusText,
  setDeletedAccountInfo,
  setToken,
  setUser,
  pushToast,
  t
}: UseDeletedAccountActionsArgs) {
  const restoreDeletedAccount = useCallback(async () => {
    if (restoreDeletedAccountPending) {
      return;
    }

    setRestoreDeletedAccountPending(true);
    try {
      const response = await api.restoreDeletedSsoAccount();
      const restoredToken = String(response.token || "").trim();
      if (!response.authenticated || !restoredToken || !response.user) {
        throw new Error(t("account.restoreError"));
      }

      setDeletedAccountInfo(null);
      setDeleteAccountStatusText("");
      setToken(restoredToken);
      setUser(response.user);
      pushToast(t("account.restoreSuccess"));
    } catch (error) {
      const message = (error as Error).message || t("account.restoreError");
      pushToast(message);
    } finally {
      setRestoreDeletedAccountPending(false);
    }
  }, [pushToast, restoreDeletedAccountPending, setDeleteAccountStatusText, setDeletedAccountInfo, setRestoreDeletedAccountPending, setToken, setUser, t]);

  const handleDeleteAccount = useCallback(async () => {
    if (!token || deleteAccountPending) {
      return;
    }

    setDeleteAccountPending(true);
    setDeleteAccountStatusText("");
    try {
      const response = await api.deleteMe(token);
      setDeletedAccountInfo({
        daysRemaining: Math.max(0, Number(response.daysRemaining ?? 30) || 30),
        purgeScheduledAt: response.purgeScheduledAt || null
      });
      setUser(null);
      setToken("");
      clearPersistedBearerToken();
      setDeleteAccountStatusText(t("settings.accountDeleteSuccess"));
      pushToast(t("settings.accountDeleteSuccess"));
    } catch (error) {
      const message = (error as Error).message || t("settings.accountDeleteError");
      setDeleteAccountStatusText(message);
      pushToast(message);
    } finally {
      setDeleteAccountPending(false);
    }
  }, [deleteAccountPending, pushToast, setDeleteAccountPending, setDeleteAccountStatusText, setDeletedAccountInfo, setToken, setUser, t, token]);

  return {
    restoreDeletedAccount,
    handleDeleteAccount
  };
}