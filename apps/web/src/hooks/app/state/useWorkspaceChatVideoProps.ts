import type { Message } from "../../../domain";

type Translate = (key: string) => string;

type ChatPanelProps = {
  t: Translate;
  locale: string;
  roomSlug: string;
  roomTitle: string;
  authToken: string;
  messages: Message[];
  currentUserId: string | null;
  messagesHasMore: boolean;
  loadingOlderMessages: boolean;
  chatText: string;
  composePreviewImageUrl: string | null;
  typingUsers: string[];
  chatLogRef: React.RefObject<HTMLDivElement>;
  onLoadOlderMessages: () => void;
  onSetChatText: (value: string) => void;
  onChatPaste: (event: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onChatInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSendMessage: (event: React.FormEvent) => void;
  editingMessageId: string | null;
  showVideoToggle: boolean;
  videoWindowsVisible: boolean;
  onToggleVideoWindows: () => void;
  onCancelEdit: () => void;
  onEditMessage: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
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
  authToken: string;
  chatRoomSlug: string;
  activeChatRoomTitle: string;
  messages: Message[];
  currentUserId: string | null;
  messagesHasMore: boolean;
  loadingOlderMessages: boolean;
  chatText: string;
  pendingChatImageDataUrl: string | null;
  activeChatTypingUsers: string[];
  chatLogRef: React.RefObject<HTMLDivElement>;
  loadOlderMessages: () => void;
  setChatText: (value: string) => void;
  handleChatPaste: (event: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleChatInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  sendMessage: (event: React.FormEvent) => void;
  editingMessageId: string | null;
  currentRoomSupportsRtc: boolean;
  videoWindowsVisible: boolean;
  setVideoWindowsVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setEditingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  startEditingMessage: (messageId: string) => void;
  deleteOwnMessage: (messageId: string) => void;
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
  authToken,
  chatRoomSlug,
  activeChatRoomTitle,
  messages,
  currentUserId,
  messagesHasMore,
  loadingOlderMessages,
  chatText,
  pendingChatImageDataUrl,
  activeChatTypingUsers,
  chatLogRef,
  loadOlderMessages,
  setChatText,
  handleChatPaste,
  handleChatInputKeyDown,
  sendMessage,
  editingMessageId,
  currentRoomSupportsRtc,
  videoWindowsVisible,
  setVideoWindowsVisible,
  setEditingMessageId,
  startEditingMessage,
  deleteOwnMessage,
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
    roomSlug: chatRoomSlug,
    roomTitle: activeChatRoomTitle,
    authToken,
    messages,
    currentUserId,
    messagesHasMore,
    loadingOlderMessages,
    chatText,
    composePreviewImageUrl: pendingChatImageDataUrl,
    typingUsers: activeChatTypingUsers,
    chatLogRef,
    onLoadOlderMessages: () => void loadOlderMessages(),
    onSetChatText: setChatText,
    onChatPaste: handleChatPaste,
    onChatInputKeyDown: handleChatInputKeyDown,
    onSendMessage: sendMessage,
    editingMessageId,
    showVideoToggle: currentRoomSupportsRtc,
    videoWindowsVisible,
    onToggleVideoWindows: () => setVideoWindowsVisible((prev) => !prev),
    onCancelEdit: () => {
      setEditingMessageId(null);
      setChatText("");
    },
    onEditMessage: startEditingMessage,
    onDeleteMessage: deleteOwnMessage
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
