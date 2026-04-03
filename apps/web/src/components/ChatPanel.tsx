// Purpose: presentation-only chat panel with message timeline, composer, and message-level UI actions.
import { ClipboardEvent, FormEvent, KeyboardEvent, MouseEvent, ReactNode, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Message, RoomTopic } from "../domain";
import { api } from "../api";
import { getDesktopNotificationBridge } from "../desktopBridge";
import { Button } from "./uicomponents";
import { buildChatMessageViewModels } from "../utils/chatMessageViewModel";
import { useChatTopLazyLoad } from "./chatPanel/hooks/useChatTopLazyLoad";
import { TopicTabsHeader } from "./chatPanel/sections/TopicTabsHeader";
import { NotificationPanel } from "./chatPanel/sections/NotificationPanel";
import { TopicToolbar } from "./chatPanel/sections/TopicToolbar";
import { SearchPanel } from "./chatPanel/sections/SearchPanel";

type ChatPanelProps = {
  t: (key: string) => string;
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
  chatLogRef: RefObject<HTMLDivElement>;
  onLoadOlderMessages: () => void;
  onSetChatText: (value: string) => void;
  onOpenRoomChat: (slug: string) => void;
  onSelectTopic: (topicId: string) => void;
  onCreateTopic: (title: string) => Promise<void>;
  onChatPaste: (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onChatInputKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSendMessage: (event: FormEvent) => void;
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
  thumbsUpByMessageId: Record<string, boolean>;
  onTogglePinMessage: (messageId: string) => void;
  onToggleThumbsUpReaction: (messageId: string) => void;
  onUpdateTopic: (topicId: string, title: string) => Promise<void>;
  onArchiveTopic: (topicId: string) => Promise<void>;
  onUnarchiveTopic: (topicId: string) => Promise<void>;
};

export function ChatPanel({
  t,
  locale,
  currentServerId,
  roomSlug,
  roomId,
  roomTitle,
  topics,
  activeTopicId,
  authToken,
  messages,
  currentUserId,
  messagesHasMore,
  loadingOlderMessages,
  chatText,
  composePreviewImageUrl,
  composePendingAttachmentName,
  typingUsers,
  chatLogRef,
  onLoadOlderMessages,
  onSetChatText,
  onOpenRoomChat,
  onSelectTopic,
  onCreateTopic,
  onChatPaste,
  onChatInputKeyDown,
  onSendMessage,
  onSelectAttachmentFile,
  onClearPendingAttachment,
  editingMessageId,
  replyingToMessage,
  onCancelEdit,
  onCancelReply,
  onEditMessage,
  onDeleteMessage,
  onReportMessage,
  onReplyMessage,
  pinnedByMessageId,
  thumbsUpByMessageId,
  onTogglePinMessage,
  onToggleThumbsUpReaction,
  onUpdateTopic,
  onArchiveTopic,
  onUnarchiveTopic
}: ChatPanelProps) {
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [topicCreateOpen, setTopicCreateOpen] = useState(false);
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editingTopicTitle, setEditingTopicTitle] = useState("");
  const [editingTopicSaving, setEditingTopicSaving] = useState(false);
  const [editingTopicStatusText, setEditingTopicStatusText] = useState("");
  const [archivingTopicId, setArchivingTopicId] = useState<string | null>(null);
  const [topicFilterMode, setTopicFilterMode] = useState<"all" | "active" | "unread" | "my" | "mentions" | "pinned" | "archived">("all");
  const [topicPaletteOpen, setTopicPaletteOpen] = useState(false);
  const [topicPaletteQuery, setTopicPaletteQuery] = useState("");
  const [topicPaletteSelectedIndex, setTopicPaletteSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<"all" | "server" | "room" | "topic">("topic");
  const [searchHasMention, setSearchHasMention] = useState(false);
  const [searchHasAttachment, setSearchHasAttachment] = useState(false);
  const [searchAttachmentType, setSearchAttachmentType] = useState<"" | "image">("");
  const [searchHasLink, setSearchHasLink] = useState(false);
  const [searchAuthorId, setSearchAuthorId] = useState("");
  const [searchFrom, setSearchFrom] = useState("");
  const [searchTo, setSearchTo] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [notificationScope, setNotificationScope] = useState<"server" | "topic" | "room">("topic");
  const [notificationMode, setNotificationMode] = useState<"all" | "mentions" | "none">("all");
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationStatusText, setNotificationStatusText] = useState("");
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxItems, setInboxItems] = useState<Array<{
    id: string;
    title: string;
    body: string;
    createdAt: string;
    readAt: string | null;
    messageId: string | null;
    topicId: string | null;
    roomSlug: string;
    priority: "normal" | "critical";
  }>>([]);
  const [topicUnreadOverrideById, setTopicUnreadOverrideById] = useState<Record<string, { unreadCount: number; sourceUnreadCount: number }>>({});
  const [markReadSaving, setMarkReadSaving] = useState(false);
  const [markReadStatusText, setMarkReadStatusText] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{
    id: string;
    roomSlug: string;
    roomTitle: string;
    topicId: string | null;
    topicTitle: string | null;
    userName: string;
    text: string;
    createdAt: string;
    hasAttachments: boolean;
  }>>([]);
  const [searchResultsHasMore, setSearchResultsHasMore] = useState(false);
  const [searchJumpStatusText, setSearchJumpStatusText] = useState("");
  const [searchJumpTarget, setSearchJumpTarget] = useState<{
    messageId: string;
    roomSlug: string;
    topicId: string | null;
  } | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [contextMenuMessageId, setContextMenuMessageId] = useState<string | null>(null);
  const [topicContextMenu, setTopicContextMenu] = useState<{ topicId: string; x: number; y: number } | null>(null);
  const [hotkeyStatusText, setHotkeyStatusText] = useState("");
  const [resolvedAttachmentImageUrls, setResolvedAttachmentImageUrls] = useState<Record<string, string>>({});
  const resolvedAttachmentImageUrlsRef = useRef<Record<string, string>>({});
  const topicPaletteInputRef = useRef<HTMLInputElement | null>(null);
  const topicCreatePopupRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const notifiedInboxEventIdsRef = useRef<Set<string>>(new Set());
  const notificationPermissionRequestedRef = useRef(false);
  const desktopNotificationBridgeRef = useRef(getDesktopNotificationBridge());
  const hasActiveRoom = Boolean(roomSlug);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("boltorezka:notified-inbox-events");
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        notifiedInboxEventIdsRef.current = new Set(
          parsed
            .map((item) => String(item || "").trim())
            .filter(Boolean)
            .slice(-200)
        );
      }
    } catch {
      // Local storage hydration is best-effort.
    }
  }, []);

  useEffect(() => {
    if (!activeTopicId && notificationScope === "topic") {
      setNotificationScope("room");
    }
  }, [activeTopicId, notificationScope]);

  useEffect(() => {
    if (!searchJumpTarget) {
      return;
    }

    const targetRoomSlug = String(searchJumpTarget.roomSlug || "").trim();
    const targetTopicId = String(searchJumpTarget.topicId || "").trim();
    if (!targetRoomSlug) {
      setSearchJumpTarget(null);
      return;
    }

    if (targetRoomSlug !== roomSlug) {
      onOpenRoomChat(targetRoomSlug);
      return;
    }

    if (targetTopicId && activeTopicId !== targetTopicId) {
      const hasTopic = topics.some((topic) => topic.id === targetTopicId);
      if (hasTopic) {
        onSelectTopic(targetTopicId);
      }
    }
  }, [searchJumpTarget, roomSlug, activeTopicId, topics, onOpenRoomChat, onSelectTopic]);

  useEffect(() => {
    if (!searchJumpTarget) {
      return;
    }

    const targetRoomSlug = String(searchJumpTarget.roomSlug || "").trim();
    const targetTopicId = String(searchJumpTarget.topicId || "").trim();
    const targetMessageId = String(searchJumpTarget.messageId || "").trim();
    if (!targetRoomSlug || !targetMessageId) {
      setSearchJumpTarget(null);
      return;
    }

    if (targetRoomSlug !== roomSlug) {
      return;
    }

    if (targetTopicId && activeTopicId !== targetTopicId) {
      return;
    }

    const targetNode = document.querySelector<HTMLElement>(`[data-message-id="${targetMessageId}"]`);
    if (targetNode) {
      targetNode.scrollIntoView({ behavior: "smooth", block: "center" });
      targetNode.classList.add("chat-message-jump-target");
      window.setTimeout(() => targetNode.classList.remove("chat-message-jump-target"), 1600);
      setSearchJumpTarget(null);
      setSearchJumpStatusText("");
      return;
    }

    if (!loadingOlderMessages && messagesHasMore) {
      onLoadOlderMessages();
      setSearchJumpStatusText(t("chat.searchJumpLoadingContext"));
      return;
    }

    if (!messagesHasMore && !loadingOlderMessages) {
      setSearchJumpTarget(null);
      setSearchJumpStatusText(t("chat.searchJumpNotFound"));
    }
  }, [
    searchJumpTarget,
    roomSlug,
    activeTopicId,
    loadingOlderMessages,
    messagesHasMore,
    onLoadOlderMessages,
    t
  ]);

  useEffect(() => {
    setHotkeyStatusText("");
  }, [activeTopicId, roomSlug]);

  useEffect(() => {
    setMarkReadStatusText("");
  }, [activeTopicId]);

  useEffect(() => {
    const topicIds = new Set(topics.map((topic) => topic.id));
    const unreadCountById = new Map(topics.map((topic) => [topic.id, topic.unreadCount]));

    setTopicUnreadOverrideById((prev) => {
      let changed = false;
      const next: Record<string, { unreadCount: number; sourceUnreadCount: number }> = {};

      Object.entries(prev).forEach(([topicId, override]) => {
        if (!topicIds.has(topicId)) {
          changed = true;
          return;
        }

        if (unreadCountById.get(topicId) !== override.sourceUnreadCount) {
          changed = true;
          return;
        }

        next[topicId] = override;
      });

      return changed ? next : prev;
    });
  }, [topics]);

  useEffect(() => {
    resolvedAttachmentImageUrlsRef.current = resolvedAttachmentImageUrls;
  }, [resolvedAttachmentImageUrls]);

  useEffect(
    () => () => {
      Object.values(resolvedAttachmentImageUrlsRef.current).forEach((blobUrl) => {
        URL.revokeObjectURL(blobUrl);
      });
    },
    []
  );

  useEffect(() => {
    if (!previewImageUrl) {
      return;
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewImageUrl(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [previewImageUrl]);

  useEffect(() => {
    if (!contextMenuMessageId) {
      return;
    }

    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        setContextMenuMessageId(null);
        return;
      }

      if (target.closest(".chat-context-menu") || target.closest(".chat-context-menu-toggle")) {
        return;
      }

      setContextMenuMessageId(null);
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenuMessageId(null);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenuMessageId]);

  useEffect(() => {
    if (!topicContextMenu) {
      return;
    }

    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || target.closest(".chat-topic-context-menu")) {
        return;
      }
      setTopicContextMenu(null);
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setTopicContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [topicContextMenu]);

  useEffect(() => {
    if (!topicPaletteOpen) {
      return;
    }

    setTopicPaletteQuery("");
    const topicsForInitialSelection = [...topics].sort((a, b) => {
      const pinnedDiff = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
      if (pinnedDiff !== 0) {
        return pinnedDiff;
      }

      const positionDiff = Number(a.position || 0) - Number(b.position || 0);
      if (positionDiff !== 0) {
        return positionDiff;
      }

      return String(a.title || "").localeCompare(String(b.title || ""));
    });
    const activeIndex = topicsForInitialSelection.findIndex((topic) => topic.id === activeTopicId);
    setTopicPaletteSelectedIndex(activeIndex >= 0 ? activeIndex : 0);

    const timerId = window.setTimeout(() => {
      topicPaletteInputRef.current?.focus();
      topicPaletteInputRef.current?.select();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [topicPaletteOpen, topics, activeTopicId]);

  useEffect(() => {
    if (!topicCreateOpen) {
      return;
    }

    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        setTopicCreateOpen(false);
        return;
      }

      if (target.closest(".chat-topic-create-anchor") || target.closest(".chat-topic-create-popup")) {
        return;
      }

      setTopicCreateOpen(false);
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setTopicCreateOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [topicCreateOpen]);

  useChatTopLazyLoad({
    chatLogRef,
    hasActiveRoom,
    loadingOlderMessages,
    messagesHasMore,
    onLoadOlderMessages
  });

  const composePreviewImage = composePreviewImageUrl;
  const hasTopics = topics.length > 0;
  const visibleTypingUsers = typingUsers.slice(0, 2);
  const typingOverflowCount = Math.max(0, typingUsers.length - visibleTypingUsers.length);
  const typingUsersLabel = typingOverflowCount > 0
    ? t("chat.typingUsersOverflow")
      .replace("{users}", visibleTypingUsers.join(", "))
      .replace("{count}", String(typingOverflowCount))
    : visibleTypingUsers.join(", ");
  const typingLabel = typingUsers.length <= 1
    ? t("chat.typingSingle").replace("{users}", typingUsersLabel)
    : t("chat.typingMultiple").replace("{users}", typingUsersLabel);
  const handleCreateTopic = async () => {
    const title = newTopicTitle.trim();
    if (!title || creatingTopic) {
      return;
    }

    setCreatingTopic(true);
    try {
      await onCreateTopic(title);
      setNewTopicTitle("");
      setTopicCreateOpen(false);
    } finally {
      setCreatingTopic(false);
    }
  };

  const handleCreateTopicSubmit = (event: FormEvent) => {
    event.preventDefault();
    void handleCreateTopic();
  };

  const handleSearchMessages = async () => {
    const q = searchQuery.trim();
    if (!q || searching || !authToken) {
      return;
    }

    setSearching(true);
    setSearchError("");
    try {
      const normalizeDateFilter = (value: string): string | undefined => {
        const normalizedValue = value.trim();
        if (!normalizedValue) {
          return undefined;
        }

        const parsedDate = new Date(normalizedValue);
        return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate.toISOString();
      };

      const normalizedScope = searchScope;
      const response = await api.searchMessages(authToken, {
        q,
        scope: normalizedScope,
        serverId: normalizedScope === "server" ? String(currentServerId || "").trim() || undefined : undefined,
        roomId: normalizedScope === "room" ? String(roomId || "").trim() || undefined : undefined,
        topicId: normalizedScope === "topic" ? String(activeTopicId || "").trim() || undefined : undefined,
        hasMention: searchHasMention ? true : undefined,
        hasAttachment: searchHasAttachment ? true : undefined,
        attachmentType: searchAttachmentType || undefined,
        hasLink: searchHasLink ? true : undefined,
        authorId: searchAuthorId.trim() || undefined,
        from: normalizeDateFilter(searchFrom),
        to: normalizeDateFilter(searchTo),
        limit: 25
      });

      setSearchResults(response.messages.map((item) => ({
        id: item.id,
        roomSlug: item.roomSlug,
        roomTitle: item.roomTitle,
        topicId: item.topicId,
        topicTitle: item.topicTitle,
        userName: item.userName,
        text: item.text,
        createdAt: item.createdAt,
        hasAttachments: item.hasAttachments
      })));
      setSearchResultsHasMore(Boolean(response.pagination?.hasMore));
    } catch {
      setSearchResults([]);
      setSearchResultsHasMore(false);
      setSearchError(t("chat.searchError"));
    } finally {
      setSearching(false);
    }
  };

  const updateNotificationSettings = async (muteUntil: string | null) => {
    if (!authToken || notificationSaving) {
      return;
    }

    const scopeType = notificationScope;
    if (scopeType === "topic" && !activeTopicId) {
      setNotificationStatusText(t("chat.notificationScopeUnavailable"));
      return;
    }
    if (scopeType === "server" && !String(currentServerId || "").trim()) {
      setNotificationStatusText(t("chat.notificationServerScopeUnavailable"));
      return;
    }

    setNotificationSaving(true);
    setNotificationStatusText("");
    try {
      await api.updateNotificationSettings(authToken, {
        scopeType,
        serverId: scopeType === "server" ? String(currentServerId || "") : undefined,
        roomId: scopeType === "room" ? roomId : undefined,
        topicId: scopeType === "topic" ? String(activeTopicId || "") : undefined,
        mode: notificationMode,
        allowCriticalMentions: true,
        muteUntil
      });
      setNotificationStatusText(t("chat.notificationSaved"));
    } catch {
      setNotificationStatusText(t("chat.notificationSaveError"));
    } finally {
      setNotificationSaving(false);
    }
  };

  const loadInbox = async () => {
    if (!authToken) {
      return;
    }

    setInboxLoading(true);
    try {
      const response = await api.notificationInbox(authToken, { limit: 20 });
      const nextItems = (Array.isArray(response.items) ? response.items : []).map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        createdAt: item.createdAt,
        readAt: item.readAt,
        messageId: item.messageId,
        topicId: item.topicId,
        roomSlug: String(item.payload?.roomSlug || "").trim(),
        priority: item.priority
      }));
      setInboxItems(nextItems);
    } finally {
      setInboxLoading(false);
    }
  };

  const markInboxItemRead = useCallback(async (eventId: string) => {
    if (!authToken || !eventId) {
      return;
    }

    try {
      await api.markNotificationInboxRead(authToken, eventId);
      setInboxItems((prev) => prev.map((item) => (item.id === eventId ? { ...item, readAt: item.readAt || new Date().toISOString() } : item)));
    } catch {
      // Non-blocking UI action.
    }
  }, [authToken]);

  const markInboxAllRead = async () => {
    if (!authToken || inboxLoading) {
      return;
    }

    setInboxLoading(true);
    try {
      await api.markNotificationInboxReadAll(authToken);
      const nowIso = new Date().toISOString();
      setInboxItems((prev) => prev.map((item) => ({ ...item, readAt: item.readAt || nowIso })));
    } finally {
      setInboxLoading(false);
    }
  };

  useEffect(() => {
    void loadInbox();
  }, [authToken]);

  const openInboxItem = useCallback(async (eventId: string) => {
    let item = inboxItems.find((entry) => entry.id === eventId);
    if (!item && authToken) {
      try {
        const response = await api.notificationInbox(authToken, { limit: 50 });
        const nextItems = (Array.isArray(response.items) ? response.items : []).map((entry) => ({
          id: entry.id,
          title: entry.title,
          body: entry.body,
          createdAt: entry.createdAt,
          readAt: entry.readAt,
          messageId: entry.messageId,
          topicId: entry.topicId,
          roomSlug: String(entry.payload?.roomSlug || "").trim(),
          priority: entry.priority
        }));
        setInboxItems(nextItems);
        item = nextItems.find((entry) => entry.id === eventId);
      } catch {
        // Non-blocking fallback.
      }
    }

    if (!item) {
      return;
    }

    const targetRoomSlug = String(item.roomSlug || "").trim();
    const targetMessageId = String(item.messageId || "").trim();
    if (!targetRoomSlug || !targetMessageId) {
      return;
    }

    setSearchJumpStatusText("");
    setSearchJumpTarget({
      messageId: targetMessageId,
      roomSlug: targetRoomSlug,
      topicId: item.topicId || null
    });
    await markInboxItemRead(item.id);
  }, [authToken, inboxItems, markInboxItemRead]);

  const persistNotifiedInboxEvents = useCallback(() => {
    try {
      const snapshot = Array.from(notifiedInboxEventIdsRef.current).slice(-200);
      window.localStorage.setItem("boltorezka:notified-inbox-events", JSON.stringify(snapshot));
    } catch {
      // Persisting notification dedupe state is best-effort.
    }
  }, []);

  useEffect(() => {
    const desktopBridge = desktopNotificationBridgeRef.current;
    if (!desktopBridge) {
      return;
    }

    return desktopBridge.onOpen((payload) => {
      const eventId = String(payload?.eventId || "").trim();
      if (!eventId) {
        return;
      }

      void openInboxItem(eventId);
    });
  }, [openInboxItem]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      const payload = event.data as { type?: string; eventId?: string } | undefined;
      if (payload?.type !== "push-open") {
        return;
      }

      const eventId = String(payload.eventId || "").trim();
      if (!eventId) {
        return;
      }

      void openInboxItem(eventId);
    };

    navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);

    const params = new URLSearchParams(window.location.search);
    const pushedEventId = String(params.get("pushOpen") || "").trim();
    if (pushedEventId) {
      void openInboxItem(pushedEventId);
      params.delete("pushOpen");
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash || ""}`;
      window.history.replaceState(null, "", nextUrl);
    }

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleServiceWorkerMessage);
    };
  }, [openInboxItem]);

  useEffect(() => {
    if (!authToken) {
      return;
    }

    let cancelled = false;

    const canUseBrowserNotifications = () => typeof Notification !== "undefined";

    const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
      const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
      for (let index = 0; index < rawData.length; index += 1) {
        outputArray[index] = rawData.charCodeAt(index);
      }
      return outputArray;
    };

    const maybeRequestPermission = async () => {
      if (!canUseBrowserNotifications()) {
        return;
      }

      if (notificationPermissionRequestedRef.current) {
        return;
      }

      if (Notification.permission !== "default") {
        return;
      }

      notificationPermissionRequestedRef.current = true;
      try {
        await Notification.requestPermission();
      } catch {
        // Permission prompt failures are non-fatal.
      }
    };

    const ensureWebPushSubscription = async () => {
      if (desktopNotificationBridgeRef.current) {
        return;
      }

      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        return;
      }

      const publicConfig = await api.notificationPushPublicKey(authToken);
      if (!publicConfig.enabled || !publicConfig.publicKey) {
        return;
      }

      await maybeRequestPermission();
      if (!canUseBrowserNotifications() || Notification.permission !== "granted") {
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const readyRegistration = await navigator.serviceWorker.ready;
      const effectiveRegistration = readyRegistration || registration;

      let subscription = await effectiveRegistration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await effectiveRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicConfig.publicKey) as BufferSource
        });
      }

      const json = subscription.toJSON();
      const endpoint = String(json.endpoint || "").trim();
      const p256dh = String(json.keys?.p256dh || "").trim();
      const auth = String(json.keys?.auth || "").trim();
      if (!endpoint || !p256dh || !auth) {
        return;
      }

      await api.upsertNotificationPushSubscription(authToken, {
        endpoint,
        keys: { p256dh, auth },
        expirationTime: typeof json.expirationTime === "number"
          ? new Date(json.expirationTime).toISOString()
          : null,
        runtime: "web"
      });
    };

    const showSystemNotification = async (item: {
      id: string;
      title: string;
      body: string;
    }) => {
      const desktopBridge = desktopNotificationBridgeRef.current;
      if (desktopBridge) {
        try {
          const result = await desktopBridge.show({
            eventId: item.id,
            title: item.title,
            body: item.body
          });
          if (result.ok) {
            return;
          }
        } catch {
          // Continue with browser notification fallback.
        }
      }

      if (!canUseBrowserNotifications()) {
        return;
      }

      if (Notification.permission !== "granted") {
        await maybeRequestPermission();
      }

      if (Notification.permission !== "granted") {
        return;
      }

      const browserNotification = new Notification(item.title, {
        body: item.body,
        tag: `inbox:${item.id}`
      });
      browserNotification.onclick = () => {
        window.focus();
        void openInboxItem(item.id);
      };
    };

    const pollUnreadInbox = async (initial: boolean) => {
      try {
        const response = await api.notificationInbox(authToken, {
          limit: 20,
          unreadOnly: true
        });

        if (cancelled) {
          return;
        }

        const unreadItems = (Array.isArray(response.items) ? response.items : []).map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          createdAt: item.createdAt,
          readAt: item.readAt,
          messageId: item.messageId,
          topicId: item.topicId,
          roomSlug: String(item.payload?.roomSlug || "").trim(),
          priority: item.priority
        }));

        setInboxItems((prev) => {
          if (prev.length === 0) {
            return unreadItems;
          }

          const byId = new Map(prev.map((item) => [item.id, item]));
          unreadItems.forEach((item) => {
            byId.set(item.id, item);
          });

          return Array.from(byId.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        });

        if (initial || unreadItems.length === 0) {
          unreadItems.forEach((item) => notifiedInboxEventIdsRef.current.add(item.id));
          persistNotifiedInboxEvents();
          return;
        }

        const shouldSuppressForActiveContext = (item: { roomSlug: string; topicId: string | null }) => {
          if (document.visibilityState !== "visible") {
            return false;
          }

          const sameRoom = String(item.roomSlug || "").trim() === String(roomSlug || "").trim();
          const itemTopicId = String(item.topicId || "").trim();
          const sameTopic = !itemTopicId || itemTopicId === String(activeTopicId || "").trim();
          return sameRoom && sameTopic;
        };

        const newUnreadItems = unreadItems.filter((item) => !notifiedInboxEventIdsRef.current.has(item.id));
        for (const item of [...newUnreadItems].reverse()) {
          if (shouldSuppressForActiveContext(item)) {
            notifiedInboxEventIdsRef.current.add(item.id);
            continue;
          }

          try {
            const claim = await api.claimNotificationInbox(authToken, item.id);
            if (!claim.claimed) {
              notifiedInboxEventIdsRef.current.add(item.id);
              continue;
            }

            await showSystemNotification(item);
          } catch {
            // Silent failure: fallback to in-app inbox.
          }

          notifiedInboxEventIdsRef.current.add(item.id);
        }

        persistNotifiedInboxEvents();
      } catch {
        // Background inbox poll failures are non-blocking.
      }
    };

    void pollUnreadInbox(true);
    void ensureWebPushSubscription();
    const timerId = window.setInterval(() => {
      void pollUnreadInbox(false);
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [authToken, activeTopicId, openInboxItem, persistNotifiedInboxEvents, roomSlug]);

  const buildMuteUntilIso = (hours: number | "forever"): string => {
    const now = new Date();
    if (hours === "forever") {
      const forever = new Date(now);
      forever.setFullYear(forever.getFullYear() + 20);
      return forever.toISOString();
    }

    const next = new Date(now.getTime() + hours * 60 * 60 * 1000);
    return next.toISOString();
  };

  const getTopicUnreadCount = (topic: RoomTopic): number => {
    const override = topicUnreadOverrideById[topic.id];
    if (override && topic.unreadCount === override.sourceUnreadCount) {
      return Math.max(0, override.unreadCount);
    }

    return Math.max(0, Number(topic.unreadCount || 0));
  };

  const roomUnreadCount = useMemo(
    () => topics.reduce((sum, topic) => sum + getTopicUnreadCount(topic), 0),
    [topics, topicUnreadOverrideById]
  );

  const sortedTopics = useMemo(() => {
    return [...topics].sort((a, b) => {
      const pinnedDiff = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
      if (pinnedDiff !== 0) {
        return pinnedDiff;
      }

      const positionDiff = Number(a.position || 0) - Number(b.position || 0);
      if (positionDiff !== 0) {
        return positionDiff;
      }

      return String(a.title || "").localeCompare(String(b.title || ""));
    });
  }, [topics]);

  const filteredTopics = useMemo(() => {
    if (topicFilterMode === "all") {
      return sortedTopics;
    }

    if (topicFilterMode === "active") {
      return sortedTopics.filter((topic) => !topic.archivedAt);
    }

    if (topicFilterMode === "unread") {
      return sortedTopics.filter((topic) => getTopicUnreadCount(topic) > 0);
    }

    if (topicFilterMode === "my") {
      const normalizedUserId = String(currentUserId || "").trim();
      if (!normalizedUserId) {
        return [];
      }

      return sortedTopics.filter((topic) => String(topic.createdBy || "").trim() === normalizedUserId);
    }

    if (topicFilterMode === "mentions") {
      return sortedTopics.filter((topic) => Math.max(0, Number(topic.mentionUnreadCount || 0)) > 0);
    }

    if (topicFilterMode === "pinned") {
      return sortedTopics.filter((topic) => Boolean(topic.isPinned));
    }

    return sortedTopics.filter((topic) => Boolean(topic.archivedAt));
  }, [sortedTopics, topicFilterMode, topicUnreadOverrideById, currentUserId]);

  const topicsForSelector = useMemo(() => {
    if (!activeTopicId) {
      return filteredTopics;
    }

    const hasActiveInFiltered = filteredTopics.some((topic) => topic.id === activeTopicId);
    if (hasActiveInFiltered) {
      return filteredTopics;
    }

    const activeTopicFromAll = sortedTopics.find((topic) => topic.id === activeTopicId);
    if (!activeTopicFromAll) {
      return filteredTopics;
    }

    return [activeTopicFromAll, ...filteredTopics];
  }, [activeTopicId, filteredTopics, sortedTopics]);

  const markTopicRead = async (topicId: string, lastReadMessageId?: string) => {
    if (!authToken || markReadSaving || !topicId) {
      return;
    }

    const selectedTopic = topics.find((topic) => topic.id === topicId);
    const sourceUnreadCount = Math.max(0, Number(selectedTopic?.unreadCount || 0));
    if (!selectedTopic || sourceUnreadCount === 0) {
      return;
    }

    setMarkReadSaving(true);
    setMarkReadStatusText("");
    try {
      await api.markTopicRead(authToken, topicId, lastReadMessageId ? { lastReadMessageId } : {});
      setTopicUnreadOverrideById((prev) => ({
        ...prev,
        [topicId]: {
          unreadCount: 0,
          sourceUnreadCount
        }
      }));
      setMarkReadStatusText(t("chat.markReadSuccess"));
    } catch {
      setMarkReadStatusText(t("chat.markReadError"));
    } finally {
      setMarkReadSaving(false);
    }
  };

  const markRoomRead = async () => {
    if (!authToken || markReadSaving || topics.length === 0) {
      return;
    }

    const unreadTopics = topics.filter((topic) => getTopicUnreadCount(topic) > 0);
    if (unreadTopics.length === 0) {
      return;
    }

    setMarkReadSaving(true);
    setMarkReadStatusText("");
    try {
      await Promise.all(unreadTopics.map((topic) => api.markTopicRead(authToken, topic.id)));
      setTopicUnreadOverrideById((prev) => {
        const next = { ...prev };
        unreadTopics.forEach((topic) => {
          next[topic.id] = {
            unreadCount: 0,
            sourceUnreadCount: Math.max(0, Number(topic.unreadCount || 0))
          };
        });
        return next;
      });
      setMarkReadStatusText(t("chat.markRoomReadSuccess"));
    } catch {
      setMarkReadStatusText(t("chat.markReadError"));
    } finally {
      setMarkReadSaving(false);
    }
  };

  const markTopicUnreadFromMessage = async (messageId: string) => {
    const topicId = String(activeTopicId || "").trim();
    const normalizedMessageId = String(messageId || "").trim();
    if (!authToken || !topicId || !normalizedMessageId || markReadSaving) {
      return;
    }

    const selectedIndex = messages.findIndex((item) => item.id === normalizedMessageId);
    if (selectedIndex <= 0) {
      setMarkReadStatusText(t("chat.markUnreadUnavailable"));
      return;
    }

    const previousMessageId = String(messages[selectedIndex - 1]?.id || "").trim();
    if (!previousMessageId) {
      setMarkReadStatusText(t("chat.markUnreadUnavailable"));
      return;
    }

    const selectedTopic = topics.find((topic) => topic.id === topicId);
    const sourceUnreadCount = Math.max(0, Number(selectedTopic?.unreadCount || 0));
    const estimatedUnreadCount = Math.max(0, messages.length - selectedIndex);

    setMarkReadSaving(true);
    setMarkReadStatusText("");
    try {
      await api.markTopicRead(authToken, topicId, { lastReadMessageId: previousMessageId });
      setTopicUnreadOverrideById((prev) => ({
        ...prev,
        [topicId]: {
          unreadCount: estimatedUnreadCount,
          sourceUnreadCount
        }
      }));
      setMarkReadStatusText(t("chat.markUnreadSuccess"));
    } catch {
      setMarkReadStatusText(t("chat.markReadError"));
    } finally {
      setMarkReadSaving(false);
    }
  };

  const activeTopicUnreadCount = useMemo(() => {
    const activeTopic = topics.find((topic) => topic.id === activeTopicId);
    return activeTopic ? getTopicUnreadCount(activeTopic) : 0;
  }, [activeTopicId, topics, topicUnreadOverrideById]);

  const filteredTopicsForPalette = useMemo(() => {
    const query = topicPaletteQuery.trim().toLowerCase();
    if (!query) {
      return sortedTopics;
    }

    return sortedTopics.filter((topic) => topic.title.toLowerCase().includes(query));
  }, [sortedTopics, topicPaletteQuery]);

  useEffect(() => {
    if (filteredTopicsForPalette.length === 0) {
      setTopicPaletteSelectedIndex(0);
      return;
    }

    setTopicPaletteSelectedIndex((prev) => {
      if (prev < 0) {
        return 0;
      }
      if (prev >= filteredTopicsForPalette.length) {
        return filteredTopicsForPalette.length - 1;
      }
      return prev;
    });
  }, [filteredTopicsForPalette]);

  const activeTopicLastMessageId = messages.length > 0 ? messages[messages.length - 1]?.id : undefined;

  const activeTopic = useMemo(() => topics.find((topic) => topic.id === activeTopicId) ?? null, [topics, activeTopicId]);
  const activeTopicIsArchived = Boolean(activeTopic?.archivedAt);

  const handleStartEditTopic = () => {
    if (!activeTopic) {
      return;
    }

    setEditingTopicId(activeTopic.id);
    setEditingTopicTitle(activeTopic.title);
    setEditingTopicStatusText("");
  };

  const handleCancelEditTopic = () => {
    setEditingTopicId(null);
    setEditingTopicTitle("");
    setEditingTopicStatusText("");
  };

  const handleSaveEditTopic = async () => {
    const targetId = String(editingTopicId || "").trim();
    const trimmedTitle = editingTopicTitle.trim();
    if (!targetId || !trimmedTitle || editingTopicSaving) {
      return;
    }

    setEditingTopicSaving(true);
    setEditingTopicStatusText("");
    try {
      await onUpdateTopic(targetId, trimmedTitle);
      setEditingTopicId(null);
      setEditingTopicTitle("");
      setEditingTopicStatusText(t("chat.editTopicSuccess"));
    } catch {
      setEditingTopicStatusText(t("chat.editTopicError"));
    } finally {
      setEditingTopicSaving(false);
    }
  };

  const handleArchiveTopic = async () => {
    if (!activeTopic || archivingTopicId) {
      return;
    }

    setArchivingTopicId(activeTopic.id);
    try {
      if (activeTopic.archivedAt) {
        await onUnarchiveTopic(activeTopic.id);
        setEditingTopicStatusText(t("chat.unarchiveTopicSuccess"));
      } else {
        await onArchiveTopic(activeTopic.id);
        setEditingTopicStatusText(t("chat.archiveTopicSuccess"));
      }
    } catch {
      setEditingTopicStatusText(activeTopic.archivedAt ? t("chat.unarchiveTopicError") : t("chat.archiveTopicError"));
    } finally {
      setArchivingTopicId(null);
    }
  };

  const messageViewModels = useMemo(
    () => buildChatMessageViewModels(messages, currentUserId, 10 * 60 * 1000),
    [messages, currentUserId]
  );

  const latestMessageIdForHotkeys = messageViewModels.length > 0
    ? messageViewModels[messageViewModels.length - 1]?.id || null
    : null;

  const latestOwnManageableMessageIdForHotkeys = useMemo(() => {
    for (let index = messageViewModels.length - 1; index >= 0; index -= 1) {
      const candidate = messageViewModels[index];
      if (candidate?.canManageOwnMessage) {
        return candidate.id;
      }
    }
    return null;
  }, [messageViewModels]);

  useEffect(() => {
    const hasOpenOverlay = Boolean(previewImageUrl || topicPaletteOpen);
    if (!hasActiveRoom || hasOpenOverlay) {
      return;
    }

    const isEditableTarget = (target: EventTarget | null): boolean => {
      const element = target as HTMLElement | null;
      if (!element) {
        return false;
      }

      const tagName = element.tagName.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select") {
        return true;
      }

      if (element.isContentEditable || element.closest("[contenteditable='true']")) {
        return true;
      }

      return false;
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        openTopicPalette();
        setHotkeyStatusText(t("chat.hotkeyTopicSwitch"));
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      if (key === "t") {
        event.preventDefault();
        openTopicPalette();
        setHotkeyStatusText(t("chat.hotkeyTopicSwitch"));
        return;
      }

      if (key === "r" && latestMessageIdForHotkeys) {
        event.preventDefault();
        onReplyMessage(latestMessageIdForHotkeys);
        setHotkeyStatusText(t("chat.hotkeyReply"));
        return;
      }

      if (key === "e" && latestOwnManageableMessageIdForHotkeys) {
        event.preventDefault();
        onEditMessage(latestOwnManageableMessageIdForHotkeys);
        setHotkeyStatusText(t("chat.hotkeyEdit"));
        return;
      }

      if (key === "m") {
        event.preventDefault();
        void markRoomRead();
        setHotkeyStatusText(t("chat.hotkeyMarkRead"));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    hasActiveRoom,
    latestMessageIdForHotkeys,
    latestOwnManageableMessageIdForHotkeys,
    onEditMessage,
    onReplyMessage,
    previewImageUrl,
    t,
    topicPaletteOpen
  ]);

  const formatMessageTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const isProtectedAttachmentObjectUrl = (value: string): boolean => {
    if (!value) {
      return false;
    }

    if (value.startsWith("/v1/chat/uploads/object")) {
      return true;
    }

    try {
      const parsed = new URL(value, window.location.origin);
      return parsed.pathname === "/v1/chat/uploads/object";
    } catch {
      return false;
    }
  };

  const protectedAttachmentUrls = useMemo(() => {
    const unique = new Set<string>();

    messages.forEach((message) => {
      const attachments = Array.isArray(message.attachments) ? message.attachments : [];
      attachments
        .filter((item) => String(item.type || "") === "image")
        .map((item) => String(item.download_url || "").trim())
        .filter((url) => url.length > 0)
        .forEach((url) => {
          if (isProtectedAttachmentObjectUrl(url)) {
            unique.add(url);
          }
        });
    });

    return Array.from(unique);
  }, [messages]);

  useEffect(() => {
    const nextProtected = new Set(protectedAttachmentUrls);

    setResolvedAttachmentImageUrls((prev) => {
      let changed = false;
      const next: Record<string, string> = {};

      Object.entries(prev).forEach(([url, blobUrl]) => {
        if (nextProtected.has(url)) {
          next[url] = blobUrl;
          return;
        }

        changed = true;
        URL.revokeObjectURL(blobUrl);
      });

      return changed ? next : prev;
    });

    if (nextProtected.size === 0) {
      return;
    }

    const abortController = new AbortController();
    let cancelled = false;

    const load = async (url: string) => {
      if (resolvedAttachmentImageUrlsRef.current[url]) {
        return;
      }

      const headers: Record<string, string> = {};
      if (authToken) {
        headers.authorization = `Bearer ${authToken}`;
      }

      try {
        const response = await fetch(url, {
          credentials: "include",
          headers,
          signal: abortController.signal
        });

        if (!response.ok) {
          return;
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }

        setResolvedAttachmentImageUrls((prev) => {
          if (prev[url] === blobUrl) {
            return prev;
          }

          if (prev[url]) {
            URL.revokeObjectURL(prev[url]);
          }

          return {
            ...prev,
            [url]: blobUrl
          };
        });
      } catch {
        // Keep original URL fallback if fetch fails.
      }
    };

    void Promise.all(Array.from(nextProtected).map((url) => load(url)));

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [authToken, protectedAttachmentUrls]);

  const resolveAttachmentImageUrl = (url: string): string => {
    return resolvedAttachmentImageUrls[url] || url;
  };

  const formatAttachmentSize = (bytes: number): string => {
    const normalized = Number(bytes || 0);
    if (!Number.isFinite(normalized) || normalized <= 0) {
      return "0 B";
    }

    if (normalized < 1024) {
      return `${Math.round(normalized)} B`;
    }

    if (normalized < 1024 * 1024) {
      return `${(normalized / 1024).toFixed(1)} KB`;
    }

    return `${(normalized / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderMessageText = (value: string): ReactNode[] => {
    const text = String(value || "");
    const urlPattern = /((https?:\/\/|www\.)[^\s<]+)/gi;
    const mentionPattern = /(^|\s)(@[\p{L}\p{N}._-]{2,32})/gu;
    const result: ReactNode[] = [];
    let keyIndex = 0;

    let textCursor = 0;
    let linkMatch: RegExpExecArray | null;
    urlPattern.lastIndex = 0;

    while ((linkMatch = urlPattern.exec(text)) !== null) {
      const raw = linkMatch[0];
      const start = linkMatch.index;
      if (start > textCursor) {
        result.push(text.slice(textCursor, start));
      }

      let linkText = raw;
      let trailing = "";
      while (/[.,!?;:)\]]$/.test(linkText)) {
        trailing = linkText.slice(-1) + trailing;
        linkText = linkText.slice(0, -1);
      }

      if (linkText) {
        const href = /^https?:\/\//i.test(linkText) ? linkText : `https://${linkText}`;
        result.push(
          <a
            key={`link-${keyIndex}-${start}-${linkText}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="chat-link"
          >
            {linkText}
          </a>
        );
        keyIndex += 1;
      }

      if (trailing) {
        result.push(trailing);
      }

      textCursor = start + raw.length;
    }

    if (textCursor < text.length) {
      result.push(text.slice(textCursor));
    }

    const withMentions: ReactNode[] = [];
    let mentionKeyIndex = 0;

    const pushSegmentWithMentions = (segment: string) => {
      if (!segment) {
        return;
      }

      let cursor = 0;
      let mentionMatch: RegExpExecArray | null;
      mentionPattern.lastIndex = 0;

      while ((mentionMatch = mentionPattern.exec(segment)) !== null) {
        const leading = mentionMatch[1] || "";
        const mention = mentionMatch[2] || "";
        const absoluteStart = mentionMatch.index + leading.length;

        if (absoluteStart > cursor) {
          withMentions.push(segment.slice(cursor, absoluteStart));
        }

        withMentions.push(
          <span key={`mention-${mentionKeyIndex}-${absoluteStart}`} className="chat-mention">
            {mention}
          </span>
        );
        mentionKeyIndex += 1;
        cursor = absoluteStart + mention.length;
      }

      if (cursor < segment.length) {
        withMentions.push(segment.slice(cursor));
      }
    };

    (result.length > 0 ? result : [text]).forEach((chunk) => {
      if (typeof chunk === "string") {
        pushSegmentWithMentions(chunk);
        return;
      }

      withMentions.push(chunk);
    });

    const withFormatting: ReactNode[] = [];
    let formatKeyIndex = 0;
    const formattingPattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\|\|[^|\n]+\|\|)/g;

    const pushSegmentWithFormatting = (segment: string) => {
      if (!segment) {
        return;
      }

      let cursor = 0;
      formattingPattern.lastIndex = 0;
      let formatMatch: RegExpExecArray | null;

      while ((formatMatch = formattingPattern.exec(segment)) !== null) {
        const token = formatMatch[0] || "";
        const start = formatMatch.index;
        if (start > cursor) {
          withFormatting.push(segment.slice(cursor, start));
        }

        if (token.startsWith("**") && token.endsWith("**")) {
          withFormatting.push(
            <strong key={`fmt-bold-${formatKeyIndex}-${start}`} className="chat-format-bold">
              {token.slice(2, -2)}
            </strong>
          );
        } else if (token.startsWith("*") && token.endsWith("*")) {
          withFormatting.push(
            <em key={`fmt-italic-${formatKeyIndex}-${start}`} className="chat-format-italic">
              {token.slice(1, -1)}
            </em>
          );
        } else if (token.startsWith("`") && token.endsWith("`")) {
          withFormatting.push(
            <code key={`fmt-code-${formatKeyIndex}-${start}`} className="chat-format-code">
              {token.slice(1, -1)}
            </code>
          );
        } else if (token.startsWith("||") && token.endsWith("||")) {
          withFormatting.push(
            <span key={`fmt-spoiler-${formatKeyIndex}-${start}`} className="chat-format-spoiler">
              {token.slice(2, -2)}
            </span>
          );
        } else {
          withFormatting.push(token);
        }

        formatKeyIndex += 1;
        cursor = start + token.length;
      }

      if (cursor < segment.length) {
        withFormatting.push(segment.slice(cursor));
      }
    };

    (withMentions.length > 0 ? withMentions : [text]).forEach((chunk) => {
      if (typeof chunk === "string") {
        pushSegmentWithFormatting(chunk);
        return;
      }

      withFormatting.push(chunk);
    });

    return withFormatting.length > 0 ? withFormatting : [text];
  };

  const extractFirstLinkPreview = (value: string): { href: string; host: string; path: string } | null => {
    const text = String(value || "");
    const match = text.match(/((https?:\/\/|www\.)[^\s<]+)/i);
    if (!match || !match[0]) {
      return null;
    }

    let raw = match[0];
    while (/[.,!?;:)\]]$/.test(raw)) {
      raw = raw.slice(0, -1);
    }
    if (!raw) {
      return null;
    }

    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const parsed = new URL(href);
      const normalizedPath = `${parsed.pathname || "/"}${parsed.search || ""}`;
      return {
        href,
        host: parsed.host,
        path: normalizedPath.length > 72 ? `${normalizedPath.slice(0, 69)}...` : normalizedPath
      };
    } catch {
      return null;
    }
  };

  const insertMentionToComposer = (userName: string) => {
    const normalizedUserName = String(userName || "").trim();
    if (!normalizedUserName) {
      return;
    }

    const current = String(chatText || "");
    const separator = current.length === 0 || /\s$/.test(current) ? "" : " ";
    onSetChatText(`${current}${separator}@${normalizedUserName} `);
  };

  const insertQuoteToComposer = (userName: string, text: string) => {
    const normalizedText = String(text || "").replace(/\r/g, "").trim();
    if (!normalizedText) {
      return;
    }

    const normalizedUserName = String(userName || "").trim();
    const quoteSource = normalizedText.length > 280 ? `${normalizedText.slice(0, 277)}...` : normalizedText;
    const quotedLines = quoteSource
      .split("\n")
      .slice(0, 4)
      .map((line) => `> ${String(line || "").trim() || "..."}`)
      .join("\n");

    const quoteBlock = normalizedUserName
      ? `@${normalizedUserName}:\n${quotedLines}\n`
      : `${quotedLines}\n`;

    const current = String(chatText || "");
    const separator = current.trim().length > 0 ? "\n\n" : "";
    onSetChatText(`${current}${separator}${quoteBlock}`);
  };

  const closeContextMenu = () => {
    setContextMenuMessageId(null);
  };

  const openTopicContextMenu = (topicId: string, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setTopicContextMenu({ topicId, x: event.clientX, y: event.clientY });
  };

  const runTopicMenuAction = async (action: "read" | "edit" | "archive") => {
    const targetTopicId = String(topicContextMenu?.topicId || "").trim();
    if (!targetTopicId) {
      setTopicContextMenu(null);
      return;
    }

    const targetTopic = topics.find((topic) => topic.id === targetTopicId);
    if (!targetTopic) {
      setTopicContextMenu(null);
      return;
    }

    if (action === "read") {
      await markTopicRead(targetTopic.id);
      setTopicContextMenu(null);
      return;
    }

    if (action === "edit") {
      onSelectTopic(targetTopic.id);
      setEditingTopicId(targetTopic.id);
      setEditingTopicTitle(targetTopic.title);
      setEditingTopicStatusText("");
      setTopicContextMenu(null);
      return;
    }

    setArchivingTopicId(targetTopic.id);
    try {
      if (targetTopic.archivedAt) {
        await onUnarchiveTopic(targetTopic.id);
        setEditingTopicStatusText(t("chat.unarchiveTopicSuccess"));
      } else {
        await onArchiveTopic(targetTopic.id);
        setEditingTopicStatusText(t("chat.archiveTopicSuccess"));
      }
    } catch {
      setEditingTopicStatusText(targetTopic.archivedAt ? t("chat.unarchiveTopicError") : t("chat.archiveTopicError"));
    } finally {
      setArchivingTopicId(null);
      setTopicContextMenu(null);
    }
  };

  const topicPaletteListboxId = "chat-topic-palette-listbox";

  const closeTopicPalette = () => {
    setTopicPaletteOpen(false);
  };

  const openTopicPalette = () => {
    if (!hasTopics) {
      return;
    }
    setTopicPaletteOpen(true);
  };

  const selectTopicFromPalette = (topicId: string) => {
    onSelectTopic(topicId);
    setTopicPaletteOpen(false);
  };

  const handleTopicPaletteKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filteredTopicsForPalette.length > 0) {
        setTopicPaletteSelectedIndex((prev) => Math.min(filteredTopicsForPalette.length - 1, prev + 1));
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredTopicsForPalette.length > 0) {
        setTopicPaletteSelectedIndex((prev) => Math.max(0, prev - 1));
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const selected = filteredTopicsForPalette[topicPaletteSelectedIndex];
      if (selected) {
        selectTopicFromPalette(selected.id);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeTopicPalette();
    }
  };

  return (
    <section className="card middle-card flex min-h-0 flex-1 flex-col overflow-hidden">
      <TopicTabsHeader
        t={t}
        hasActiveRoom={hasActiveRoom}
        roomTitle={roomTitle}
        roomSlug={roomSlug}
        hasTopics={hasTopics}
        topicCreatePopupRef={topicCreatePopupRef}
        topicCreateOpen={topicCreateOpen}
        setTopicCreateOpen={setTopicCreateOpen}
        newTopicTitle={newTopicTitle}
        setNewTopicTitle={setNewTopicTitle}
        creatingTopic={creatingTopic}
        handleCreateTopicSubmit={handleCreateTopicSubmit}
        sortedTopics={sortedTopics}
        getTopicUnreadCount={getTopicUnreadCount}
        activeTopicId={activeTopicId}
        onSelectTopic={onSelectTopic}
        openTopicContextMenu={openTopicContextMenu}
        openTopicPalette={openTopicPalette}
        topicPaletteOpen={topicPaletteOpen}
      />
      {hasActiveRoom ? (
        <div className="chat-hotkeys-hint muted" aria-live="polite">
          {t("chat.hotkeysHint")}
          {hotkeyStatusText ? ` ${hotkeyStatusText}` : ""}
        </div>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {!hasActiveRoom ? (
          <span className="muted">{t("chat.noChannelHint")}</span>
        ) : null}
      </div>
      {hasActiveRoom ? (
        <NotificationPanel
          t={t}
          notificationScope={notificationScope}
          setNotificationScope={setNotificationScope}
          notificationMode={notificationMode}
          setNotificationMode={setNotificationMode}
          notificationSaving={notificationSaving}
          updateNotificationSettings={updateNotificationSettings}
          buildMuteUntilIso={buildMuteUntilIso}
          inboxLoading={inboxLoading}
          inboxItems={inboxItems}
          loadInbox={loadInbox}
          markInboxAllRead={markInboxAllRead}
          openInboxItem={openInboxItem}
          markInboxItemRead={markInboxItemRead}
          formatMessageTime={formatMessageTime}
          notificationStatusText={notificationStatusText}
        />
      ) : null}
      {hasActiveRoom ? (
        <TopicToolbar
          t={t}
          hasTopics={hasTopics}
          roomUnreadCount={roomUnreadCount}
          topicFilterMode={topicFilterMode}
          setTopicFilterMode={setTopicFilterMode}
          activeTopicId={activeTopicId}
          activeTopicUnreadCount={activeTopicUnreadCount}
          activeTopicLastMessageId={activeTopicLastMessageId}
          markReadSaving={markReadSaving}
          markTopicRead={markTopicRead}
          markRoomRead={markRoomRead}
          editingTopicId={editingTopicId}
          editingTopicTitle={editingTopicTitle}
          setEditingTopicTitle={setEditingTopicTitle}
          editingTopicSaving={editingTopicSaving}
          handleSaveEditTopic={handleSaveEditTopic}
          handleCancelEditTopic={handleCancelEditTopic}
          handleStartEditTopic={handleStartEditTopic}
          handleArchiveTopic={handleArchiveTopic}
          archivingTopicId={archivingTopicId}
          activeTopicIsArchived={activeTopicIsArchived}
          markReadStatusText={markReadStatusText}
          editingTopicStatusText={editingTopicStatusText}
        />
      ) : null}
      {hasActiveRoom ? (
        <SearchPanel
          t={t}
          searching={searching}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchScope={searchScope}
          setSearchScope={setSearchScope}
          handleSearchMessages={handleSearchMessages}
          searchHasMention={searchHasMention}
          setSearchHasMention={setSearchHasMention}
          searchHasAttachment={searchHasAttachment}
          setSearchHasAttachment={setSearchHasAttachment}
          searchAttachmentType={searchAttachmentType}
          setSearchAttachmentType={setSearchAttachmentType}
          searchHasLink={searchHasLink}
          setSearchHasLink={setSearchHasLink}
          searchAuthorId={searchAuthorId}
          setSearchAuthorId={setSearchAuthorId}
          searchFrom={searchFrom}
          setSearchFrom={setSearchFrom}
          searchTo={searchTo}
          setSearchTo={setSearchTo}
          searchJumpStatusText={searchJumpStatusText}
          searchError={searchError}
          searchResults={searchResults}
          searchResultsHasMore={searchResultsHasMore}
          formatMessageTime={formatMessageTime}
          setSearchJumpStatusText={setSearchJumpStatusText}
          setSearchJumpTarget={(value) => setSearchJumpTarget(value)}
        />
      ) : null}
      <div className="chat-typing-banner" aria-live="polite">
        {hasActiveRoom && typingUsers.length > 0 ? (
          <span className="chat-typing-status">
            <span>{typingLabel}</span>
            <span className="chat-typing-dots" aria-hidden="true">
              <span className="chat-typing-dot">.</span>
              <span className="chat-typing-dot">.</span>
              <span className="chat-typing-dot">.</span>
            </span>
          </span>
        ) : null}
      </div>
      <div className="chat-log min-h-0 flex-1" ref={chatLogRef}>
        {loadingOlderMessages ? <div className="chat-history-loading muted">{t("chat.loading")}</div> : null}
        {hasActiveRoom && !hasTopics ? (
          <div className="chat-empty-state">
            <p className="chat-empty-state-title">{t("chat.emptyTopicsTitle")}</p>
            <p className="chat-empty-state-hint">{t("chat.emptyTopicsHint")}</p>
          </div>
        ) : hasActiveRoom && hasTopics && activeTopicId && messageViewModels.length === 0 && !loadingOlderMessages ? (
          <div className="chat-empty-state">
            <p className="chat-empty-state-title">{t("chat.emptyMessagesTitle")}</p>
            <p className="chat-empty-state-hint">{t("chat.emptyMessagesHint")}</p>
          </div>
        ) : null}
        {messageViewModels.map((messageVm) => {
          const attachmentImageUrls = messageVm.attachmentImageUrls;
          const attachmentFiles = messageVm.attachmentFiles;
          const isOwn = messageVm.isOwn;
          const showAuthor = messageVm.showAuthor;
          const showAvatar = messageVm.showAvatar;
          const canManageOwnMessage = messageVm.canManageOwnMessage;
          const deliveryClass = messageVm.deliveryClass;
          const deliveryGlyph = messageVm.deliveryGlyph;
          const isPinned = Boolean(pinnedByMessageId[messageVm.id]);
          const hasThumbsUp = Boolean(thumbsUpByMessageId[messageVm.id]);
          const linkPreview = extractFirstLinkPreview(messageVm.text);

          return (
            <article
              key={messageVm.id}
              data-message-id={messageVm.id}
              className={`chat-message group grid items-end gap-2 ${isOwn ? "chat-message-own grid-cols-1 justify-items-end" : "grid-cols-[34px_minmax(0,1fr)]"}`}
            >
              {!isOwn ? (
                <div className="chat-avatar-slot inline-flex h-[30px] w-[30px] items-end justify-center" aria-hidden="true">
                  {showAvatar ? (
                    <div className="chat-avatar inline-flex h-[30px] w-[30px] items-center justify-center">
                      {(messageVm.userName || "U").charAt(0).toUpperCase()}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className={`chat-bubble-wrap grid max-w-[min(92%,820px)] gap-0.5 ${isOwn ? "justify-items-end" : "justify-items-start"}`}>
                {hasActiveRoom ? (
                  <div className={`chat-actions-side ${isOwn ? "chat-actions-side-own" : "chat-actions-side-peer"}`}>
                    <Button
                      type="button"
                      className="secondary tiny icon-btn chat-context-menu-toggle"
                      onClick={() => setContextMenuMessageId((prev) => (prev === messageVm.id ? null : messageVm.id))}
                      aria-label={t("chat.messageActions")}
                      title={t("chat.messageActions")}
                      aria-haspopup="menu"
                      aria-expanded={contextMenuMessageId === messageVm.id}
                      aria-controls={`chat-message-menu-${messageVm.id}`}
                    >
                      <i className="bi bi-three-dots" aria-hidden="true" />
                    </Button>
                    {contextMenuMessageId === messageVm.id ? (
                      <div className="chat-context-menu" id={`chat-message-menu-${messageVm.id}`} role="menu" aria-label={t("chat.messageActions")}>
                        <Button
                          type="button"
                          className="secondary tiny"
                          role="menuitem"
                          onClick={() => {
                            onReplyMessage(messageVm.id);
                            closeContextMenu();
                          }}
                        >
                          {t("chat.reply")}
                        </Button>
                        <Button
                          type="button"
                          className="secondary tiny"
                          role="menuitem"
                          onClick={() => {
                            insertMentionToComposer(messageVm.userName);
                            closeContextMenu();
                          }}
                        >
                          {t("chat.mention")}
                        </Button>
                        <Button
                          type="button"
                          className="secondary tiny"
                          role="menuitem"
                          onClick={() => {
                            insertQuoteToComposer(messageVm.userName, messageVm.text);
                            closeContextMenu();
                          }}
                        >
                          {t("chat.quote")}
                        </Button>
                        <Button
                          type="button"
                          className="secondary tiny"
                          role="menuitem"
                          onClick={() => {
                            void markTopicUnreadFromMessage(messageVm.id);
                            closeContextMenu();
                          }}
                          disabled={!activeTopicId || markReadSaving}
                        >
                          {t("chat.markUnreadFromHere")}
                        </Button>
                        <Button
                          type="button"
                          className="secondary tiny"
                          role="menuitem"
                          onClick={() => {
                            onTogglePinMessage(messageVm.id);
                            closeContextMenu();
                          }}
                        >
                          {isPinned ? t("chat.unpin") : t("chat.pin")}
                        </Button>
                        <Button
                          type="button"
                          className="secondary tiny"
                          role="menuitem"
                          onClick={() => {
                            onToggleThumbsUpReaction(messageVm.id);
                            closeContextMenu();
                          }}
                        >
                          {t("chat.react")}
                        </Button>
                        {canManageOwnMessage ? (
                          <>
                            <Button
                              type="button"
                              className="secondary tiny"
                              role="menuitem"
                              onClick={() => {
                                onEditMessage(messageVm.id);
                                closeContextMenu();
                              }}
                            >
                              {t("chat.edit")}
                            </Button>
                            <Button
                              type="button"
                              className="secondary tiny"
                              role="menuitem"
                              onClick={() => {
                                onDeleteMessage(messageVm.id);
                                closeContextMenu();
                              }}
                            >
                              {t("chat.delete")}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    <Button
                      type="button"
                      className="secondary tiny icon-btn"
                      onClick={() => onReplyMessage(messageVm.id)}
                      aria-label={t("chat.reply")}
                      title={t("chat.reply")}
                    >
                      <i className="bi bi-reply" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      className="secondary tiny icon-btn"
                      onClick={() => insertMentionToComposer(messageVm.userName)}
                      aria-label={t("chat.mention")}
                      title={t("chat.mention")}
                    >
                      <i className="bi bi-at" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      className="secondary tiny icon-btn"
                      onClick={() => insertQuoteToComposer(messageVm.userName, messageVm.text)}
                      aria-label={t("chat.quote")}
                      title={t("chat.quote")}
                    >
                      <i className="bi bi-blockquote-left" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      className="secondary tiny icon-btn"
                      onClick={() => void markTopicUnreadFromMessage(messageVm.id)}
                      aria-label={t("chat.markUnreadFromHere")}
                      title={t("chat.markUnreadFromHere")}
                      disabled={!activeTopicId || markReadSaving}
                    >
                      <i className="bi bi-envelope-open" aria-hidden="true" />
                    </Button>
                    {!isOwn ? (
                      <Button
                        type="button"
                        className="secondary tiny icon-btn"
                        onClick={() => onReportMessage(messageVm.id)}
                        aria-label={t("chat.reportMessage")}
                        title={t("chat.reportMessage")}
                      >
                        <i className="bi bi-flag" aria-hidden="true" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      className="secondary tiny icon-btn"
                      onClick={() => onTogglePinMessage(messageVm.id)}
                      aria-label={isPinned ? t("chat.unpin") : t("chat.pin")}
                      title={isPinned ? t("chat.unpin") : t("chat.pin")}
                    >
                      <i className={`bi ${isPinned ? "bi-pin-angle-fill" : "bi-pin-angle"}`} aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      className="secondary tiny icon-btn"
                      onClick={() => onToggleThumbsUpReaction(messageVm.id)}
                      aria-label={t("chat.react")}
                      title={t("chat.react")}
                    >
                      <i className={`bi ${hasThumbsUp ? "bi-hand-thumbs-up-fill" : "bi-hand-thumbs-up"}`} aria-hidden="true" />
                    </Button>
                    {canManageOwnMessage ? (
                      <>
                        <Button
                          type="button"
                          className="secondary tiny icon-btn"
                          onClick={() => onEditMessage(messageVm.id)}
                          aria-label={t("chat.edit")}
                          title={t("chat.edit")}
                        >
                          <i className="bi bi-pencil-square" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          className="secondary tiny icon-btn"
                          onClick={() => onDeleteMessage(messageVm.id)}
                          aria-label={t("chat.delete")}
                          title={t("chat.delete")}
                        >
                          <i className="bi bi-trash3" aria-hidden="true" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                ) : null}

                <div className="chat-bubble w-fit min-w-[120px]">
                  {showAuthor ? (
                    <div className="chat-meta flex items-baseline gap-2">
                      <span className="chat-author">{messageVm.userName}</span>
                    </div>
                  ) : null}
                  <div className="chat-content-row">
                    {messageVm.replyPreview ? (
                      <div className="chat-inline-reply">
                        <span className="chat-inline-reply-author">{messageVm.replyPreview.userName}</span>
                        <span className="chat-inline-reply-text">{String(messageVm.replyPreview.text || "").replace(/\s+/g, " ").trim().slice(0, 120)}</span>
                      </div>
                    ) : null}
                    <p className="chat-text">{renderMessageText(messageVm.text)}</p>
                    <span className="chat-time-wrap">
                      <span className="chat-time">{formatMessageTime(messageVm.createdAt)}</span>
                      {isOwn && deliveryGlyph ? (
                        <span className={`delivery ${deliveryClass}`}>
                          {deliveryGlyph}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {linkPreview ? (
                    <a
                      href={linkPreview.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="chat-link-preview"
                    >
                      <span className="chat-link-preview-host">{linkPreview.host}</span>
                      <span className="chat-link-preview-path">{linkPreview.path}</span>
                      <span className="chat-link-preview-open">{t("chat.openLink")}</span>
                    </a>
                  ) : null}
                  {attachmentImageUrls.length > 0 ? (
                    <div className="chat-attachments-row">
                      {attachmentImageUrls.map((imageUrl) => (
                        <Button
                          key={`${messageVm.id}-${imageUrl}`}
                          type="button"
                          className="chat-inline-image-btn"
                          onClick={() => setPreviewImageUrl(imageUrl)}
                          aria-label={t("chat.openImagePreview")}
                          title={t("chat.openImagePreview")}
                        >
                          <img
                            src={resolveAttachmentImageUrl(imageUrl)}
                            alt="chat-image"
                            className="chat-inline-image"
                            loading="lazy"
                          />
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  {attachmentFiles.length > 0 ? (
                    <div className="chat-attachments-row">
                      {attachmentFiles.map((attachment) => (
                        <a
                          key={`${messageVm.id}-${attachment.id}`}
                          href={attachment.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="chat-attachment-file"
                        >
                          <span className="chat-attachment-file-title">
                            {attachment.type === "audio" ? t("chat.attachmentAudio") : t("chat.attachmentDocument")}
                          </span>
                          <span className="chat-attachment-file-meta">
                            {attachment.mimeType}
                            {" · "}
                            {formatAttachmentSize(attachment.sizeBytes)}
                          </span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {isPinned || hasThumbsUp ? (
                    <div className="chat-reactions-row">
                      {isPinned ? <span className="chat-reaction-chip">{t("chat.pin")}</span> : null}
                      {hasThumbsUp ? <span className="chat-reaction-chip">👍</span> : null}
                    </div>
                  ) : null}
                  {messageVm.editedAt ? <div className="chat-edited-mark">{t("chat.editedMark")}</div> : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {editingMessageId ? (
        <div className="chat-edit-banner mb-2 flex items-center justify-between gap-3">
          <span>{t("chat.editingNow")}</span>
          <Button type="button" className="secondary tiny" onClick={onCancelEdit}>{t("chat.cancelEdit")}</Button>
        </div>
      ) : null}
      {replyingToMessage ? (
        <div className="chat-reply-banner mb-2 flex items-center justify-between gap-3">
          <span>
            {t("chat.replyingTo")}
            {" "}
            <strong>{replyingToMessage.userName}</strong>
            {": "}
            {String(replyingToMessage.text || "").replace(/\s+/g, " ").trim().slice(0, 120)}
          </span>
          <Button type="button" className="secondary tiny" onClick={onCancelReply}>{t("chat.cancelReply")}</Button>
        </div>
      ) : null}
      <form className="chat-compose mt-3 flex items-end gap-3" onSubmit={onSendMessage}>
        <input
          ref={attachmentInputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] || null;
            onSelectAttachmentFile(file);
            event.currentTarget.value = "";
          }}
          accept="image/*,audio/*,.pdf,.txt,.csv,.zip"
        />
        <Button
          type="button"
          className="secondary"
          onClick={() => attachmentInputRef.current?.click()}
          disabled={!hasActiveRoom}
          aria-label={t("chat.attach")}
          title={t("chat.attach")}
        >
          <i className="bi bi-paperclip" aria-hidden="true" />
        </Button>
        <textarea
          value={chatText}
          onChange={(event) => onSetChatText(event.target.value)}
          onPaste={onChatPaste}
          onKeyDown={onChatInputKeyDown}
          rows={2}
          placeholder={hasActiveRoom ? t("chat.typePlaceholder") : t("chat.selectChannelPlaceholder")}
          disabled={!hasActiveRoom}
          aria-label={t("chat.composeAria")}
        />
        {composePreviewImage ? (
          <Button
            type="button"
            className="chat-compose-thumb-btn"
            onClick={() => setPreviewImageUrl(composePreviewImage)}
            aria-label={t("chat.openImagePreview")}
            title={t("chat.openImagePreview")}
          >
            <img
              src={composePreviewImage}
              alt="chat-compose-image"
              className="chat-compose-thumb"
              loading="lazy"
            />
          </Button>
        ) : null}
        {composePendingAttachmentName ? (
          <div className="chat-compose-attachment-pill" title={composePendingAttachmentName}>
            <span className="chat-compose-attachment-name">{composePendingAttachmentName}</span>
            <Button
              type="button"
              className="secondary tiny"
              onClick={onClearPendingAttachment}
              aria-label={t("chat.clearAttachment")}
              title={t("chat.clearAttachment")}
            >
              ×
            </Button>
          </div>
        ) : null}
        <Button type="submit" disabled={!hasActiveRoom}>{editingMessageId ? t("chat.saveEdit") : t("chat.send")}</Button>
      </form>
      {previewImageUrl && typeof document !== "undefined"
        ? createPortal(
          <div
            className="chat-image-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={t("chat.imagePreviewTitle")}
            onClick={() => setPreviewImageUrl(null)}
          >
            <div className="chat-image-modal-card" onClick={(event) => event.stopPropagation()}>
              <Button
                type="button"
                className="secondary tiny chat-image-modal-close"
                onClick={() => setPreviewImageUrl(null)}
              >
                {t("chat.closeImagePreview")}
              </Button>
              <img
                src={resolveAttachmentImageUrl(previewImageUrl)}
                alt="chat-image-preview"
                className="chat-image-modal-media"
              />
            </div>
          </div>
          ,
          document.body
        )
        : null}
      {topicPaletteOpen && typeof document !== "undefined"
        ? createPortal(
          <div
            className="chat-topic-palette-overlay"
            id="chat-topic-palette-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("chat.topicPaletteTitle")}
            onClick={closeTopicPalette}
          >
            <section
              className="chat-topic-palette-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="chat-topic-palette-head">
                <h3>{t("chat.topicPaletteTitle")}</h3>
                <Button type="button" className="secondary tiny" onClick={closeTopicPalette}>
                  {t("chat.editTopicCancel")}
                </Button>
              </div>
              <input
                ref={topicPaletteInputRef}
                type="search"
                value={topicPaletteQuery}
                onChange={(event) => setTopicPaletteQuery(event.target.value)}
                onKeyDown={handleTopicPaletteKeyDown}
                placeholder={t("chat.topicPalettePlaceholder")}
                className="chat-topic-palette-input"
                aria-label={t("chat.topicPalettePlaceholder")}
                aria-controls={topicPaletteListboxId}
                aria-activedescendant={filteredTopicsForPalette[topicPaletteSelectedIndex] ? `chat-topic-option-${filteredTopicsForPalette[topicPaletteSelectedIndex].id}` : undefined}
              />
              <div id={topicPaletteListboxId} className="chat-topic-palette-list" role="listbox" aria-label={t("chat.topicPaletteResultsAria")}>
                {filteredTopicsForPalette.length === 0 ? (
                  <div className="chat-topic-palette-empty">{t("chat.topicPaletteEmpty")}</div>
                ) : (
                  filteredTopicsForPalette.map((topic, index) => {
                    const isActive = topic.id === activeTopicId;
                    const unread = getTopicUnreadCount(topic);
                    const selected = index === topicPaletteSelectedIndex;

                    return (
                      <Button
                        key={topic.id}
                        id={`chat-topic-option-${topic.id}`}
                        type="button"
                        className={`secondary chat-topic-palette-item ${selected ? "chat-topic-palette-item-selected" : ""}`}
                        role="option"
                        aria-selected={selected}
                        aria-current={isActive ? "true" : undefined}
                        onMouseEnter={() => setTopicPaletteSelectedIndex(index)}
                        onClick={() => selectTopicFromPalette(topic.id)}
                      >
                        <span className="chat-topic-palette-item-title-wrap">
                          {topic.isPinned ? <span className="chat-topic-palette-item-pin">{t("chat.topicPinnedBadge")}</span> : null}
                          <span className="chat-topic-palette-item-title">{topic.title}</span>
                        </span>
                        {unread > 0 ? <span className="chat-topic-palette-item-unread">{unread}</span> : null}
                      </Button>
                    );
                  })
                )}
              </div>
            </section>
          </div>,
          document.body
        )
        : null}
      {topicContextMenu && typeof document !== "undefined"
        ? createPortal(
          <div
            className="chat-topic-context-menu"
            role="menu"
            style={{ left: `${topicContextMenu.x}px`, top: `${topicContextMenu.y}px` }}
          >
            <Button type="button" className="secondary tiny" role="menuitem" onClick={() => void runTopicMenuAction("read")}>
              {t("chat.markTopicRead")}
            </Button>
            <Button type="button" className="secondary tiny" role="menuitem" onClick={() => void runTopicMenuAction("edit")}>
              {t("chat.editTopic")}
            </Button>
            <Button type="button" className="secondary tiny" role="menuitem" onClick={() => void runTopicMenuAction("archive")}>
              {topics.find((topic) => topic.id === topicContextMenu.topicId)?.archivedAt ? t("chat.unarchiveTopic") : t("chat.archiveTopic")}
            </Button>
          </div>,
          document.body
        )
        : null}
    </section>
  );
}
