import { useEffect, type Dispatch, type SetStateAction } from "react";
import { api } from "../../../api";
import type { User } from "../../../domain";

type UseAdminUsersSyncArgs = {
  token: string;
  canManageUsers: boolean;
  pushLog: (text: string) => void;
  setAdminUsers: Dispatch<SetStateAction<User[]>>;
};

export function useAdminUsersSync({ token, canManageUsers, pushLog, setAdminUsers }: UseAdminUsersSyncArgs) {
  useEffect(() => {
    if (!token || !canManageUsers) {
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
    const intervalId = window.setInterval(syncAdminUsers, 15000);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [token, canManageUsers, pushLog, setAdminUsers]);
}
