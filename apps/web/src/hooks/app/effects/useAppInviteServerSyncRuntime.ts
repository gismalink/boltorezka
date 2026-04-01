import { useInviteAcceptanceFlow } from "./useInviteAcceptanceFlow";
import { useServerDataSync } from "./useServerDataSync";

type UseAppInviteServerSyncRuntimeInput = {
  inviteAcceptance: Parameters<typeof useInviteAcceptanceFlow>[0];
  serverDataSync: Parameters<typeof useServerDataSync>[0];
};

export function useAppInviteServerSyncRuntime({
  inviteAcceptance,
  serverDataSync
}: UseAppInviteServerSyncRuntimeInput) {
  useInviteAcceptanceFlow(inviteAcceptance);
  useServerDataSync(serverDataSync);
}