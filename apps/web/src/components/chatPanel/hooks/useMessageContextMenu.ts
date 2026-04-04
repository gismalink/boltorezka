import { useCallback, useEffect, useState } from "react";

type MessageContextMenuState = { messageId: string; x: number; y: number } | null;

export function useMessageContextMenu() {
  const [messageContextMenu, setMessageContextMenu] = useState<MessageContextMenuState>(null);

  useEffect(() => {
    if (!messageContextMenu) {
      return;
    }

    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        setMessageContextMenu(null);
        return;
      }

      if (target.closest(".chat-message-context-menu") || target.closest(".chat-message-reaction-menu")) {
        return;
      }

      setMessageContextMenu(null);
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setMessageContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [messageContextMenu]);

  return {
    messageContextMenu,
    setMessageContextMenu
  };
}
