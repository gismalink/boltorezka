/**
 * chatPanelTypes.ts — общие типы ChatPanel и его секций.
 * Описывает props таймлайна, композера, оверлеев, топиков и поиска.
 */
import type { ClipboardEvent, FormEvent, KeyboardEvent, ReactNode, RefObject } from "react";
import type { Message, RoomTopic } from "../../domain";

export type MentionCandidate = {
  key: string;
  kind: "user" | "tag" | "all";
  handle: string;
  label: string;
  userId?: string;
  userIds?: string[];
  subtitle?: string | null;
};

export function toMentionHandle(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}._-]/gu, "")
    .replace(/_{2,}/g, "_")
    .replace(/^[_\.\-]+|[_\.\-]+$/g, "")
    .slice(0, 32);
}

export type ChatPanelProps = {
  t: (key: string) => string;
  locale: string;
  currentServerId: string;
  roomSlug: string;
  roomId: string;
  roomTitle: string;
  topics: RoomTopic[];
  activeTopicId: string | null;
  authToken: string;
  sendWsEventAwaitAck?: (
    eventType: string,
    payload: Record<string, unknown>,
    options?: { withIdempotency?: boolean; maxRetries?: number }
  ) => Promise<void>;
  messages: Message[];
  currentUserId: string | null;
  messagesHasMore: boolean;
  loadingOlderMessages: boolean;
  chatText: string;
  composePreviewImageUrl: string | null;
  composePendingAttachments: Array<{ name: string; sizeBytes: number }>;
  typingUsers: string[];
  chatLogRef: RefObject<HTMLDivElement>;
  onLoadOlderMessages: () => void;
  onLoadMessagesAroundAnchor: (
    topicId: string,
    anchorMessageId: string,
    options?: {
      aroundWindowBefore?: number;
      aroundWindowAfter?: number;
    }
  ) => Promise<boolean>;
  onSetChatText: (value: string) => void;
  onOpenRoomChat: (slug: string) => void;
  onSelectTopic: (topicId: string) => void;
  onCreateTopic: (title: string) => Promise<void>;
  onChatPaste: (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onChatInputKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSendMessage: (event: FormEvent) => void;
  onSelectAttachmentFiles: (files: File[]) => void;
  onRemovePendingAttachmentAt: (index: number) => void;
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
  onConsumeTopicMentionUnread: (topicId: string) => void;
  onSetTopicMentionUnreadLocal: (topicId: string, count: number) => void;
  onApplyTopicReadLocal: (topicId: string) => void;
  canManageTopicModeration: boolean;
  mentionCandidates: MentionCandidate[];
  /** When provided, replaces the default topic-tabs header with custom content (used by DM). */
  headerSlot?: ReactNode;
};
