/**
 * SearchPanel.tsx — боковая панель результатов поиска по сообщениям.
 * Показывает список hits, подсвечивает вхождения и переводит к выбранному сообщению.
 */
import { useState } from "react";
import {
  CHAT_AGENT_FAILURE_REASONS,
  CHAT_AGENT_IDS,
  CHAT_AGENT_STATUS_STYLE,
  buildChatAgentStatus,
  normalizeChatAgentFailureReason
} from "../../../constants/chatAgentSemantics";
import { Button } from "../../uicomponents";
import { useChatPanelCtx } from "../ChatPanelContext";
import { asTrimmedString } from "../../../utils/stringUtils";

type SearchResultItem = {
  id: string;
  roomSlug: string;
  roomTitle: string;
  topicId: string | null;
  topicTitle: string | null;
  userName: string;
  text: string;
  createdAt: string;
  hasAttachments: boolean;
};

type SearchPanelProps = {
  searching: boolean;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  searchScope: "all" | "server" | "room";
  setSearchScope: (value: "all" | "server" | "room") => void;
  handleSearchMessages: () => Promise<void>;
  searchHasMention: boolean;
  setSearchHasMention: (value: boolean) => void;
  searchHasAttachment: boolean;
  setSearchHasAttachment: (value: boolean) => void;
  searchAttachmentType: "" | "image";
  setSearchAttachmentType: (value: "" | "image") => void;
  searchHasLink: boolean;
  setSearchHasLink: (value: boolean) => void;
  searchAuthorId: string;
  setSearchAuthorId: (value: string) => void;
  searchFrom: string;
  setSearchFrom: (value: string) => void;
  searchTo: string;
  setSearchTo: (value: string) => void;
  searchJumpStatusText: string;
  searchError: string;
  searchResults: SearchResultItem[];
  searchResultsHasMore: boolean;
  setSearchJumpStatusText: (value: string) => void;
  setSearchJumpTarget: (value: { messageId: string; roomSlug: string; topicId: string | null }) => void;
  onClose: () => void;
};

