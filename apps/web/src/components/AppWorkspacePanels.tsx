import type { ComponentProps } from "react";
import { AppWorkspaceContent } from "./AppWorkspaceContent";
import { ChatPanel } from "./ChatPanel";
import { RoomsPanel } from "./RoomsPanel";
import { UserDock } from "./UserDock";
import { VideoWindowsOverlay } from "./VideoWindowsOverlay";
import { useDmOptional } from "./dm/DmContext";
import { DmChatPanel } from "./dm/DmChatPanel";

type Translate = (key: string) => string;

type MobileTab = "channels" | "chat" | "settings";

type AppWorkspacePanelsProps = {
  isMobileViewport: boolean;
  mobileTab: MobileTab;
  onSelectTab: (tab: MobileTab) => void;
  t: Translate;
  hasUser: boolean;
  userDockSharedProps: ComponentProps<typeof UserDock> | null;
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
  userDockSharedProps,
  roomsPanelProps,
  chatPanelProps,
  videoWindowsOverlayProps
}: AppWorkspacePanelsProps) {
  const dm = useDmOptional();
  const isDmActive = Boolean(dm?.activeThreadId);

  return (
    <AppWorkspaceContent
      isMobileViewport={isMobileViewport}
      mobileTab={mobileTab}
      onSelectTab={onSelectTab}
      t={t}
      hasUser={hasUser}
      roomsPanelNode={<RoomsPanel {...roomsPanelProps} />}
      chatPanelNode={isDmActive ? <DmChatPanel t={t} /> : <ChatPanel {...chatPanelProps} />}
      videoWindowsNode={<VideoWindowsOverlay {...videoWindowsOverlayProps} />}
      userDockNode={userDockSharedProps ? <UserDock {...userDockSharedProps} inlineSettingsMode={false} /> : null}
      userDockInlineSettingsNode={userDockSharedProps ? <UserDock {...userDockSharedProps} inlineSettingsMode /> : null}
    />
  );
}
