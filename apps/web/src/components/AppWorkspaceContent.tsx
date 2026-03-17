import type { ReactNode } from "react";

type Translate = (key: string) => string;

type MobileTab = "channels" | "chat" | "settings";

function MobileTabBar({
  t,
  mobileTab,
  onSelectTab,
  hasUser
}: {
  t: Translate;
  mobileTab: MobileTab;
  onSelectTab: (tab: MobileTab) => void;
  hasUser: boolean;
}) {
  return (
    <nav className="mobile-tabbar grid grid-cols-3 gap-2" aria-label={t("mobile.tabsAria") }>
      <button
        type="button"
        className={`secondary mobile-tab-btn inline-flex items-center justify-center gap-2 ${mobileTab === "channels" ? "mobile-tab-btn-active" : ""}`}
        onClick={() => onSelectTab("channels")}
      >
        <i className="bi bi-hash" aria-hidden="true" />
        <span>{t("mobile.tabChannels")}</span>
      </button>
      <button
        type="button"
        className={`secondary mobile-tab-btn inline-flex items-center justify-center gap-2 ${mobileTab === "chat" ? "mobile-tab-btn-active" : ""}`}
        onClick={() => onSelectTab("chat")}
      >
        <i className="bi bi-chat-dots" aria-hidden="true" />
        <span>{t("mobile.tabChat")}</span>
      </button>
      <button
        type="button"
        className={`secondary mobile-tab-btn inline-flex items-center justify-center gap-2 ${mobileTab === "settings" ? "mobile-tab-btn-active" : ""}`}
        onClick={() => onSelectTab("settings")}
        disabled={!hasUser}
      >
        <i className="bi bi-gear" aria-hidden="true" />
        <span>{t("mobile.tabSettings")}</span>
      </button>
    </nav>
  );
}

export function AppWorkspaceContent({
  isMobileViewport,
  mobileTab,
  onSelectTab,
  t,
  hasUser,
  roomsPanelNode,
  chatPanelNode,
  videoWindowsNode,
  userDockNode,
  userDockInlineSettingsNode
}: {
  isMobileViewport: boolean;
  mobileTab: MobileTab;
  onSelectTab: (tab: MobileTab) => void;
  t: Translate;
  hasUser: boolean;
  roomsPanelNode: ReactNode;
  chatPanelNode: ReactNode;
  videoWindowsNode: ReactNode;
  userDockNode: ReactNode;
  userDockInlineSettingsNode: ReactNode;
}) {
  return (
    <>
      <div className={`workspace ${isMobileViewport ? "workspace-mobile" : ""} grid h-full min-h-0 items-stretch gap-4 desktop:grid-cols-[320px_1fr] desktop:gap-6`}>
        {(!isMobileViewport || mobileTab === "channels") ? (
          <aside className="leftcolumn flex min-h-0 flex-col gap-4 overflow-hidden desktop:gap-6">
            {roomsPanelNode}
            {userDockNode}
          </aside>
        ) : null}

        {(!isMobileViewport || mobileTab === "chat") ? (
          <section className="middlecolumn flex min-h-0 flex-col gap-4 desktop:gap-6">
            {chatPanelNode}
          </section>
        ) : null}

        {videoWindowsNode}

        {isMobileViewport && hasUser && mobileTab === "settings" ? (
          <aside className="leftcolumn mobile-settings-column flex min-h-0 flex-col gap-4 overflow-hidden desktop:gap-6">
            {userDockInlineSettingsNode}
          </aside>
        ) : null}
      </div>

      {isMobileViewport ? (
        <MobileTabBar
          t={t}
          mobileTab={mobileTab}
          onSelectTab={onSelectTab}
          hasUser={hasUser}
        />
      ) : null}
    </>
  );
}
