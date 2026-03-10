import { useEffect, type Dispatch, type SetStateAction } from "react";
import { api } from "../../../api";
import type { User } from "../../../domain";

type UseAdminUsersSyncArgs = {
  token: string;
  canPromote: boolean;
  pushLog: (text: string) => void;
  setAdminUsers: Dispatch<SetStateAction<User[]>>;
};

export function useAdminUsersSync({ token, canPromote, pushLog, setAdminUsers }: UseAdminUsersSyncArgs) {
  useEffect(() => {
    if (!token || !canPromote) {
      return;
    }

    api.adminUsers(token)
      .then((res) => setAdminUsers(res.users))
      .catch((error) => pushLog(`admin users failed: ${error.message}`));
  }, [token, canPromote, pushLog, setAdminUsers]);
}
