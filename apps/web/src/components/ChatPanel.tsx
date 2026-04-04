// Purpose: presentation-only chat panel with message timeline, composer, and message-level UI actions.
import { ClipboardEvent, FormEvent, KeyboardEvent, MouseEvent, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Message, RoomTopic } from "../domain";
import { api } from "../api";
import { getDesktopNotificationBridge } from "../desktopBridge";
import { buildChatMessageViewModels } from "../utils/chatMessageViewModel";
import { useChatTopLazyLoad } from "./chatPanel/hooks/useChatTopLazyLoad";
import { TopicTabsHeader } from "./chatPanel/sections/TopicTabsHeader";
import { SearchPanel } from "./chatPanel/sections/SearchPanel";
import { ChatMessageTimeline } from "./chatPanel/sections/ChatMessageTimeline";
import { ChatComposerSection } from "./chatPanel/sections/ChatComposerSection";
import { ChatPanelOverlays } from "./chatPanel/sections/ChatPanelOverlays";

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
  onDeleteTopic: (topicId: string) => Promise<void>;
};

export function ChatPanel({
  t,
  locale,
  currentServerId,
  roomSlug, roomId, roomTitle,
  topics,  activeTopicId,
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
  onUnarchiveTopic,
  onDeleteTopic
}: ChatPanelProps) {
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [topicCreateOpen, setTopicCreateOpen] = useState(false);
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [editingTopicTitle, setEditingTopicTitle] = useState("");
  const [editingTopicSaving, setEditingTopicSaving] = useState(false);
  const [editingTopicStatusText, setEditingTopicStatusText] = useState("");
  const [archivingTopicId, setArchivingTopicId] = useState<string | null>(null);
  const [topicFilterMode] = useState<"all" | "active" | "unread" | "my" | "mentions" | "pinned" | "archived">("all");
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
  const [notificationMode, setNotificationMode] = useState<"all" | "mentions" | "none">("all");
  const [notificationSaving, setNotificationSaving] = useState(false);
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
    includeHistoryLoad?: boolean;
  } | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [contextMenuMessageId, setContextMenuMessageId] = useState<string | null>(null);
  const [topicContextMenu, setTopicContextMenu] = useState<{ topicId: string; x: number; y: number } | null>(null);
  const [editingTopicTitleDraftInitial, setEditingTopicTitleDraftInitial] = useState("");
  const [isEditingTopicTitleInline, setIsEditingTopicTitleInline] = useState(false);
  const [topicDeleteConfirm, setTopicDeleteConfirm] = useState<{ topicId: string; title: string } | null>(null);
  const autoMarkReadInFlightRef = useRef<Record<string, number>>({});
  const unreadDividerFadeTimerRef = useRef<number | null>(null);
  const unreadDividerScrolledTopicRef = useRef<string>("");
  const [entryUnreadDivider, setEntryUnreadDivider] = useState<{
    topicId: string;
    messageId: string;
    visible: boolean;
  } | null>(null);
  const [topicMutePresetById, setTopicMutePresetById] = useState<Record<string, "1h" | "8h" | "24h" | "forever" | "off">>({});
  const [hotkeyStatusText, setHotkeyStatusText] = useState("");
  const [resolvedAttachmentImageUrls, setResolvedAttachmentImageUrls] = useState<Record<string, string>>({});
  const resolvedAttachmentImageUrlsRef = useRef<Record<string, string>>({});
  const topicPaletteInputRef = useRef<HTMLInputElement | null>(null);
  const topicCreatePopupRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const notifiedInboxEventIdsRef = useRef<Set<string>>(new Set());
  const notificationPermissionRequestedRef = useRef(false);
  const desktopNotificationBridgeRef = useRef(getDesktopNotificationBridge());
  const inboxItemsRef = useRef(inboxItems);
  const activeRoomSlugRef = useRef(roomSlug);
  const activeTopicIdRef = useRef(activeTopicId);
  const hasActiveRoom = Boolean(roomSlug);

  useEffect(() => {
    inboxItemsRef.current = inboxItems;
  }, [inboxItems]);

  useEffect(() => {
    activeRoomSlugRef.current = roomSlug;
    activeTopicIdRef.current = activeTopicId;
  }, [roomSlug, activeTopicId]);

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
    const shouldLoadHistory = searchJumpTarget.includeHistoryLoad !== false;
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

    if (!shouldLoadHistory) {
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
    let item = inboxItemsRef.current.find((entry) => entry.id === eventId);
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
        inboxItemsRef.current = nextItems;
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
      topicId: item.topicId || null,
      includeHistoryLoad: false
    });
    void markInboxItemRead(item.id);
  }, [authToken, markInboxItemRead]);

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

          const sameRoom = String(item.roomSlug || "").trim() === String(activeRoomSlugRef.current || "").trim();
          const itemTopicId = String(item.topicId || "").trim();
          const sameTopic = !itemTopicId || itemTopicId === String(activeTopicIdRef.current || "").trim();
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
  }, [authToken, openInboxItem, persistNotifiedInboxEvents]);

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

  useEffect(() => {
    const normalizedTopicId = String(activeTopicId || "").trim();
    if (!normalizedTopicId) {
      setEntryUnreadDivider(null);
      unreadDividerScrolledTopicRef.current = "";
      if (unreadDividerFadeTimerRef.current) {
        window.clearTimeout(unreadDividerFadeTimerRef.current);
        unreadDividerFadeTimerRef.current = null;
      }
      return;
    }

    if (entryUnreadDivider?.topicId === normalizedTopicId && entryUnreadDivider.messageId) {
      return;
    }

    const activeTopic = topics.find((topic) => String(topic.id || "").trim() === normalizedTopicId);
    const unreadCount = Math.max(0, Number(activeTopic?.unreadCount || 0));
    if (!activeTopic || unreadCount <= 0 || messages.length === 0) {
      setEntryUnreadDivider(null);
      unreadDividerScrolledTopicRef.current = "";
      return;
    }

    const dividerIndex = Math.max(0, Math.min(messages.length - 1, messages.length - unreadCount));
    const dividerMessageId = String(messages[dividerIndex]?.id || "").trim();
    if (!dividerMessageId) {
      setEntryUnreadDivider(null);
      unreadDividerScrolledTopicRef.current = "";
      return;
    }

    setEntryUnreadDivider({
      topicId: normalizedTopicId,
      messageId: dividerMessageId,
      visible: true
    });
    unreadDividerScrolledTopicRef.current = "";

    if (unreadDividerFadeTimerRef.current) {
      window.clearTimeout(unreadDividerFadeTimerRef.current);
    }
    unreadDividerFadeTimerRef.current = window.setTimeout(() => {
      setEntryUnreadDivider((prev) => {
        if (!prev || prev.topicId !== normalizedTopicId) {
          return prev;
        }

        return {
          ...prev,
          visible: false
        };
      });
      unreadDividerFadeTimerRef.current = null;
    }, 3200);
  }, [activeTopicId, entryUnreadDivider?.messageId, entryUnreadDivider?.topicId, messages, topics]);

  useEffect(() => {
    if (!entryUnreadDivider?.visible) {
      return;
    }

    const normalizedTopicId = String(activeTopicId || "").trim();
    if (!normalizedTopicId || entryUnreadDivider.topicId !== normalizedTopicId) {
      return;
    }

    if (unreadDividerScrolledTopicRef.current === normalizedTopicId) {
      return;
    }

    const container = chatLogRef.current;
    if (!container) {
      return;
    }

    const selectorMessageId = (typeof CSS !== "undefined" && typeof CSS.escape === "function")
      ? CSS.escape(entryUnreadDivider.messageId)
      : entryUnreadDivider.messageId;
    const target = container.querySelector<HTMLElement>(`[data-message-id="${selectorMessageId}"]`);
    if (!target) {
      return;
    }

    unreadDividerScrolledTopicRef.current = normalizedTopicId;
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [activeTopicId, chatLogRef, entryUnreadDivider]);

  useEffect(() => {
    return () => {
      if (unreadDividerFadeTimerRef.current) {
        window.clearTimeout(unreadDividerFadeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const normalizedToken = String(authToken || "").trim();
    const normalizedTopicId = String(activeTopicId || "").trim();
    const normalizedRoomId = String(roomId || "").trim();
    if (!normalizedToken || !normalizedTopicId || !normalizedRoomId) {
      return;
    }

    const topic = topics.find((item) => String(item.id || "").trim() === normalizedTopicId);
    if (!topic) {
      return;
    }

    const topicRoomId = String(topic.roomId || "").trim();
    if (!topicRoomId || topicRoomId !== normalizedRoomId) {
      return;
    }

    const topicUnread = Math.max(0, Number(topic.unreadCount || 0));
    if (topicUnread === 0) {
      return;
    }

    const inflightUnread = autoMarkReadInFlightRef.current[normalizedTopicId] || 0;
    if (inflightUnread >= topicUnread) {
      return;
    }

    autoMarkReadInFlightRef.current[normalizedTopicId] = topicUnread;
    let disposed = false;

    void api.markTopicRead(normalizedToken, normalizedTopicId)
      .then(() => {
        if (disposed) {
          return;
        }

        setTopicUnreadOverrideById((prev) => ({
          ...prev,
          [normalizedTopicId]: {
            unreadCount: 0,
            sourceUnreadCount: topicUnread
          }
        }));
      })
      .finally(() => {
        if (autoMarkReadInFlightRef.current[normalizedTopicId] === topicUnread) {
          delete autoMarkReadInFlightRef.current[normalizedTopicId];
        }
      });

    return () => {
      disposed = true;
    };
  }, [activeTopicId, authToken, roomId, topics]);

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

  const activeTopic = useMemo(() => topics.find((topic) => topic.id === activeTopicId) ?? null, [topics, activeTopicId]);
  const activeTopicIsArchived = Boolean(activeTopic?.archivedAt);

  const updateTopicMuteSettings = async (topicId: string, muteUntil: string | null) => {
    if (!authToken || notificationSaving || !topicId) {
      return;
    }

    setNotificationSaving(true);
    setEditingTopicStatusText("");
    try {
      await api.updateNotificationSettings(authToken, {
        scopeType: "topic",
        topicId,
        mode: notificationMode,
        allowCriticalMentions: true,
        muteUntil
      });
      setEditingTopicStatusText(t("chat.notificationSaved"));
    } catch {
      setEditingTopicStatusText(t("chat.notificationSaveError"));
    } finally {
      setNotificationSaving(false);
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
    const targetTopic = topics.find((topic) => topic.id === topicId);
    setEditingTopicTitle(String(targetTopic?.title || ""));
    setEditingTopicTitleDraftInitial(String(targetTopic?.title || ""));
    setIsEditingTopicTitleInline(false);
    setTopicContextMenu({ topicId, x: event.clientX, y: event.clientY });
  };

  const runTopicMenuAction = async (action: "read" | "archive" | "delete") => {
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

    if (action === "delete") {
      setTopicDeleteConfirm({ topicId: targetTopic.id, title: targetTopic.title });
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

  const applyTopicRename = async () => {
    const targetTopicId = String(topicContextMenu?.topicId || "").trim();
    const trimmedTitle = editingTopicTitle.trim();
    if (!targetTopicId || !trimmedTitle || editingTopicSaving) {
      return;
    }

    setEditingTopicSaving(true);
    setEditingTopicStatusText("");
    try {
      await onUpdateTopic(targetTopicId, trimmedTitle);
      setEditingTopicTitleDraftInitial(trimmedTitle);
      setIsEditingTopicTitleInline(false);
      setEditingTopicStatusText(t("chat.editTopicSuccess"));
    } catch {
      setEditingTopicStatusText(t("chat.editTopicError"));
    } finally {
      setEditingTopicSaving(false);
    }
  };

  const confirmDeleteTopic = async () => {
    const topicId = String(topicDeleteConfirm?.topicId || "").trim();
    if (!topicId || editingTopicSaving) {
      return;
    }

    setEditingTopicSaving(true);
    try {
      await onDeleteTopic(topicId);
      setEditingTopicStatusText(t("chat.deleteTopicSuccess"));
    } catch {
      setEditingTopicStatusText(t("chat.deleteTopicError"));
    } finally {
      setEditingTopicSaving(false);
      setTopicDeleteConfirm(null);
    }
  };

  const setTopicMutePreset = async (preset: "1h" | "8h" | "24h" | "forever" | "off") => {
    const targetTopicId = String(topicContextMenu?.topicId || "").trim();
    if (!targetTopicId) {
      return;
    }

    const activePreset = topicMutePresetById[targetTopicId] || null;
    const nextPreset = activePreset === preset ? "off" : preset;

    const muteUntil = nextPreset === "off"
      ? null
      : nextPreset === "forever"
        ? buildMuteUntilIso("forever")
        : buildMuteUntilIso(Number(nextPreset.replace("h", "")));

    await updateTopicMuteSettings(targetTopicId, muteUntil);
    setTopicMutePresetById((prev) => ({ ...prev, [targetTopicId]: nextPreset }));
    setTopicContextMenu(null);
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
      {editingTopicStatusText ? <div className="chat-topic-read-status mb-2" role="status" aria-live="polite">{editingTopicStatusText}</div> : null}
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
      <ChatMessageTimeline
        t={t}
        hasActiveRoom={hasActiveRoom}
        hasTopics={hasTopics}
        activeTopicId={activeTopicId}
        loadingOlderMessages={loadingOlderMessages}
        chatLogRef={chatLogRef}
        messageViewModels={messageViewModels}
        pinnedByMessageId={pinnedByMessageId}
        thumbsUpByMessageId={thumbsUpByMessageId}
        contextMenuMessageId={contextMenuMessageId}
        setContextMenuMessageId={setContextMenuMessageId}
        onReplyMessage={onReplyMessage}
        onEditMessage={onEditMessage}
        onDeleteMessage={onDeleteMessage}
        onReportMessage={onReportMessage}
        onTogglePinMessage={onTogglePinMessage}
        onToggleThumbsUpReaction={onToggleThumbsUpReaction}
        insertMentionToComposer={insertMentionToComposer}
        insertQuoteToComposer={insertQuoteToComposer}
        markTopicUnreadFromMessage={markTopicUnreadFromMessage}
        markReadSaving={markReadSaving}
        formatMessageTime={formatMessageTime}
        resolveAttachmentImageUrl={resolveAttachmentImageUrl}
        formatAttachmentSize={formatAttachmentSize}
        setPreviewImageUrl={setPreviewImageUrl}
        unreadDividerMessageId={entryUnreadDivider?.messageId || null}
        unreadDividerVisible={Boolean(entryUnreadDivider?.visible && entryUnreadDivider?.topicId === String(activeTopicId || "").trim())}
      />
      <ChatComposerSection
        t={t}
        hasActiveRoom={hasActiveRoom}
        activeTopicIsArchived={activeTopicIsArchived}
        editingMessageId={editingMessageId}
        replyingToMessage={replyingToMessage}
        onCancelEdit={onCancelEdit}
        onCancelReply={onCancelReply}
        onSendMessage={onSendMessage}
        onSelectAttachmentFile={onSelectAttachmentFile}
        onClearPendingAttachment={onClearPendingAttachment}
        onSetChatText={onSetChatText}
        onChatPaste={onChatPaste}
        onChatInputKeyDown={onChatInputKeyDown}
        chatText={chatText}
        composePreviewImage={composePreviewImage}
        composePendingAttachmentName={composePendingAttachmentName}
        setPreviewImageUrl={setPreviewImageUrl}
        attachmentInputRef={attachmentInputRef}
      />
      <ChatPanelOverlays
        t={t}
        previewImageUrl={previewImageUrl}
        setPreviewImageUrl={setPreviewImageUrl}
        resolveAttachmentImageUrl={resolveAttachmentImageUrl}
        topicPaletteOpen={topicPaletteOpen}
        closeTopicPalette={closeTopicPalette}
        topicPaletteQuery={topicPaletteQuery}
        setTopicPaletteQuery={setTopicPaletteQuery}
        handleTopicPaletteKeyDown={handleTopicPaletteKeyDown}
        topicPaletteInputRef={topicPaletteInputRef}
        topicPaletteListboxId={topicPaletteListboxId}
        filteredTopicsForPalette={filteredTopicsForPalette}
        topicPaletteSelectedIndex={topicPaletteSelectedIndex}
        activeTopicId={activeTopicId}
        getTopicUnreadCount={getTopicUnreadCount}
        setTopicPaletteSelectedIndex={setTopicPaletteSelectedIndex}
        selectTopicFromPalette={selectTopicFromPalette}
        topicContextMenu={topicContextMenu}
        topics={topics}
        editingTopicSaving={editingTopicSaving}
        archivingTopicId={archivingTopicId}
        notificationSaving={notificationSaving}
        editingTopicTitle={editingTopicTitle}
        setEditingTopicTitle={setEditingTopicTitle}
        isEditingTopicTitleInline={isEditingTopicTitleInline}
        onStartTopicRenameInline={() => {
          setEditingTopicTitleDraftInitial(editingTopicTitle);
          setIsEditingTopicTitleInline(true);
        }}
        onCancelTopicRenameInline={() => {
          setEditingTopicTitle(editingTopicTitleDraftInitial);
          setIsEditingTopicTitleInline(false);
        }}
        applyTopicRename={applyTopicRename}
        runTopicMenuAction={runTopicMenuAction}
        topicMutePresetById={topicMutePresetById}
        setTopicMutePreset={setTopicMutePreset}
        topicDeleteConfirm={topicDeleteConfirm}
        setTopicDeleteConfirm={setTopicDeleteConfirm}
        confirmDeleteTopic={confirmDeleteTopic}
      />
    </section>
  );
}
