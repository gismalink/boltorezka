/**
 * ChatFloatingActions.tsx — плавающие кнопки поверх таймлайна чата.
 * Содержит кнопки scroll-to-bottom, jump-to-mention, jump-to-unread.
 */
import { Button } from "../../uicomponents";

type ChatFloatingActionsProps = {
  t: (key: string) => string;
  hasActiveRoom: boolean;
  activeTopicMentionUnreadCount: number;
  topicMentionsActionLoading: boolean;
  jumpToNextTopicUnreadMention: () => Promise<void>;
  showScrollToBottomButton: boolean;
  scrollTimelineToBottom: () => void;
};

export function ChatFloatingActions({
  t,
  hasActiveRoom,
  activeTopicMentionUnreadCount,
  topicMentionsActionLoading,
  jumpToNextTopicUnreadMention,
  showScrollToBottomButton,
  scrollTimelineToBottom
}: ChatFloatingActionsProps) {
  if (!hasActiveRoom) {
    return null;
  }

  return (
    <div className="chat-floating-actions" aria-live="polite">
      {activeTopicMentionUnreadCount > 0 ? (
        <Button
          type="button"
          className="secondary tiny chat-floating-action-btn chat-floating-mention-btn"
          onClick={() => void jumpToNextTopicUnreadMention()}
          onContextMenu={(event) => event.preventDefault()}
          disabled={topicMentionsActionLoading}
          data-tooltip={t("chat.topicMentionsJumpTooltip")}
          aria-label={t("chat.topicMentionsJumpTooltip")}
        >
          <span aria-hidden="true">@</span>
          <span>{activeTopicMentionUnreadCount}</span>
        </Button>
      ) : null}
      {showScrollToBottomButton ? (
        <Button
          type="button"
          className="secondary tiny icon-btn chat-floating-action-btn"
          onClick={scrollTimelineToBottom}
          onContextMenu={(event) => event.preventDefault()}
          data-tooltip={t("rooms.down")}
          aria-label={t("rooms.down")}
        >
          <i className="bi bi-arrow-down" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
