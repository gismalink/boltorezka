import { useAppInviteServerSyncRuntime } from "../effects/useAppInviteServerSyncRuntime";

type AppInviteServerSyncRuntimeInput = Parameters<typeof useAppInviteServerSyncRuntime>[0];

export function useAppInviteServerSyncRuntimeInput(params: Record<string, unknown>): AppInviteServerSyncRuntimeInput {
  const p = params as any;

  return {
    inviteAcceptance: {
      token: p.token,
      hasUser: p.hasUser,
      pendingInviteToken: p.pendingInviteToken,
      setPendingInviteToken: p.setPendingInviteToken,
      setInviteAccepting: p.setInviteAccepting,
      setServers: p.setServers,
      setCurrentServerId: p.setCurrentServerId,
      pushToast: p.pushToast,
      t: p.t
    },
    serverDataSync: {
      token: p.token,
      hasUser: p.hasUser,
      currentServerId: p.currentServerId,
      selectedAdminServerId: p.selectedAdminServerId,
      canManageServerControlPlane: p.canManageServerControlPlane,
      currentServerIdStorageKey: p.currentServerIdStorageKey,
      setServerAgeConfirmedAt: p.setServerAgeConfirmedAt,
      setServerAgeLoading: p.setServerAgeLoading,
      setServers: p.setServers,
      setServersLoading: p.setServersLoading,
      setCurrentServerId: p.setCurrentServerId,
      setServerMembers: p.setServerMembers,
      setServerMembersLoading: p.setServerMembersLoading,
      setAdminServers: p.setAdminServers,
      setSelectedAdminServerId: p.setSelectedAdminServerId,
      setAdminServerOverview: p.setAdminServerOverview,
      setAdminServersLoading: p.setAdminServersLoading,
      setAdminServerOverviewLoading: p.setAdminServerOverviewLoading,
      pushLog: p.pushLog
    }
  };
}
