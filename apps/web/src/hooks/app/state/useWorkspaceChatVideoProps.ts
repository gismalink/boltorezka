// Purpose: map app/runtime chat state into presentational props for ChatPanel and VideoWindowsOverlay.
import type { Message } from "../../../domain";
import type { RoomTopic } from "../../../domain";

type Translate = (key: string) => string;

type ChatPanelProps = {
  t: Translate;
  locale: string;
  currentServerId: string;
  roomSlug: string;
  roomId: string;
  roomTitle: string;
  topics: RoomTopic[];
  activeTopicId: string | null;
  authToken: string;
  messages: Message[];
  currentUserId: string | null;
  messagesHasMore: boolean;
  loadingOlderMessages: boolean;
  chatText: string;
  composePreviewImageUrl: string | null;
  composePendingAttachmentName: string | null;
  typingUsers: string[];
  chatLogRef: React.RefObject<HTMLDivElement>;
  onLoadOlderMessages: () => void;
  onSetChatText: (value: string) => void;
  onOpenRoomChat: (slug: string) => void;
  onSelectTopic: (topicId: string) => void;
  onCreateTopic: (title: string) => Promise<void>;
  onChatPaste: (event: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onChatInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSendMessage: (event: React.FormEvent) => void;
  onSelectAttachmentFile: (file: File | null) => void;
  onClearPendingAttachment: () => void;
  editingMessageId: string | null;
  replyingToMessage: { id: string; userName: string; text: string } | null;
  showVideoToggle: boolean;
  videoWindowsVisible: boolean;
  onToggleVideoWindows: () => void;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  onEditMessage: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReportMessage: (messageId: string) => void;
  onReplyMessage: (messageId: string) => void;
  pinnedByMessageId: Record<string, boolean>;
  reactionsByMessageId: Record<string, Record<string, { count: number; reacted: boolean }>>;
  onTogglePinMessage: (messageId: string) => void;
  onToggleMessageReaction: (messageId: string, emoji: string) => void;
  onUpdateTopic: (topicId: string, title: string) => Promise<void>;
  onArchiveTopic: (topicId: string) => Promise<void>;
  onUnarchiveTopic: (topicId: string) => Promise<void>;
  onDeleteTopic: (topicId: string) => Promise<void>;
};

type VideoWindowsOverlayProps = {
  t: Translate;
  currentUserId: string;
  localUserLabel: string;
  localCameraEnabled: boolean;
  localVideoStream: MediaStream | null;
  remoteVideoStreamsByUserId: Record<string, MediaStream>;
  remoteCameraEnabledByUserId: Record<string, boolean>;
  remoteLabelsByUserId: Record<string, string>;
  screenShareStream: MediaStream | null;
  screenShareOwnerLabel: string;
  screenShareOwnerUserId: string;
  screenShareActive: boolean;
  minWidth: number;
  maxWidth: number;
  visible: boolean;
  speakingWindowIds: string[];
};

type UseWorkspaceChatVideoPropsInput = {
  t: Translate;
  locale: string;
  currentServerId: string;
  authToken: string;
  chatRoomSlug: string;
  activeChatRoomId: string;
  activeChatRoomTitle: string;
  chatTopics: RoomTopic[];
  activeChatTopicId: string | null;
  setActiveChatTopicId: React.Dispatch<React.SetStateAction<string | null>>;
  createTopic: (title: string) => Promise<void>;
  messages: Message[];
  currentUserId: string | null;
  messagesHasMore: boolean;
  loadingOlderMessages: boolean;
  chatText: string;
  pendingChatImageDataUrl: string | null;
  pendingChatAttachmentFile: File | null;
  activeChatTypingUsers: string[];
  chatLogRef: React.RefObject<HTMLDivElement>;
  loadOlderMessages: () => void;
  setChatText: (value: string) => void;
  openRoomChat: (slug: string) => void;
  handleChatPaste: (event: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleChatInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  sendMessage: (event: React.FormEvent) => void;
  selectAttachmentFile: (file: File | null) => void;
  clearPendingAttachment: () => void;
  editingMessageId: string | null;
  replyingToMessageId: string | null;
  currentRoomSupportsRtc: boolean;
  videoWindowsVisible: boolean;
  setVideoWindowsVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setEditingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  setReplyingToMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  startEditingMessage: (messageId: string) => void;
  replyToMessage: (messageId: string) => void;
  cancelReply: () => void;
  deleteOwnMessage: (messageId: string) => void;
  reportMessage: (messageId: string) => void;
  pinnedByMessageId: Record<string, boolean>;
  reactionsByMessageId: Record<string, Record<string, { count: number; reacted: boolean }>>;
  togglePinMessage: (messageId: string) => void;
  toggleMessageReaction: (messageId: string, emoji: string) => void;
  updateTopic: (topicId: string, title: string) => Promise<void>;
  archiveTopic: (topicId: string) => Promise<void>;
  unarchiveTopic: (topicId: string) => Promise<void>;
  deleteTopic: (topicId: string) => Promise<void>;
  userName: string;
  allowVideoStreaming: boolean;
  cameraEnabled: boolean;
  localVideoStream: MediaStream | null;
  remoteVideoStreamsByUserId: Record<string, MediaStream>;
  effectiveVoiceCameraEnabledByUserIdInCurrentRoom: Record<string, boolean>;
  remoteVideoLabelsByUserId: Record<string, string>;
  activeScreenShare:
    | {
        stream: MediaStream;
        ownerLabel: string;
        ownerUserId: string;
      }
    | null;
  normalizedServerVideoWindowMinWidth: number;
  normalizedServerVideoWindowMaxWidth: number;
  speakingVideoWindowIds: string[];
};

export function useWorkspaceChatVideoProps({
  t,
  locale,
  currentServerId,
  authToken,
  chatRoomSlug,
  activeChatRoomId,
  activeChatRoomTitle,
  chatTopics,
  activeChatTopicId,
  setActiveChatTopicId,
  createTopic,
  messages,
  currentUserId,
  messagesHasMore,
  loadingOlderMessages,
  chatText,
  pendingChatImageDataUrl,
  pendingChatAttachmentFile,
  activeChatTypingUsers,
  chatLogRef,
  loadOlderMessages,
  setChatText,
  openRoomChat,
  handleChatPaste,
  handleChatInputKeyDown,
  sendMessage,
  selectAttachmentFile,
  clearPendingAttachment,
  editingMessageId,
  replyingToMessageId,
  currentRoomSupportsRtc,
  videoWindowsVisible,
  setVideoWindowsVisible,
  setEditingMessageId,
  setReplyingToMessageId,
  startEditingMessage,
  replyToMessage,
  cancelReply,
  deleteOwnMessage,
  reportMessage,
  pinnedByMessageId,
  reactionsByMessageId,
  togglePinMessage,
  toggleMessageReaction,
  updateTopic,
  archiveTopic,
  unarchiveTopic,
  deleteTopic,
  userName,
  allowVideoStreaming,
  cameraEnabled,
  localVideoStream,
  remoteVideoStreamsByUserId,
  effectiveVoiceCameraEnabledByUserIdInCurrentRoom,
  remoteVideoLabelsByUserId,
  activeScreenShare,
  normalizedServerVideoWindowMinWidth,
  normalizedServerVideoWindowMaxWidth,
  speakingVideoWindowIds
}: UseWorkspaceChatVideoPropsInput): {
  chatPanelProps: ChatPanelProps;
  videoWindowsOverlayProps: VideoWindowsOverlayProps;
} {
  const chatPanelProps: ChatPanelProps = {
    t,
    locale,
    currentServerId,
    roomSlug: chatRoomSlug,
    roomId: activeChatRoomId,
    roomTitle: activeChatRoomTitle,
    topics: chatTopics,
    activeTopicId: activeChatTopicId,
    authToken,
    messages,
    currentUserId,
    messagesHasMore,
    loadingOlderMessages,
    chatText,
    composePreviewImageUrl: pendingChatImageDataUrl,
    composePendingAttachmentName: pendingChatAttachmentFile ? String(pendingChatAttachmentFile.name || "") : null,
    typingUsers: activeChatTypingUsers,
    chatLogRef,
    onLoadOlderMessages: () => void loadOlderMessages(),
    onSetChatText: setChatText,
    onOpenRoomChat: openRoomChat,
    onSelectTopic: (topicId: string) => setActiveChatTopicId(topicId || null),
    onCreateTopic: createTopic,
    onChatPaste: handleChatPaste,
    onChatInputKeyDown: handleChatInputKeyDown,
    onSendMessage: sendMessage,
    onSelectAttachmentFile: selectAttachmentFile,
    onClearPendingAttachment: clearPendingAttachment,
    editingMessageId,
    replyingToMessage: replyingToMessageId
      ? (() => {
        const target = messages.find((item) => item.id === replyingToMessageId);
        if (!target) {
          return null;
        }

        return {
          id: target.id,
          userName: target.user_name,
          text: target.text
        };
      })()
      : null,
    showVideoToggle: currentRoomSupportsRtc,
    videoWindowsVisible,
    onToggleVideoWindows: () => setVideoWindowsVisible((prev) => !prev),
    onCancelEdit: () => {
      setEditingMessageId(null);
      setChatText("");
    },
    onCancelReply: () => {
      setReplyingToMessageId(null);
      cancelReply();
    },
    onEditMessage: startEditingMessage,
    onDeleteMessage: deleteOwnMessage,
    onReportMessage: reportMessage,
    onReplyMessage: replyToMessage,
    pinnedByMessageId,
    reactionsByMessageId,
    onTogglePinMessage: togglePinMessage,
    onToggleMessageReaction: toggleMessageReaction,
    onUpdateTopic: updateTopic,
    onArchiveTopic: archiveTopic,
    onUnarchiveTopic: unarchiveTopic,
    onDeleteTopic: deleteTopic
  };

  const videoWindowsOverlayProps: VideoWindowsOverlayProps = {
    t,
    currentUserId: currentUserId || "",
    localUserLabel: userName || t("video.you"),
    localCameraEnabled: allowVideoStreaming && cameraEnabled,
    localVideoStream,
    remoteVideoStreamsByUserId,
    remoteCameraEnabledByUserId: effectiveVoiceCameraEnabledByUserIdInCurrentRoom,
    remoteLabelsByUserId: remoteVideoLabelsByUserId,
    screenShareStream: activeScreenShare?.stream || null,
    screenShareOwnerLabel: activeScreenShare?.ownerLabel || "",
    screenShareOwnerUserId: activeScreenShare?.ownerUserId || "",
    screenShareActive: Boolean(activeScreenShare?.stream),
    minWidth: normalizedServerVideoWindowMinWidth,
    maxWidth: normalizedServerVideoWindowMaxWidth,
    visible: currentRoomSupportsRtc && videoWindowsVisible,
    speakingWindowIds: speakingVideoWindowIds
  };

  return {
    chatPanelProps,
    videoWindowsOverlayProps
  };
}
