import { useAppModerationActions } from "./useAppModerationActions";
import { useAppRoomAdminRuntime } from "./useAppRoomAdminRuntime";
import { useAppRoomChatActions } from "./useAppRoomChatActions";
import { useAppServerAdminActions } from "./useAppServerAdminActions";

type RoomChatInput = Parameters<typeof useAppRoomChatActions>[0];
type ModerationInput = Parameters<typeof useAppModerationActions>[0];
type ServerAdminInput = Parameters<typeof useAppServerAdminActions>[0];
type RoomAdminInput = Omit<Parameters<typeof useAppRoomAdminRuntime>[0], "joinRoom">;

type UseAppWorkspaceActionsRuntimeInput = {
  roomChat: RoomChatInput;
  moderation: ModerationInput;
  serverAdmin: ServerAdminInput;
  roomAdmin: RoomAdminInput;
};

export function useAppWorkspaceActionsRuntime({
  roomChat,
  moderation,
  serverAdmin,
  roomAdmin
}: UseAppWorkspaceActionsRuntimeInput) {
  const roomChatActions = useAppRoomChatActions(roomChat);
  const moderationActions = useAppModerationActions(moderation);
  const serverAdminActions = useAppServerAdminActions(serverAdmin);
  const roomAdminActions = useAppRoomAdminRuntime({
    ...roomAdmin,
    joinRoom: roomChatActions.joinRoom
  });

  return {
    ...roomChatActions,
    ...moderationActions,
    ...serverAdminActions,
    ...roomAdminActions
  };
}
