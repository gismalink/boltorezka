import { useMemo, type ComponentProps, type FormEvent } from "react";
import { AppWorkspaceContent } from "./AppWorkspaceContent";
import { ChatPanel } from "./ChatPanel";
import { RoomsPanel } from "./RoomsPanel";
import { UserDock } from "./UserDock";
import { VideoWindowsOverlay } from "./VideoWindowsOverlay";
import { useDmOptional } from "./dm/DmContext";
import type { DmMessageItem } from "../api";
import type { Message } from "../domain";

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

  const dmMessages: Message[] = useMemo(() => {
    if (!isDmActive || !dm) return [];
    return dm.messages.map((msg: DmMessageItem) => ({
      id: msg.id,
      room_id: dm.activeThreadId || "",
      topic_id: null,
      user_id: msg.senderUserId,
      text: msg.body,
      created_at: msg.createdAt,
      edited_at: msg.editedAt,
      user_name: msg.senderName
    }));
  }, [isDmActive, dm?.activeThreadId, dm?.messages]);

  const dmHeaderSlot = isDmActive && dm ? (
    <div className="flex items-center gap-2 border-b border-[var(--pixel-border)] px-4 py-2">
      <button
        type="button"
        className="secondary icon-btn tiny"
        onClick={dm.closeDm}
        aria-label={t("actions.back")}
      >
        <i className="bi bi-arrow-left" aria-hidden="true" />
      </button>
      <i className="bi bi-chat-dots text-[var(--pixel-accent)]" aria-hidden="true" />
      <h2 className="m-0 truncate text-sm font-semibold">{dm.activePeerName || "DM"}</h2>
    </div>
  ) : null;

  const noopAsync = async () => {};
  const noop = () => {};

  const resolvedChatPanelProps: ComponentProps<typeof ChatPanel> = isDmActive && dm
    ? {
        ...chatPanelProps,
        headerSlot: dmHeaderSlot,
        messages: dmMessages,
        roomSlug: "dm",
        roomId: dm.activeThreadId || "",
        roomTitle: dm.activePeerName || "DM",
        topics: [],
        activeTopicId: null,
        chatText: dm.dmText,
        onSetChatText: dm.setDmText,
        onSendMessage: (event: FormEvent) => {
          event.preventDefault();
          const text = dm.dmText.trim();
          if (text) dm.sendDmMessage(text);
        },
        messagesHasMore: dm.messagesHasMore,
        loadingOlderMessages: dm.loading,
        onLoadOlderMessages: () => { dm.loadOlderMessages(); },
        editingMessageId: null,
        replyingToMessage: null,
        onCancelEdit: noop,
        onCancelReply: noop,
        onEditMessage: noop,
        onDeleteMessage: noop,
        onReportMessage: noop,
        onReplyMessage: noop,
        pinnedByMessageId: {},
        reactionsByMessageId: {},
        onTogglePinMessage: noop,
        onToggleMessageReaction: noop,
        onCreateTopic: noopAsync,
        onSelectTopic: noop,
        onUpdateTopic: noopAsync,
        onArchiveTopic: noopAsync,
        onUnarchiveTopic: noopAsync,
        onDeleteTopic: noopAsync,
        onConsumeTopicMentionUnread: noop,
        onSetTopicMentionUnreadLocal: noop,
        onApplyTopicReadLocal: noop,
        composePreviewImageUrl: null,
        composePendingAttachmentName: null,
        mentionCandidates: [],
        typingUsers: [],
        canManageTopicModeration: false,
        showVideoToggle: false
      }
    : chatPanelProps;

  return (
    <AppWorkspaceContent
      isMobileViewport={isMobileViewport}
      mobileTab={mobileTab}
      onSelectTab={onSelectTab}
      t={t}
      hasUser={hasUser}
      roomsPanelNode={<RoomsPanel {...roomsPanelProps} />}
      chatPanelNode={<ChatPanel {...resolvedChatPanelProps} />}
      videoWindowsNode={<VideoWindowsOverlay {...videoWindowsOverlayProps} />}
      userDockNode={userDockSharedProps ? <UserDock {...userDockSharedProps} inlineSettingsMode={false} /> : null}
      userDockInlineSettingsNode={userDockSharedProps ? <UserDock {...userDockSharedProps} inlineSettingsMode /> : null}
    />
  );
}
