import { useRoomMemberPreferencesOrchestrator } from "../../rooms/useRoomMemberPreferencesOrchestrator";
import { useServerModerationActions } from "../../rooms/useServerModerationActions";

type MemberPreferencesInput = Parameters<typeof useRoomMemberPreferencesOrchestrator>[0];
type ServerModerationInput = Parameters<typeof useServerModerationActions>[0];

type UseAppModerationActionsInput = {
  memberPreferences: MemberPreferencesInput;
  serverModeration: ServerModerationInput;
};

export function useAppModerationActions({
  memberPreferences,
  serverModeration
}: UseAppModerationActionsInput) {
  const { saveMemberPreference } = useRoomMemberPreferencesOrchestrator(memberPreferences);
  const serverModerationActions = useServerModerationActions(serverModeration);

  return {
    saveMemberPreference,
    ...serverModerationActions
  };
}