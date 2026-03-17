import type { ComponentProps, ReactNode } from "react";
import { AppWorkspaceContent } from "./AppWorkspaceContent";
import { ChatPanel } from "./ChatPanel";
import { RoomsPanel } from "./RoomsPanel";
import { VideoWindowsOverlay } from "./VideoWindowsOverlay";

type Translate = (key: string) => string;

type MobileTab = "channels" | "chat" | "settings";

type AppWorkspacePanelsProps = {
  isMobileViewport: boolean;
  mobileTab: MobileTab;
  onSelectTab: (tab: MobileTab) => void;
  t: Translate;
  hasUser: boolean;
  userDockNode: ReactNode;
  userDockInlineSettingsNode: ReactNode;
  roomsPanelProps: ComponentProps<typeof RoomsPanel>;
  chatPanelProps: ComponentProps<typeof ChatPanel>;
  videoWindowsOverlayProps: ComponentProps<typeof VideoWindowsOverlay>;
};

export function AppWorkspacePanels({
  isMobileViewport,
  mobileTab,
  onSelectTab,
  t,
  hasUser,
  userDockNode,
  userDockInlineSettingsNode,
  roomsPanelProps,
  chatPanelProps,
  videoWindowsOverlayProps
}: AppWorkspacePanelsProps) {
  return (
    <AppWorkspaceContent
      isMobileViewport={isMobileViewport}
      mobileTab={mobileTab}
      onSelectTab={onSelectTab}
      t={t}
      hasUser={hasUser}
      roomsPanelNode={<RoomsPanel {...roomsPanelProps} />}
      chatPanelNode={<ChatPanel {...chatPanelProps} />}
      videoWindowsNode={<VideoWindowsOverlay {...videoWindowsOverlayProps} />}
      userDockNode={userDockNode}
      userDockInlineSettingsNode={userDockInlineSettingsNode}
    />
  );
}
