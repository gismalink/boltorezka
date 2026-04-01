import { useAppEntryGatesState } from "./useAppEntryGatesState";

type AppEntryGatesStateInput = Parameters<typeof useAppEntryGatesState>[0];

export function useAppEntryGatesStateInput(params: Record<string, unknown>): AppEntryGatesStateInput {
  const p = params as any;

  return {
    showDesktopBrowserCompletion: p.showDesktopBrowserCompletion,
    desktopHandoffError: p.desktopHandoffError,
    user: p.user,
    deletedAccountInfo: p.deletedAccountInfo,
    restoreDeletedAccountPending: p.restoreDeletedAccountPending,
    restoreDeletedAccount: p.restoreDeletedAccount,
    logout: p.logout,
    t: p.t,
    canUseService: p.canUseService,
    pendingAccessRefreshInSec: p.pendingAccessRefreshInSec,
    serversLoading: p.serversLoading,
    servers: p.servers
  };
}
