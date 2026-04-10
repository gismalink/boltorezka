import { useAppCoreState } from "./useAppCoreState";

type AppCoreStateInput = Parameters<typeof useAppCoreState>[0];

export function useAppCoreStateInput(params: Record<string, unknown>): AppCoreStateInput {
  const p = params as any;

  return {
    clientBuildSha: p.clientBuildSha,
    versionUpdateExpectedShaKey: p.versionUpdateExpectedShaKey,
    versionUpdatePendingKey: p.versionUpdatePendingKey,
    cookieConsentKey: p.cookieConsentKey,
    currentServerIdStorageKey: p.currentServerIdStorageKey,
    pendingAccessAutoRefreshSec: p.pendingAccessAutoRefreshSec
  };
}
