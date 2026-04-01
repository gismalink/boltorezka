import { useWorkspaceUserDockController } from "./useWorkspaceUserDockController";

type UseWorkspaceUserDockControllerInput = Parameters<typeof useWorkspaceUserDockController>[0];

type UseAppUserDockSharedPropsInput = Omit<
  UseWorkspaceUserDockControllerInput,
  | "currentRoomTitle"
  | "screenShareActive"
  | "serverSoundsMasterVolume"
  | "serverSoundsEnabled"
  | "deleteAccount"
  | "confirmServerAge"
> & {
  currentRoom: { title?: string } | null;
  currentRoomScreenShareOwner: { userId: string | null };
  serverSoundSettings: {
    masterVolume: number;
    enabledByEvent: UseWorkspaceUserDockControllerInput["serverSoundsEnabled"];
  };
  handleDeleteAccount: () => unknown;
  handleConfirmServerAge: () => unknown;
};

export function useAppUserDockSharedProps({
  currentRoom,
  currentRoomScreenShareOwner,
  serverSoundSettings,
  handleDeleteAccount,
  handleConfirmServerAge,
  ...rest
}: UseAppUserDockSharedPropsInput) {
  return useWorkspaceUserDockController({
    ...rest,
    currentRoomTitle: currentRoom?.title || "",
    screenShareActive: Boolean(currentRoomScreenShareOwner.userId),
    serverSoundsMasterVolume: serverSoundSettings.masterVolume,
    serverSoundsEnabled: serverSoundSettings.enabledByEvent,
    deleteAccount: () => void handleDeleteAccount(),
    confirmServerAge: () => void handleConfirmServerAge()
  });
}