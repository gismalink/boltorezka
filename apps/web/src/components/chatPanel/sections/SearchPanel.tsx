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
  searchScope: "all" | "server" | "room" | "topic";
  setSearchScope: (value: "all" | "server" | "room" | "topic") => void;
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
  setSearchJumpTarget
}: SearchPanelProps) {
  return (
    <div className="chat-search-panel mb-3">
      <div className="chat-search-controls">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t("chat.searchPlaceholder")}
          disabled={searching}
          aria-label={t("chat.searchQueryAria")}
        />
        <select
          aria-label={t("chat.searchScopeAria")}
          value={searchScope}
          onChange={(event) => setSearchScope(event.target.value as "all" | "server" | "room" | "topic")}
          disabled={searching}
        >
          <option value="topic">{t("chat.searchScopeTopic")}</option>
          <option value="room">{t("chat.searchScopeRoom")}</option>
          <option value="server">{t("chat.searchScopeServer")}</option>
          <option value="all">{t("chat.searchScopeAll")}</option>
        </select>
        <Button
          type="button"
          className="secondary"
          onClick={() => void handleSearchMessages()}
          disabled={searching || searchQuery.trim().length === 0}
        >
          {searching ? t("chat.loading") : t("chat.searchAction")}
        </Button>
      </div>
      <div className="chat-search-filters">
        <label>
          <input
            type="checkbox"
            checked={searchHasMention}
            onChange={(event) => setSearchHasMention(event.target.checked)}
            disabled={searching}
          />
          <span>{t("chat.searchFilterMentions")}</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={searchHasAttachment}
            onChange={(event) => setSearchHasAttachment(event.target.checked)}
            disabled={searching}
          />
          <span>{t("chat.searchFilterAttachments")}</span>
        </label>
        <label className="chat-search-filter-field">
          <span>{t("chat.searchFilterAttachmentType")}</span>
          <select
            value={searchAttachmentType}
            onChange={(event) => setSearchAttachmentType(event.target.value as "" | "image")}
            aria-label={t("chat.searchFilterAttachmentTypeAria")}
            disabled={searching}
          >
            <option value="">{t("chat.searchFilterAttachmentTypeAny")}</option>
            <option value="image">{t("chat.searchFilterAttachmentTypeImage")}</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={searchHasLink}
            onChange={(event) => setSearchHasLink(event.target.checked)}
            disabled={searching}
          />
          <span>{t("chat.searchFilterLinks")}</span>
        </label>
        <label className="chat-search-filter-field">
          <span>{t("chat.searchFilterAuthor")}</span>
          <input
            type="text"
            value={searchAuthorId}
            onChange={(event) => setSearchAuthorId(event.target.value)}
            placeholder={t("chat.searchFilterAuthorPlaceholder")}
            aria-label={t("chat.searchFilterAuthorAria")}
            disabled={searching}
          />
        </label>
        <label className="chat-search-filter-field">
          <span>{t("chat.searchFilterFrom")}</span>
          <input
            type="datetime-local"
            value={searchFrom}
            onChange={(event) => setSearchFrom(event.target.value)}
            aria-label={t("chat.searchFilterFromAria")}
            disabled={searching}
          />
        </label>
        <label className="chat-search-filter-field">
          <span>{t("chat.searchFilterTo")}</span>
          <input
            type="datetime-local"
            value={searchTo}
            onChange={(event) => setSearchTo(event.target.value)}
            aria-label={t("chat.searchFilterToAria")}
            disabled={searching}
          />
        </label>
      </div>
      {searchJumpStatusText ? <div className="chat-search-more-hint">{searchJumpStatusText}</div> : null}
      {searchError ? <div className="chat-search-error">{searchError}</div> : null}
      {searchResults.length > 0 ? (
        <div className="chat-search-results">
          {searchResults.map((item) => (
            <article key={item.id} className="chat-search-result-item">
              <div className="chat-search-result-meta">
                <span>{item.userName}</span>
                <span>{item.topicTitle || item.roomTitle}</span>
                <span>{formatMessageTime(item.createdAt)}</span>
              </div>
              <p className="chat-search-result-text">{item.text}</p>
              {item.hasAttachments ? <span className="chat-search-result-attachments">{t("chat.searchHasAttachmentsBadge")}</span> : null}
              <Button
                type="button"
                className="secondary tiny chat-search-result-jump"
                onClick={() => {
                  setSearchJumpStatusText("");
                  setSearchJumpTarget({
                    messageId: item.id,
                    roomSlug: item.roomSlug,
                    topicId: item.topicId || null
                  });
                }}
              >
                {t("chat.searchJumpToMessage")}
              </Button>
            </article>
          ))}
          {searchResultsHasMore ? <div className="chat-search-more-hint">{t("chat.searchMoreHint")}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
