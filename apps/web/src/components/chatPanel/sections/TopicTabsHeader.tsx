import { FormEvent, MouseEvent, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RoomTopic } from "../../../domain";
import { CHAT_AGENT_IDS } from "../../../constants/chatAgentSemantics";
import { Button, PopupPortal } from "../../uicomponents";

type TopicTabsHeaderProps = {
  t: (key: string) => string;
  hasActiveRoom: boolean;
  roomTitle: string;
  roomSlug: string;
  hasTopics: boolean;
  topicCreatePopupRef: RefObject<HTMLDivElement>;
  topicCreateOpen: boolean;
  setTopicCreateOpen: (value: boolean) => void;
  newTopicTitle: string;
  setNewTopicTitle: (value: string) => void;
  creatingTopic: boolean;
  handleCreateTopicSubmit: (event: FormEvent) => void;
  sortedTopics: RoomTopic[];
  getTopicUnreadCount: (topic: RoomTopic) => number;
  activeTopicId: string | null;
  onSelectTopic: (topicId: string) => void;
  openTopicContextMenu: (topicId: string, event: MouseEvent<HTMLButtonElement>) => void;
  openTopicPalette: () => void;
  topicPaletteOpen: boolean;
  searchPanelOpen: boolean;
  onToggleSearchPanel: () => void;
};

