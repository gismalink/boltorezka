/**
 * useMessageContextMenu.ts — хук контекстного меню сообщения в чате.
 * Обёртка над useContextMenuPosition с хранением выбранного сообщения и хелперами закрытия.
 */
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
