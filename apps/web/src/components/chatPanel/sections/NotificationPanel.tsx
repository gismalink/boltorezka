import { Button } from "../../uicomponents";

type InboxItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  messageId: string | null;
  topicId: string | null;
  roomSlug: string;
  priority: "normal" | "critical";
};

type NotificationPanelProps = {
  t: (key: string) => string;
  notificationScope: "server" | "topic" | "room";
  setNotificationScope: (value: "server" | "topic" | "room") => void;
  notificationMode: "all" | "mentions" | "none";
  setNotificationMode: (value: "all" | "mentions" | "none") => void;
  notificationSaving: boolean;
  updateNotificationSettings: (muteUntil: string | null) => Promise<void>;
  inboxLoading: boolean;
  inboxItems: InboxItem[];
  loadInbox: () => Promise<void>;
  markInboxAllRead: () => Promise<void>;
  openInboxItem: (eventId: string) => Promise<void>;
  markInboxItemRead: (eventId: string) => Promise<void>;
  formatMessageTime: (value: string) => string;
  notificationStatusText: string;
};

export function NotificationPanel({
  t,
  notificationScope,
  setNotificationScope,
  notificationMode,
  setNotificationMode,
  notificationSaving,
  updateNotificationSettings,
  inboxLoading,
  inboxItems,
  loadInbox,
  markInboxAllRead,
  openInboxItem,
  markInboxItemRead,
  formatMessageTime,
  notificationStatusText
}: NotificationPanelProps) {
  return (
    <div className="chat-notification-panel mb-3">
      <div className="chat-notification-row">
        <span className="chat-topic-label">{t("chat.notificationTitle")}</span>
        <select
          aria-label={t("chat.notificationScopeAria")}
          value={notificationScope}
          onChange={(event) => setNotificationScope(event.target.value as "server" | "topic" | "room")}
          disabled={notificationSaving}
        >
          <option value="server">{t("chat.notificationScopeServer")}</option>
          <option value="topic">{t("chat.notificationScopeTopic")}</option>
          <option value="room">{t("chat.notificationScopeRoom")}</option>
        </select>
        <select
          aria-label={t("chat.notificationModeAria")}
          value={notificationMode}
          onChange={(event) => setNotificationMode(event.target.value as "all" | "mentions" | "none")}
          disabled={notificationSaving}
        >
          <option value="all">{t("chat.notificationModeAll")}</option>
          <option value="mentions">{t("chat.notificationModeMentions")}</option>
          <option value="none">{t("chat.notificationModeNone")}</option>
        </select>
        <Button
          type="button"
          className="secondary"
          onClick={() => void updateNotificationSettings(null)}
          disabled={notificationSaving}
        >
          {notificationSaving ? t("chat.loading") : t("chat.notificationSave")}
        </Button>
      </div>
      <div className="chat-notification-row chat-inbox-actions-row">
        <span className="chat-topic-label">{t("chat.inboxTitle")}</span>
        <Button type="button" className="secondary tiny" onClick={() => void loadInbox()} disabled={inboxLoading}>
          {inboxLoading ? t("chat.loading") : t("chat.inboxRefresh")}
        </Button>
        <Button type="button" className="secondary tiny" onClick={() => void markInboxAllRead()} disabled={inboxLoading || inboxItems.length === 0}>
          {t("chat.inboxMarkAllRead")}
        </Button>
      </div>
      {inboxItems.length > 0 ? (
        <div className="chat-inbox-list">
          {inboxItems.map((item) => (
            <article key={item.id} className={`chat-inbox-item ${item.readAt ? "" : "chat-inbox-item-unread"}`}>
              <div className="chat-inbox-item-head">
                <strong>{item.title}</strong>
                <span>{formatMessageTime(item.createdAt)}</span>
              </div>
              <p className="chat-inbox-item-body">{item.body}</p>
              <div className="chat-inbox-item-actions">
                {item.priority === "critical" ? <span className="chat-inbox-priority">{t("chat.inboxCritical")}</span> : null}
                <Button type="button" className="secondary tiny" onClick={() => void openInboxItem(item.id)}>
                  {t("chat.inboxOpen")}
                </Button>
                {!item.readAt ? (
                  <Button type="button" className="secondary tiny" onClick={() => void markInboxItemRead(item.id)}>
                    {t("chat.inboxMarkRead")}
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="chat-notification-status">{t("chat.inboxEmpty")}</div>
      )}
      {notificationStatusText ? <div className="chat-notification-status" role="status" aria-live="polite">{notificationStatusText}</div> : null}
    </div>
  );
}