export function TopicTabsHeader({
  t,
  hasActiveRoom,
  roomTitle,
  roomSlug,
  hasTopics,
  topicCreatePopupRef,
  topicCreateOpen,
  setTopicCreateOpen,
  newTopicTitle,
  setNewTopicTitle,
  creatingTopic,
  handleCreateTopicSubmit,
  sortedTopics,
  getTopicUnreadCount,
  activeTopicId,
  onSelectTopic,
  openTopicContextMenu,
  openTopicPalette,
  topicPaletteOpen,
  searchPanelOpen,
  onToggleSearchPanel
}: TopicTabsHeaderProps) {
  const tabsViewportRef = useRef<HTMLDivElement | null>(null);
  const [topicTabsOverflowed, setTopicTabsOverflowed] = useState(false);

  const tabsTopics = useMemo(() => {
    const normalizedMainTopicTitle = String(roomTitle || roomSlug || "").trim().toLowerCase();

    return [...sortedTopics].sort((left, right) => {
      const leftIsMain = normalizedMainTopicTitle && String(left.title || "").trim().toLowerCase() === normalizedMainTopicTitle;
      const rightIsMain = normalizedMainTopicTitle && String(right.title || "").trim().toLowerCase() === normalizedMainTopicTitle;
      if (leftIsMain !== rightIsMain) {
        return leftIsMain ? -1 : 1;
      }

      const positionDiff = Number(left.position || 0) - Number(right.position || 0);
      if (positionDiff !== 0) {
        return positionDiff;
      }

      return String(left.title || "").localeCompare(String(right.title || ""));
    });
  }, [roomSlug, roomTitle, sortedTopics]);

  const measureTabsOverflow = useCallback(() => {
    const viewport = tabsViewportRef.current;
    if (!viewport) {
      setTopicTabsOverflowed(false);
      return;
    }

    const hasOverflow = viewport.scrollWidth > viewport.clientWidth + 1;
    setTopicTabsOverflowed(hasOverflow);
  }, []);

  const tabsCountsSignature = useMemo(
    () => tabsTopics.map((topic) => `${topic.id}:${Number(topic.unreadCount || 0)}:${Number(topic.mentionUnreadCount || 0)}`).join("|"),
    [tabsTopics]
  );

  useEffect(() => {
    measureTabsOverflow();
  }, [measureTabsOverflow, tabsTopics, tabsCountsSignature]);

  useEffect(() => {
    const viewport = tabsViewportRef.current;
    if (!viewport) {
      return;
    }

    const observer = new ResizeObserver(() => {
      measureTabsOverflow();
    });

    observer.observe(viewport);
    window.addEventListener("resize", measureTabsOverflow);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureTabsOverflow);
    };
  }, [measureTabsOverflow]);

  return (
    <div className="chat-title-row" data-agent-id={CHAT_AGENT_IDS.topicNavigation}>
      {hasActiveRoom ? (
        <div className="chat-topic-tabs-row" aria-label={t("chat.topicLabel")} data-agent-id={CHAT_AGENT_IDS.topicNavigationControls}>
          <div className="chat-topic-tabs-main" data-agent-id={CHAT_AGENT_IDS.topicNavigationTablist}>
            <div className="chat-topic-tabs-viewport" ref={tabsViewportRef}>
              <div className="chat-topic-tabs-scroll" role="tablist" aria-label={t("chat.topicSelectAria")}>
                {tabsTopics.length > 0 ? (
                  tabsTopics.map((topic) => {
                    const unreadCount = getTopicUnreadCount(topic);
                    const mentionUnreadCount = Math.max(0, Number(topic.mentionUnreadCount || 0));
                    const isActiveTab = String(topic.id || "").trim() === String(activeTopicId || "").trim();

                    return (
                      <Button
                        key={topic.id}
                        type="button"
                        className={`secondary tiny chat-topic-tab ${isActiveTab ? "chat-topic-tab-active" : ""}`}
                        onClick={() => onSelectTopic(topic.id)}
                        onContextMenu={(event) => openTopicContextMenu(topic.id, event)}
                        role="tab"
                        aria-selected={isActiveTab}
                        aria-label={topic.title}
                        data-agent-id={CHAT_AGENT_IDS.topicNavigationTab}
                        data-agent-topic-id={String(topic.id || "")}
                        data-agent-topic-title={topic.title}
                        data-agent-state={isActiveTab ? "active" : "inactive"}
                        data-agent-unread-count={String(unreadCount)}
                      >
                        {topic.isPinned ? `${t("chat.topicPinnedBadge")} ` : ""}
                        <span className="chat-topic-tab-title">{topic.title}</span>
                        {unreadCount > 0 ? <span className="chat-topic-tab-unread">{unreadCount}</span> : null}
                        {mentionUnreadCount > 0 ? <span className="room-mention-badge chat-topic-tab-mention">@{mentionUnreadCount}</span> : null}
                      </Button>
                    );
                  })
                ) : (
                  <span className="muted">{t("chat.topicFilterEmpty")}</span>
                )}
              </div>
            </div>
            {hasTopics && topicTabsOverflowed ? (
              <Button
                type="button"
                className="secondary tiny chat-topic-tab chat-topic-palette-toggle"
                onClick={openTopicPalette}
                onContextMenu={(event) => event.preventDefault()}
                aria-haspopup="dialog"
                aria-expanded={topicPaletteOpen}
                aria-controls="chat-topic-palette-dialog"
                aria-label={t("chat.topicPaletteOpen")}
                data-agent-id={CHAT_AGENT_IDS.topicNavigationPalette}
              >
                <span aria-hidden="true">...</span>
              </Button>
            ) : null}
          </div>

          <div className="chat-topic-tabs-actions">
            <div className="popup-anchor chat-topic-create-anchor" ref={topicCreatePopupRef}>
              <Button
                type="button"
                className="secondary tiny icon-btn chat-topic-create-toggle"
                onClick={() => setTopicCreateOpen(!topicCreateOpen)}
                data-tooltip={t("chat.createTopicTooltip")}
                aria-label={t("chat.createTopicTooltip")}
                aria-expanded={topicCreateOpen}
                aria-controls="chat-topic-create-popup"
                data-agent-id={CHAT_AGENT_IDS.topicNavigationCreate}
              >
                <span aria-hidden="true">+</span>
              </Button>
              <PopupPortal
                open={topicCreateOpen}
                anchorRef={topicCreatePopupRef}
                className="settings-popup chat-topic-create-popup"
                placement="bottom-start"
              >
                <form id="chat-topic-create-popup" className="chat-topic-create-popup-form" onSubmit={handleCreateTopicSubmit}>
                  <h3 className="subheading">{t("chat.createTopic")}</h3>
                  <input
                    type="text"
                    className="chat-topic-create-input"
                    value={newTopicTitle}
                    onChange={(event) => setNewTopicTitle(event.target.value)}
                    placeholder={t("chat.newTopicPlaceholder")}
                    disabled={creatingTopic}
                    aria-label={t("chat.newTopicAria")}
                    autoFocus
                  />
                  <div className="chat-topic-create-popup-actions">
                    <Button type="submit" className="icon-action" disabled={creatingTopic || newTopicTitle.trim().length === 0}>
                      {creatingTopic ? t("chat.loading") : t("chat.createTopic")}
                    </Button>
                    <Button
                      type="button"
                      className="secondary tiny"
                      disabled={creatingTopic}
                      onClick={() => {
                        setNewTopicTitle("");
                        setTopicCreateOpen(false);
                      }}
                    >
                      {t("chat.editTopicCancel")}
                    </Button>
                  </div>
                </form>
              </PopupPortal>
            </div>
            <Button
              type="button"
              className={`secondary tiny icon-btn chat-search-toggle-btn ${searchPanelOpen ? "chat-search-toggle-btn-active" : ""}`}
              onClick={onToggleSearchPanel}
              onContextMenu={(event) => event.preventDefault()}
              aria-expanded={searchPanelOpen}
              aria-controls="chat-search-panel"
              data-tooltip={searchPanelOpen ? t("chat.searchCloseTooltip") : t("chat.searchOpenTooltip")}
              aria-label={searchPanelOpen ? t("chat.searchCloseTooltip") : t("chat.searchOpenTooltip")}
              data-agent-id={CHAT_AGENT_IDS.topicNavigationSearchToggle}
              data-agent-state={searchPanelOpen ? "open" : "closed"}
            >
              <i className="bi bi-search" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
