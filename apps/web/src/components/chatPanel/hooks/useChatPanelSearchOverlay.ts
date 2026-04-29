/**
 * useChatPanelSearchOverlay.ts — хук видимости оверлея поиска.
 * Управляет открытием/закрытием панели поиска и фокусом ввода.
 */
import { useEffect, useState } from "react";
  hasActiveRoom: boolean;
};

export function useChatPanelSearchOverlay({ hasActiveRoom }: UseChatPanelSearchOverlayArgs) {
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);

  useEffect(() => {
    if (!hasActiveRoom) {
      setSearchPanelOpen(false);
    }
  }, [hasActiveRoom]);

  return {
    searchPanelOpen,
    openSearchPanel: () => setSearchPanelOpen(true),
    closeSearchPanel: () => setSearchPanelOpen(false),
    toggleSearchPanel: () => setSearchPanelOpen((prev) => !prev)
  };
}