import { useEffect, type Dispatch, type SetStateAction } from "react";
import { api } from "../../../api";
import type { User } from "../../../domain";

const ADMIN_USERS_SYNC_INTERVAL_MS = 30000;

type UseAdminUsersSyncArgs = {
  token: string;
  canManageUsers: boolean;
  isProductManagementTabActive: boolean;
  pushLog: (text: string) => void;
  setAdminUsers: Dispatch<SetStateAction<User[]>>;
};

export function useAdminUsersSync({ token, canManageUsers, isProductManagementTabActive, pushLog, setAdminUsers }: UseAdminUsersSyncArgs) {
  useEffect(() => {
    if (!token || !canManageUsers || !isProductManagementTabActive) {
      return;
    }

    let disposed = false;

    const syncAdminUsers = () => {
      api.adminUsers(token)
        .then((res) => {
          if (!disposed) {
            setAdminUsers(res.users);
          }
        })
        .catch((error) => {
          if (!disposed) {
            pushLog(`admin users failed: ${error.message}`);
          }
        });
    };

    syncAdminUsers();
    const intervalId = window.setInterval(syncAdminUsers, ADMIN_USERS_SYNC_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [token, canManageUsers, isProductManagementTabActive, pushLog, setAdminUsers]);
}
