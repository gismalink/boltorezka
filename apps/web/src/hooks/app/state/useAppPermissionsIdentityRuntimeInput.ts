import { useAppPermissionsIdentityRuntime } from "./useAppPermissionsIdentityRuntime";

type AppPermissionsIdentityRuntimeInput = Parameters<typeof useAppPermissionsIdentityRuntime>[0];

export function useAppPermissionsIdentityRuntimeInput(params: Record<string, unknown>): AppPermissionsIdentityRuntimeInput {
  const p = params as any;

  return {
    token: p.token,
    user: p.user,
    servers: p.servers,
    currentServerId: p.currentServerId,
    adminUsers: p.adminUsers,
    pendingJoinRequestsCount: p.pendingJoinRequestsCount,
    lang: p.lang,
    pushToast: p.pushToast
  };
}
