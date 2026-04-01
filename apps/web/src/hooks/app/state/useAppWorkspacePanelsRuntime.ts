import { useAppChatVideoProps } from "./useAppChatVideoProps";
import { useAppRoomsPanelProps } from "./useAppRoomsPanelProps";
import { useAppServerProfileModalProps } from "./useAppServerProfileModalProps";

type RoomsPanelInput = Parameters<typeof useAppRoomsPanelProps>[0];
type ServerProfileModalInput = Parameters<typeof useAppServerProfileModalProps>[0];
type ChatVideoInput = Parameters<typeof useAppChatVideoProps>[0];

type UseAppWorkspacePanelsRuntimeInput = {
  roomsPanel: RoomsPanelInput;
  serverProfileModal: ServerProfileModalInput;
  chatVideo: ChatVideoInput;
};

export function useAppWorkspacePanelsRuntime({
  roomsPanel,
  serverProfileModal,
  chatVideo
}: UseAppWorkspacePanelsRuntimeInput) {
  const roomsPanelProps = useAppRoomsPanelProps(roomsPanel);
  const serverProfileModalProps = useAppServerProfileModalProps(serverProfileModal);
  const { chatPanelProps, videoWindowsOverlayProps } = useAppChatVideoProps(chatVideo);

  return {
    roomsPanelProps,
    serverProfileModalProps,
    chatPanelProps,
    videoWindowsOverlayProps
  };
}