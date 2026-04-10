import { useAppPermissionsAndLocale } from "./useAppPermissionsAndLocale";

type UseAppPermissionsIdentityRuntimeInput = Parameters<typeof useAppPermissionsAndLocale>[0];

export function useAppPermissionsIdentityRuntime({
  token,
  user,
  servers,
  currentServerId,
  adminUsers,
  pendingJoinRequestsCount,
  lang,
  pushToast
}: UseAppPermissionsIdentityRuntimeInput) {
  const permissions = useAppPermissionsAndLocale({
    token,
    user,
    servers,
    currentServerId,
    adminUsers,
    pendingJoinRequestsCount,
    lang,
    pushToast
  });

  const currentUserId = user?.id || "";

  return {
    ...permissions,
    currentUserId,
    currentUserIdOrNull: user?.id || null,
    currentUserName: user?.name || "",
    hasUser: Boolean(user),
    hasServiceToken: Boolean(permissions.serviceToken)
  };
}