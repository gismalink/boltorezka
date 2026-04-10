import { FormEvent, MouseEvent, RefObject } from "react";
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
  activeTopicMentionUnreadCount: number;
  topicMentionsActionLoading: boolean;
  onJumpToUnreadMention: () => void;
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
  onToggleSearchPanel,
  activeTopicMentionUnreadCount,
  topicMentionsActionLoading,
  onJumpToUnreadMention
}: TopicTabsHeaderProps) {
  return (
    <div className="chat-title-row" data-agent-id={CHAT_AGENT_IDS.topicNavigation}>
      <h2 className="chat-title-main">
        {t("chat.title")} ({hasActiveRoom ? roomTitle || roomSlug : t("chat.noChannel")})
      </h2>
      {hasActiveRoom ? (
        <div className="chat-topic-tabs-row" aria-label={t("chat.topicLabel")} data-agent-id={CHAT_AGENT_IDS.topicNavigationControls}>
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
          <div className="chat-topic-tabs-scroll" role="tablist" aria-label={t("chat.topicSelectAria")} data-agent-id={CHAT_AGENT_IDS.topicNavigationTablist}>
            {sortedTopics.length > 0 ? (
              sortedTopics.map((topic) => {
                const unreadCount = getTopicUnreadCount(topic);
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
                    {topic.title}
                    {unreadCount > 0 ? <span className="chat-topic-tab-unread">{unreadCount}</span> : null}
                  </Button>
                );
              })
            ) : (
              <span className="muted">{t("chat.topicFilterEmpty")}</span>
            )}
            {hasTopics ? (
              <Button
                type="button"
                className="secondary tiny chat-topic-tab"
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
            <Button
              type="button"
              className={`secondary tiny icon-btn chat-topic-tab chat-search-toggle-btn ${searchPanelOpen ? "chat-search-toggle-btn-active" : ""}`}
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
            {activeTopicMentionUnreadCount > 0 ? (
              <Button
                type="button"
                className="secondary tiny chat-topic-tab chat-topic-mention-nav-btn"
                onClick={onJumpToUnreadMention}
                onContextMenu={(event) => event.preventDefault()}
                disabled={topicMentionsActionLoading}
                data-tooltip={t("chat.topicMentionsJumpTooltip")}
                aria-label={t("chat.topicMentionsJumpTooltip")}
              >
                <span aria-hidden="true">@</span>
                <span>{activeTopicMentionUnreadCount}</span>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
