/**
 * AppWorkspacePanels.tsx — координатор левой/правой рабочих панелей.
 *
 * Назначение:
 * - Оркестрирует RoomsPanel/ChatPanel/UserDock в одном рабочем лейауте.
 * - Управляет размерами панелей, drag’н’drop вложений, клипборд-paste в чат.
 * - Связывает ChatPanel с RoomsPanel через общие обработчики выбора комнаты.
 */
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

  // Закрытие DM когда пользователь открывает чат комнаты (slug становится непустым)
  const prevRoomSlugRef = useRef(chatPanelProps.roomSlug);
  useEffect(() => {
    const newSlug = chatPanelProps.roomSlug;
    if (prevRoomSlugRef.current !== newSlug && newSlug && isDmActive && dm) {
      dm.closeDm();
    }
    prevRoomSlugRef.current = newSlug;
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
      reply_to_message_id: msg.replyToMessageId,
      reply_to_user_id: msg.replyToUserId,
      reply_to_user_name: msg.replyToUserName,
      reply_to_text: msg.replyToText,
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

  // ─── DM reply state ────────────────────────────────
  const [dmReplyingToMessage, setDmReplyingToMessage] = useState<{ id: string; userName: string; text: string } | null>(null);

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
    if (text || image) dm.sendDmMessage(text, image, dmReplyingToMessage?.id || undefined);
    setDmReplyingToMessage(null);
  }, [dm, dmEditingMessageId, dmReplyingToMessage]);

  const handleDmReplyMessage = useCallback((messageId: string) => {
    if (!dm) return;
    const msg = dm.messages.find((m) => m.id === messageId);
    if (!msg) return;
    setDmReplyingToMessage({ id: msg.id, userName: msg.senderName, text: msg.body });
  }, [dm]);

  const handleDmCancelReply = useCallback(() => {
    setDmReplyingToMessage(null);
  }, []);

  // ─── DM reactions map ──────────────────────────────
  const currentUserId = chatPanelProps.currentUserId;

  const dmReactionsByMessageId = useMemo(() => {
    if (!isDmActive || !dm) return {};
    const map: Record<string, Record<string, { count: number; reacted: boolean }>> = {};
    for (const r of dm.dmReactions) {
      if (!map[r.messageId]) map[r.messageId] = {};
      if (!map[r.messageId][r.emoji]) map[r.messageId][r.emoji] = { count: 0, reacted: false };
      map[r.messageId][r.emoji].count++;
      if (r.userId === currentUserId) map[r.messageId][r.emoji].reacted = true;
    }
    return map;
  }, [isDmActive, dm?.dmReactions, currentUserId]);

  const handleDmToggleReaction = useCallback((messageId: string, emoji: string) => {
    if (!dm) return;
    const msgReactions = dmReactionsByMessageId[messageId];
    const isActive = msgReactions?.[emoji]?.reacted || false;
    dm.toggleDmReaction(messageId, emoji, !isActive);
  }, [dm, dmReactionsByMessageId]);

  // reset editing/reply state when DM closes
  useEffect(() => {
    if (!isDmActive) {
      setDmEditingMessageId(null);
      setDmReplyingToMessage(null);
    }
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
        replyingToMessage: dmReplyingToMessage,
        onCancelEdit: handleDmCancelEdit,
        onCancelReply: handleDmCancelReply,
        onEditMessage: handleDmEditMessage,
        onDeleteMessage: handleDmDeleteMessage,
        onReportMessage: noop,
        onReplyMessage: handleDmReplyMessage,
        pinnedByMessageId: {},
        reactionsByMessageId: dmReactionsByMessageId,
        onTogglePinMessage: noop,
        onToggleMessageReaction: handleDmToggleReaction,
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
        composePendingAttachments: [],
        onSelectAttachmentFiles: () => {},
        onRemovePendingAttachmentAt: () => {},
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
