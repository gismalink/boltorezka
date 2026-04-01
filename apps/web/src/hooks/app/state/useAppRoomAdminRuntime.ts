import { useRoomAdminActions } from "../../rooms/useRoomAdminActions";

type UseRoomAdminActionsInput = Parameters<typeof useRoomAdminActions>[0];

export function useAppRoomAdminRuntime(input: UseRoomAdminActionsInput) {
  return useRoomAdminActions(input);
}