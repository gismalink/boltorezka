import { useAuthProfileFlow } from "../../auth/useAuthProfileFlow";
import { useDeletedAccountActions } from "../../auth/useDeletedAccountActions";
import { useDesktopHandoffState } from "./useDesktopHandoffState";
import { useDesktopUpdateFlow } from "../effects/useDesktopUpdateFlow";

type DesktopUpdateInput = Parameters<typeof useDesktopUpdateFlow>[0];
type AuthProfileInput = Parameters<typeof useAuthProfileFlow>[0];
type DeletedAccountInput = Parameters<typeof useDeletedAccountActions>[0];

type UseAppAuthWorkspaceRuntimeInput = {
  desktopUpdate: DesktopUpdateInput;
  desktopHandoffToken: string;
  authProfile: AuthProfileInput;
  deletedAccount: DeletedAccountInput;
};

export function useAppAuthWorkspaceRuntime({
  desktopUpdate,
  desktopHandoffToken,
  authProfile,
  deletedAccount
}: UseAppAuthWorkspaceRuntimeInput) {
  const desktopUpdateFlow = useDesktopUpdateFlow(desktopUpdate);
  const desktopHandoffState = useDesktopHandoffState(desktopHandoffToken);
  const authProfileFlow = useAuthProfileFlow(authProfile);
  const deletedAccountActions = useDeletedAccountActions(deletedAccount);

  return {
    ...desktopUpdateFlow,
    ...desktopHandoffState,
    ...authProfileFlow,
    ...deletedAccountActions
  };
}
