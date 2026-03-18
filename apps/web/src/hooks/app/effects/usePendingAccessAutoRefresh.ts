import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { User } from "../../../domain";

type UsePendingAccessAutoRefreshArgs = {
  user: User | null;
  resetValue: number;
  setPendingAccessRefreshInSec: Dispatch<SetStateAction<number>>;
};

export function usePendingAccessAutoRefresh({
  user,
  resetValue,
  setPendingAccessRefreshInSec
}: UsePendingAccessAutoRefreshArgs) {
  useEffect(() => {
    if (!user || user.access_state !== "pending") {
      setPendingAccessRefreshInSec(resetValue);
      return;
    }

    setPendingAccessRefreshInSec(resetValue);
    const intervalId = window.setInterval(() => {
      setPendingAccessRefreshInSec((previous) => {
        if (previous <= 1) {
          window.location.reload();
          return resetValue;
        }

        return previous - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [resetValue, setPendingAccessRefreshInSec, user]);
}
