import { useState } from "react";
import { Button } from "../../uicomponents";

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
  t: (key: string) => string;
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
  formatMessageTime: (value: string) => string;
  setSearchJumpStatusText: (value: string) => void;
  setSearchJumpTarget: (value: { messageId: string; roomSlug: string; topicId: string | null }) => void;
  onClose: () => void;
};

export function SearchPanel({
  t,
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
  formatMessageTime,
  setSearchJumpStatusText,
  setSearchJumpTarget,
  onClose
}: SearchPanelProps) {
  const [showAuthorFilter, setShowAuthorFilter] = useState(Boolean(searchAuthorId));
  const [showDateFilters, setShowDateFilters] = useState(Boolean(searchFrom || searchTo));

  const jumpToResult = (item: SearchResultItem) => {
    setSearchJumpStatusText("");
    setSearchJumpTarget({
      messageId: item.id,
      roomSlug: item.roomSlug,
      topicId: item.topicId || null
    });
  };

  const imageOnlyActive = searchHasAttachment && searchAttachmentType === "image";

  return (
    <div id="chat-search-panel" className="chat-search-overlay" role="region" aria-label={t("chat.searchAction")}>
      <div className="chat-search-panel">
      <div className="chat-search-controls">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleSearchMessages();
            }
          }}
          placeholder={t("chat.searchPlaceholder")}
          disabled={searching}
          aria-label={t("chat.searchQueryAria")}
        />
        <select
          className="chat-search-scope-select"
          value={searchScope}
          onChange={(event) => setSearchScope(event.target.value as "all" | "server" | "room")}
          aria-label={t("chat.searchScopeAria")}
          disabled={searching}
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
        >
          <i className="bi bi-x-lg" aria-hidden="true" />
        </Button>
      </div>
      <div className="chat-search-filters" role="toolbar" aria-label={t("chat.searchScopeAria")}>
        <button
          type="button"
          className={`chat-search-filter-toggle ${searchHasMention ? "chat-search-filter-toggle-active" : ""}`}
          onClick={() => setSearchHasMention(!searchHasMention)}
          disabled={searching}
          data-tooltip={t("chat.searchFilterMentions")}
          aria-label={t("chat.searchFilterMentions")}
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
          }}
          disabled={searching}
          data-tooltip={t("chat.searchFilterAttachments")}
          aria-label={t("chat.searchFilterAttachments")}
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
              return;
            }

            setSearchHasAttachment(true);
            setSearchAttachmentType("image");
          }}
          disabled={searching}
          data-tooltip={t("chat.searchFilterAttachmentTypeImage")}
          aria-label={t("chat.searchFilterAttachmentTypeImage")}
        >
          <i className="bi bi-image" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`chat-search-filter-toggle ${searchHasLink ? "chat-search-filter-toggle-active" : ""}`}
          onClick={() => setSearchHasLink(!searchHasLink)}
          disabled={searching}
          data-tooltip={t("chat.searchFilterLinks")}
          aria-label={t("chat.searchFilterLinks")}
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
          }}
          disabled={searching}
          data-tooltip={t("chat.searchFilterAuthor")}
          aria-label={t("chat.searchFilterAuthor")}
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
          }}
          disabled={searching}
          data-tooltip={t("chat.searchDateRangeTooltip")}
          aria-label={t("chat.searchDateRangeTooltip")}
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
        <div className="chat-search-results">
          {searchResults.map((item) => (
            <article
              key={item.id}
              className="chat-search-result-item chat-search-result-item-clickable"
              onClick={() => jumpToResult(item)}
              role="button"
              tabIndex={0}
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
              </div>
              <div className="chat-search-result-location">
                {t("chat.searchResultLocationPrefix")} {item.roomTitle}{item.topicTitle ? ` / ${item.topicTitle}` : ""}
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
