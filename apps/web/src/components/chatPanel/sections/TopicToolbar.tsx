import { Button } from "../../uicomponents";

type TopicToolbarProps = {
  t: (key: string) => string;
  hasTopics: boolean;
  roomUnreadCount: number;
  topicFilterMode: "all" | "active" | "unread" | "my" | "mentions" | "pinned" | "archived";
  setTopicFilterMode: (value: "all" | "active" | "unread" | "my" | "mentions" | "pinned" | "archived") => void;
  activeTopicId: string | null;
  activeTopicUnreadCount: number;
  activeTopicLastMessageId?: string;
  markReadSaving: boolean;
  markTopicRead: (topicId: string, lastReadMessageId?: string) => Promise<void>;
  markRoomRead: () => Promise<void>;
  markReadStatusText: string;
};

export function TopicToolbar({
  t,
  hasTopics,
  roomUnreadCount,
  topicFilterMode,
  setTopicFilterMode,
  activeTopicId,
  activeTopicUnreadCount,
  activeTopicLastMessageId,
  markReadSaving,
  markTopicRead,
  markRoomRead,
  markReadStatusText
}: TopicToolbarProps) {
  return (
    <div className="chat-topic-row mb-3 flex flex-wrap items-center gap-2">
      <span className="chat-topic-unread-counter">{t("chat.unreadCounter").replace("{count}", String(roomUnreadCount))}</span>
      <select
        aria-label={t("chat.topicFilterAria")}
        value={topicFilterMode}
        onChange={(event) => setTopicFilterMode(event.target.value as "all" | "active" | "unread" | "my" | "mentions" | "pinned" | "archived")}
        disabled={!hasTopics}
      >
        <option value="all">{t("chat.topicFilterAll")}</option>
        <option value="active">{t("chat.topicFilterActive")}</option>
        <option value="unread">{t("chat.topicFilterUnread")}</option>
        <option value="my">{t("chat.topicFilterMy")}</option>
        <option value="mentions">{t("chat.topicFilterMentions")}</option>
        <option value="pinned">{t("chat.topicFilterPinned")}</option>
        <option value="archived">{t("chat.topicFilterArchived")}</option>
      </select>
      <Button
        type="button"
        className="secondary tiny"
        onClick={() => void markTopicRead(String(activeTopicId || ""), activeTopicLastMessageId)}
        disabled={!activeTopicId || activeTopicUnreadCount === 0 || markReadSaving}
      >
        {t("chat.markTopicRead")}
      </Button>
      <Button
        type="button"
        className="secondary tiny"
        onClick={() => void markRoomRead()}
        disabled={roomUnreadCount === 0 || markReadSaving}
      >
        {t("chat.markRoomRead")}
      </Button>
      {markReadStatusText ? <div className="chat-topic-read-status" role="status" aria-live="polite">{markReadStatusText}</div> : null}
    </div>
  );
}
