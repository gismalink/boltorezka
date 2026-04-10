import { useEffect, type Dispatch, type SetStateAction } from "react";
import { api } from "../../../api";

const PENDING_JOIN_REQUESTS_SYNC_INTERVAL_MS = 30000;

type UsePendingJoinRequestsCountSyncArgs = {
  token: string;
  canPromote: boolean;
  pushLog: (text: string) => void;
  setPendingJoinRequestsCount: Dispatch<SetStateAction<number>>;
};

export function usePendingJoinRequestsCountSync({
  token,
  canPromote,
  pushLog,
  setPendingJoinRequestsCount
}: UsePendingJoinRequestsCountSyncArgs) {
  useEffect(() => {
    if (!token || !canPromote) {
      setPendingJoinRequestsCount(0);
      return;
    }

    let disposed = false;

    const syncPendingCount = () => {
      api.adminUsersPendingCount(token)
        .then((res) => {
          if (!disposed) {
            setPendingJoinRequestsCount(Math.max(0, Number(res.count || 0)));
          }
        })
        .catch((error) => {
          if (!disposed) {
            pushLog(`pending join requests count failed: ${error.message}`);
          }
        });
    };

    syncPendingCount();
    const intervalId = window.setInterval(syncPendingCount, PENDING_JOIN_REQUESTS_SYNC_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [token, canPromote, pushLog, setPendingJoinRequestsCount]);
}
