import type { ReactNode } from "react";
import {
  AccessStateGate,
  DeletedAccountGate,
  DesktopBrowserCompletionGate
} from "../../../components";
import type { User } from "../../../domain";

type Translate = (key: string) => string;

type UseAppEntryGatesInput = {
  showDesktopBrowserCompletion: boolean;
  desktopHandoffError: string;
  user: User | null;
  deletedAccountInfo: { daysRemaining: number; purgeScheduledAt: string | null } | null;
  restoreDeletedAccountPending: boolean;
  restoreDeletedAccount: () => Promise<void>;
  logout: () => void;
  t: Translate;
  canUseService: boolean;
  pendingAccessRefreshInSec: number;
  serversLoading: boolean;
  serversCount: number;
};

export function useAppEntryGates({
  showDesktopBrowserCompletion,
  desktopHandoffError,
  user,
  deletedAccountInfo,
  restoreDeletedAccountPending,
  restoreDeletedAccount,
  logout,
  t,
  canUseService,
  pendingAccessRefreshInSec,
  serversLoading,
  serversCount
}: UseAppEntryGatesInput): { entryGate: ReactNode; showEmptyServerOnboarding: boolean } {
  if (showDesktopBrowserCompletion) {
    return {
      entryGate: <DesktopBrowserCompletionGate desktopHandoffError={desktopHandoffError} />,
      showEmptyServerOnboarding: false
    };
  }

  if (!user && deletedAccountInfo) {
    return {
      entryGate: (
        <DeletedAccountGate
          t={t}
          daysRemaining={deletedAccountInfo.daysRemaining}
          restoring={restoreDeletedAccountPending}
          onRestore={() => {
            void restoreDeletedAccount();
          }}
          onLogout={logout}
        />
      ),
      showEmptyServerOnboarding: false
    };
  }

  if (user && !canUseService) {
    const blocked = user.access_state === "blocked";
    return {
      entryGate: (
        <AccessStateGate
          blocked={blocked}
          pendingAccessRefreshInSec={pendingAccessRefreshInSec}
          t={t}
          onRefresh={() => window.location.reload()}
          onLogout={logout}
        />
      ),
      showEmptyServerOnboarding: false
    };
  }

  return {
    entryGate: null,
    showEmptyServerOnboarding: Boolean(user) && !serversLoading && serversCount === 0
  };
}