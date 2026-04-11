import { useContextMenuPosition } from "../../../hooks/useContextMenuPosition";

export function useMessageContextMenu() {
  const { contextMenu: messageContextMenu, setContextMenu: setMessageContextMenu } =
    useContextMenuPosition<{ messageId: string }>({
      skipSelector: ".chat-message-context-menu, .chat-message-reaction-menu"
    });

  return {
    messageContextMenu,
    setMessageContextMenu
  };
}
