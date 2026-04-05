import { useEffect, useState } from "react";

type UseChatPanelSearchOverlayArgs = {
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