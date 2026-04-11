import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type ComponentProps, type FormEvent } from "react";
import { AppWorkspaceContent } from "./AppWorkspaceContent";
import { ChatPanel } from "./ChatPanel";
import { RoomsPanel } from "./RoomsPanel";
import { UserDock } from "./UserDock";
import { VideoWindowsOverlay } from "./VideoWindowsOverlay";
import { useDmOptional } from "./dm/DmContext";
import type { DmMessageItem } from "../api";
import type { ChatAttachment, Message } from "../domain";
import {
  compressImageToDataUrl,
  normalizeImageSource,
  extractImageSourceFromClipboardHtml,
  extractImageSourceFromClipboardText
} from "../utils/chatImagePayload";
import {
  DEFAULT_CHAT_IMAGE_DATA_URL_LENGTH,
  DEFAULT_CHAT_IMAGE_MAX_SIDE,
  DEFAULT_CHAT_IMAGE_QUALITY
} from "../constants/appConfig";

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

  // Авто-закрытие DM при смене комнаты (переключение между чатами)
  const prevRoomSlugRef = useRef(chatPanelProps.roomSlug);
  useEffect(() => {
    if (prevRoomSlugRef.current !== chatPanelProps.roomSlug && isDmActive && dm) {
      dm.closeDm();
    }
    prevRoomSlugRef.current = chatPanelProps.roomSlug;
  }, [chatPanelProps.roomSlug, isDmActive, dm]);

  const dmImagePolicy = useMemo(() => ({
    maxDataUrlLength: DEFAULT_CHAT_IMAGE_DATA_URL_LENGTH,
    maxImageSide: DEFAULT_CHAT_IMAGE_MAX_SIDE,
    jpegQuality: DEFAULT_CHAT_IMAGE_QUALITY
  }), []);

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
      user_name: msg.senderName,
      attachments: Array.isArray(msg.attachmentsJson)
        ? (msg.attachmentsJson as ChatAttachment[])
        : undefined
    }));
  }, [isDmActive, dm?.activeThreadId, dm?.messages]);

  const handleDmPaste = useCallback((event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!dm) return;

    const clipboard = event.clipboardData;
    const files = Array.from(clipboard?.files || []);
    const imageFile = files.find((file) => file.type.startsWith("image/"))
      || Array.from(clipboard?.items || [])
        .map((item) => item.getAsFile())
        .find((file): file is File => Boolean(file && file.type.startsWith("image/")));

    const htmlImageSource = normalizeImageSource(extractImageSourceFromClipboardHtml(String(clipboard?.getData("text/html") || "")));
    const textImageSource = normalizeImageSource(extractImageSourceFromClipboardText(String(clipboard?.getData("text/plain") || "")));
    const hasImagePayload = Boolean(imageFile || htmlImageSource || textImageSource);
    if (!hasImagePayload) return;

    event.preventDefault();
    void (async () => {
      try {
        if (imageFile) {
          const dataUrl = await compressImageToDataUrl(imageFile, dmImagePolicy);
          dm.setPendingDmImageDataUrl(dataUrl);
          return;
        }

        if (htmlImageSource.startsWith("data:image/")) {
          const response = await fetch(htmlImageSource);
          const blob = await response.blob();
          const synthesizedFile = new File([blob], "clipboard-image", { type: blob.type || "image/png" });
          const dataUrl = await compressImageToDataUrl(synthesizedFile, dmImagePolicy);
          dm.setPendingDmImageDataUrl(dataUrl);
          return;
        }

        if (/^https?:\/\//i.test(htmlImageSource)) {
          dm.setPendingDmImageDataUrl(htmlImageSource);
          return;
        }

        if (textImageSource.startsWith("data:image/")) {
          const response = await fetch(textImageSource);
          const blob = await response.blob();
          const synthesizedFile = new File([blob], "clipboard-image", { type: blob.type || "image/png" });
          const dataUrl = await compressImageToDataUrl(synthesizedFile, dmImagePolicy);
          dm.setPendingDmImageDataUrl(dataUrl);
          return;
        }
      } catch {
        // compression/fetch error — ignore
      }
    })();
  }, [dm, dmImagePolicy]);

  const dmHeaderSlot = isDmActive && dm ? (
    <div className="flex items-center gap-2 border-b border-[var(--pixel-border)] px-4 py-2">
      <i className="bi bi-chat-dots text-[var(--pixel-accent)]" aria-hidden="true" />
      <h2 className="m-0 truncate text-sm font-semibold">{dm.activePeerName || "DM"}</h2>
    </div>
  ) : null;

  // ─── DM editing state ──────────────────────────────
  const [dmEditingMessageId, setDmEditingMessageId] = useState<string | null>(null);

  const handleDmEditMessage = useCallback((messageId: string) => {
    if (!dm) return;
    const msg = dm.messages.find((m) => m.id === messageId);
    if (!msg) return;
    setDmEditingMessageId(messageId);
    dm.setDmText(msg.body);
  }, [dm]);

  const handleDmCancelEdit = useCallback(() => {
    setDmEditingMessageId(null);
    dm?.setDmText("");
  }, [dm]);

  const handleDmDeleteMessage = useCallback((messageId: string) => {
    if (!dm) return;
    dm.deleteDmMessage(messageId);
  }, [dm]);

  const handleDmSendMessage = useCallback((event: FormEvent) => {
    event.preventDefault();
    if (!dm) return;

    if (dmEditingMessageId) {
      const text = dm.dmText.trim();
      if (text) {
        dm.editDmMessage(dmEditingMessageId, text);
      }
      setDmEditingMessageId(null);
      dm.setDmText("");
      return;
    }

    const text = dm.dmText.trim();
    const image = dm.pendingDmImageDataUrl;
    if (text || image) dm.sendDmMessage(text, image);
  }, [dm, dmEditingMessageId]);

  // reset editing state when DM closes
  useEffect(() => {
    if (!isDmActive) setDmEditingMessageId(null);
  }, [isDmActive]);

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
        onSendMessage: handleDmSendMessage,
        onChatPaste: handleDmPaste,
        messagesHasMore: dm.messagesHasMore,
        loadingOlderMessages: dm.loading,
        onLoadOlderMessages: () => { dm.loadOlderMessages(); },
        editingMessageId: dmEditingMessageId,
        replyingToMessage: null,
        onCancelEdit: handleDmCancelEdit,
        onCancelReply: noop,
        onEditMessage: handleDmEditMessage,
        onDeleteMessage: handleDmDeleteMessage,
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
        composePreviewImageUrl: dm.pendingDmImageDataUrl,
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
