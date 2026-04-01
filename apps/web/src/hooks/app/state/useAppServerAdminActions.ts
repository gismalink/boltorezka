import { useAdminServerActions } from "../../rooms/useAdminServerActions";
import { useServerProfileActions } from "../../rooms/useServerProfileActions";

type UseServerProfileActionsInput = Parameters<typeof useServerProfileActions>[0];
type UseAdminServerActionsInput = Parameters<typeof useAdminServerActions>[0];

type UseAppServerAdminActionsInput = {
  serverProfile: UseServerProfileActionsInput;
  adminServer: UseAdminServerActionsInput;
};

export function useAppServerAdminActions({
  serverProfile,
  adminServer
}: UseAppServerAdminActionsInput) {
  const serverProfileActions = useServerProfileActions(serverProfile);
  const adminServerActions = useAdminServerActions(adminServer);

  return {
    ...serverProfileActions,
    ...adminServerActions
  };
}