export function SearchPanel({
  searching,
  searchQuery,
  setSearchQuery,
  searchScope,
  setSearchScope,
  handleSearchMessages,
  searchHasMention,
  setSearchHasMention,
  searchHasAttachment,
  setSearchHasAttachment,
  searchAttachmentType,
  setSearchAttachmentType,
  searchHasLink,
  setSearchHasLink,
  searchAuthorId,
  setSearchAuthorId,
  searchFrom,
  setSearchFrom,
  searchTo,
  setSearchTo,
  searchJumpStatusText,
  searchError,
  searchResults,
  searchResultsHasMore,
  setSearchJumpStatusText,
  setSearchJumpTarget,
  onClose
}: SearchPanelProps) {
  const { t, formatMessageTime } = useChatPanelCtx();
  const [showAuthorFilter, setShowAuthorFilter] = useState(Boolean(searchAuthorId));
  const [showDateFilters, setShowDateFilters] = useState(Boolean(searchFrom || searchTo));
  const [searchStatusText, setSearchStatusText] = useState("");

  const runSearchWithStatus = async () => {
    const normalizedQuery = asTrimmedString(searchQuery);
    if (!normalizedQuery) {
      setSearchStatusText(buildChatAgentStatus("search", "failed", CHAT_AGENT_FAILURE_REASONS.emptyQuery));
      return;
    }

    setSearchStatusText(buildChatAgentStatus("search", "requested"));
    try {
      await handleSearchMessages();
      setSearchStatusText(buildChatAgentStatus("search", "accepted"));
    } catch (error) {
      setSearchStatusText(buildChatAgentStatus("search", "failed", normalizeChatAgentFailureReason(error)));
    }
  };

  const jumpToResult = (item: SearchResultItem) => {
    setSearchStatusText(`jump:${item.id}`);
    setSearchJumpStatusText("");
    setSearchJumpTarget({
      messageId: item.id,
      roomSlug: item.roomSlug,
      topicId: item.topicId || null
    });
    onClose();
  };

  const imageOnlyActive = searchHasAttachment && searchAttachmentType === "image";

  return (
    <div
      id="chat-search-panel"
      className="chat-search-overlay"
      role="region"
      aria-label={t("chat.searchAction")}
      data-agent-id={CHAT_AGENT_IDS.searchPanel}
    >
      <div className="chat-search-panel" data-agent-id={CHAT_AGENT_IDS.searchContainer}>
      <div
        className="chat-search-more-hint"
        role="status"
        aria-live="polite"
        data-agent-id={CHAT_AGENT_IDS.searchStatus}
        style={CHAT_AGENT_STATUS_STYLE}
      >
        {searchStatusText || searchJumpStatusText}
      </div>
      <div className="chat-search-controls">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void runSearchWithStatus();
            }
          }}
          placeholder={t("chat.searchPlaceholder")}
          disabled={searching}
          aria-label={t("chat.searchQueryAria")}
          data-agent-id={CHAT_AGENT_IDS.searchQuery}
        />
        <select
          className="chat-search-scope-select"
          value={searchScope}
          onChange={(event) => {
            const value = event.target.value as "all" | "server" | "room";
            setSearchScope(value);
            setSearchStatusText(`scope:${value}`);
          }}
          aria-label={t("chat.searchScopeAria")}
          disabled={searching}
          data-agent-id={CHAT_AGENT_IDS.searchScope}
        >
          <option value="all">{t("chat.searchScopeAll")}</option>
          <option value="server">{t("chat.searchScopeServer")}</option>
          <option value="room">{t("chat.searchScopeRoom")}</option>
        </select>
        <Button
          type="button"
          className="secondary tiny icon-btn"
          onClick={onClose}
          data-tooltip={t("chat.searchCloseTooltip")}
          aria-label={t("chat.searchCloseTooltip")}
          data-agent-id={CHAT_AGENT_IDS.searchClose}
        >
          <i className="bi bi-x-lg" aria-hidden="true" />
        </Button>
      </div>
      <div className="chat-search-filters" role="toolbar" aria-label={t("chat.searchScopeAria")} data-agent-id={CHAT_AGENT_IDS.searchFilters}>
        <button
          type="button"
          className={`chat-search-filter-toggle ${searchHasMention ? "chat-search-filter-toggle-active" : ""}`}
          onClick={() => {
            const next = !searchHasMention;
            setSearchHasMention(next);
            setSearchStatusText(`filter:mentions:${next ? "on" : "off"}`);
          }}
          disabled={searching}
          data-tooltip={t("chat.searchFilterMentions")}
          aria-label={t("chat.searchFilterMentions")}
          data-agent-id={CHAT_AGENT_IDS.searchFilterMentions}
          data-agent-state={searchHasMention ? "on" : "off"}
        >
          <i className="bi bi-at" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`chat-search-filter-toggle ${searchHasAttachment ? "chat-search-filter-toggle-active" : ""}`}
          onClick={() => {
            const next = !searchHasAttachment;
            setSearchHasAttachment(next);
            if (!next) {
              setSearchAttachmentType("");
            }
            setSearchStatusText(`filter:attachments:${next ? "on" : "off"}`);
          }}
          disabled={searching}
          data-tooltip={t("chat.searchFilterAttachments")}
          aria-label={t("chat.searchFilterAttachments")}
          data-agent-id={CHAT_AGENT_IDS.searchFilterAttachments}
          data-agent-state={searchHasAttachment ? "on" : "off"}
        >
          <i className="bi bi-paperclip" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`chat-search-filter-toggle ${imageOnlyActive ? "chat-search-filter-toggle-active" : ""}`}
          onClick={() => {
            if (imageOnlyActive) {
              setSearchAttachmentType("");
              setSearchHasAttachment(false);
              setSearchStatusText("filter:image:off");
              return;
            }

            setSearchHasAttachment(true);
            setSearchAttachmentType("image");
            setSearchStatusText("filter:image:on");
          }}
          disabled={searching}
          data-tooltip={t("chat.searchFilterAttachmentTypeImage")}
          aria-label={t("chat.searchFilterAttachmentTypeImage")}
          data-agent-id={CHAT_AGENT_IDS.searchFilterImage}
          data-agent-state={imageOnlyActive ? "on" : "off"}
        >
          <i className="bi bi-image" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`chat-search-filter-toggle ${searchHasLink ? "chat-search-filter-toggle-active" : ""}`}
          onClick={() => {
            const next = !searchHasLink;
            setSearchHasLink(next);
            setSearchStatusText(`filter:links:${next ? "on" : "off"}`);
          }}
          disabled={searching}
          data-tooltip={t("chat.searchFilterLinks")}
          aria-label={t("chat.searchFilterLinks")}
          data-agent-id={CHAT_AGENT_IDS.searchFilterLinks}
          data-agent-state={searchHasLink ? "on" : "off"}
        >
          <i className="bi bi-link-45deg" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`chat-search-filter-toggle ${showAuthorFilter ? "chat-search-filter-toggle-active" : ""}`}
          onClick={() => {
            const next = !showAuthorFilter;
            setShowAuthorFilter(next);
            if (!next) {
              setSearchAuthorId("");
            }
            setSearchStatusText(`filter:author:${next ? "on" : "off"}`);
          }}
          disabled={searching}
          data-tooltip={t("chat.searchFilterAuthor")}
          aria-label={t("chat.searchFilterAuthor")}
          data-agent-id={CHAT_AGENT_IDS.searchFilterAuthor}
          data-agent-state={showAuthorFilter ? "on" : "off"}
        >
          <i className="bi bi-person" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`chat-search-filter-toggle ${showDateFilters ? "chat-search-filter-toggle-active" : ""}`}
          onClick={() => {
            const next = !showDateFilters;
            setShowDateFilters(next);
            if (!next) {
              setSearchFrom("");
              setSearchTo("");
            }
            setSearchStatusText(`filter:date:${next ? "on" : "off"}`);
          }}
          disabled={searching}
          data-tooltip={t("chat.searchDateRangeTooltip")}
          aria-label={t("chat.searchDateRangeTooltip")}
          data-agent-id={CHAT_AGENT_IDS.searchFilterDate}
          data-agent-state={showDateFilters ? "on" : "off"}
        >
          <i className="bi bi-calendar-range" aria-hidden="true" />
        </button>
      </div>
      {showAuthorFilter ? (
        <div className="chat-search-filter-field">
          <input
            type="text"
            value={searchAuthorId}
            onChange={(event) => setSearchAuthorId(event.target.value)}
            placeholder={t("chat.searchFilterAuthorPlaceholder")}
            aria-label={t("chat.searchFilterAuthorAria")}
            disabled={searching}
          />
        </div>
      ) : null}
      {showDateFilters ? (
        <div className="chat-search-filter-row">
          <div className="chat-search-filter-field">
            <input
              type="datetime-local"
              value={searchFrom}
              onChange={(event) => setSearchFrom(event.target.value)}
              aria-label={t("chat.searchFilterFromAria")}
              placeholder={t("chat.searchFilterFrom")}
              disabled={searching}
            />
          </div>
          <div className="chat-search-filter-field">
            <input
              type="datetime-local"
              value={searchTo}
              onChange={(event) => setSearchTo(event.target.value)}
              aria-label={t("chat.searchFilterToAria")}
              placeholder={t("chat.searchFilterTo")}
              disabled={searching}
            />
          </div>
        </div>
      ) : null}
      {searchJumpStatusText ? <div className="chat-search-more-hint">{searchJumpStatusText}</div> : null}
      {searchError ? <div className="chat-search-error">{searchError}</div> : null}
      {searchResults.length > 0 ? (
        <div className="chat-search-results" role="list" data-agent-id={CHAT_AGENT_IDS.searchResults}>
          {searchResults.map((item) => (
            <article
              key={item.id}
              className="chat-search-result-item chat-search-result-item-clickable"
              onClick={() => jumpToResult(item)}
              role="button"
              tabIndex={0}
              data-agent-id={CHAT_AGENT_IDS.searchResult}
              data-agent-result-id={item.id}
              data-agent-room-slug={item.roomSlug}
              data-agent-topic-id={item.topicId || ""}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  jumpToResult(item);
                }
              }}
            >
              <div className="chat-search-result-meta">
                <span>{item.userName}</span>
                <span>{formatMessageTime(item.createdAt)}</span>
                <span>{item.roomTitle}</span>
                <span>{item.topicTitle || "-"}</span>
              </div>
              <p className="chat-search-result-text">{item.text}</p>
              {item.hasAttachments ? <span className="chat-search-result-attachments">{t("chat.searchHasAttachmentsBadge")}</span> : null}
            </article>
          ))}
          {searchResultsHasMore ? <div className="chat-search-more-hint">{t("chat.searchMoreHint")}</div> : null}
        </div>
      ) : null}
      </div>
    </div>
  );
}
