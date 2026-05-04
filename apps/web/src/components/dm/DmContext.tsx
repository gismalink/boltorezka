/**
 * DmContext.tsx — React-контекст для личных сообщений (DM).
 *
 * Назначение:
 * - Хранит список DM-тредов, непрочитанные и текущую открытую переписку.
 * - Инкапсулирует вызовы API (`api.dm*`) и логику подгрузки истории.
 * - Потребляется компонентами DM-панели внутри ChatPanel и RoomsPanel.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type DmMessageItem, type DmThreadWithUnread } from "../../api";

// ─── types ──────────────────────────────────────────────

type DmState = {
  /** Активный DM thread (null = DM не открыт) */
  activeThreadId: string | null;
  activePeerUserId: string | null;
  activePeerName: string | null;
  threads: DmThreadWithUnread[];
  /** peerUserId → unreadCount */
  dmUnreadByPeerUserId: Record<string, number>;
  messages: DmMessageItem[];
  messagesHasMore: boolean;
  dmText: string;
  loading: boolean;
  pendingDmImageDataUrl: string | null;
  /** Raw reaction rows for the active thread */
  dmReactions: Array<{ messageId: string; emoji: string; userId: string }>;
  /** Message ID at which unread divider should appear (first unread msg) */
  dmUnreadDividerMessageId: string | null;
};

type DmActions = {
  openDm: (peerUserId: string, peerName: string) => void;
  closeDm: () => void;
  sendDmMessage: (text: string, imageDataUrl?: string | null, replyToMessageId?: string) => Promise<void>;
  editDmMessage: (messageId: string, body: string) => Promise<void>;
  deleteDmMessage: (messageId: string) => Promise<void>;
  toggleDmReaction: (messageId: string, emoji: string, active: boolean) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  setDmText: (text: string) => void;
  setPendingDmImageDataUrl: (url: string | null) => void;
  handleDmRealtimeEvent: (type: string, payload: unknown) => void;
};

type DmContextValue = DmState & DmActions;

// ─── context ────────────────────────────────────────────

const DmContext = createContext<DmContextValue | null>(null);

export function useDm(): DmContextValue {
  const ctx = useContext(DmContext);
  if (!ctx) {
    throw new Error("useDm must be used within DmProvider");
  }
  return ctx;
}

export function useDmOptional(): DmContextValue | null {
  return useContext(DmContext);
}

// ─── provider ───────────────────────────────────────────

export function DmProvider({ token, onDmOpen, onDmClose, children }: { token: string; onDmOpen?: () => void; onDmClose?: () => void; children: ReactNode }) {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activePeerUserId, setActivePeerUserId] = useState<string | null>(null);
  const [activePeerName, setActivePeerName] = useState<string | null>(null);
  const [threads, setThreads] = useState<DmThreadWithUnread[]>([]);
  const [messages, setMessages] = useState<DmMessageItem[]>([]);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [dmText, setDmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingDmImageDataUrl, setPendingDmImageDataUrl] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const [dmReactions, setDmReactions] = useState<Array<{ messageId: string; emoji: string; userId: string }>>([]);
  const [dmUnreadDividerMessageId, setDmUnreadDividerMessageId] = useState<string | null>(null);
  const entryUnreadCountRef = useRef<number>(0);

  // Загрузить список тредов (с unreadCount) при монтировании
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api.dmGetThreads(token).then((res) => {
      if (!cancelled) setThreads(res.threads);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  // Маппинг peerUserId → unreadCount
  const dmUnreadByPeerUserId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of threads) {
      if (t.peerUserId && t.unreadCount > 0) {
        map[t.peerUserId] = t.unreadCount;
      }
    }
    return map;
  }, [threads]);

  // Загрузить сообщения при открытии thread
  useEffect(() => {
    if (!activeThreadId || !token) return;
    let cancelled = false;

    setLoading(true);
    setMessages([]);
    setMessagesHasMore(false);
    setDmReactions([]);
    setDmUnreadDividerMessageId(null);
    cursorRef.current = null;

    api.dmGetMessages(token, activeThreadId).then((res) => {
      if (cancelled) return;
      const reversed = res.messages.reverse();
      setMessages(reversed);
      setMessagesHasMore(res.hasMore);

      // Compute unread divider: if there were N unread msgs, divider is before the (len - N)th message
      const entryUnread = entryUnreadCountRef.current;
      if (entryUnread > 0 && reversed.length > 0) {
        const dividerIdx = Math.max(0, reversed.length - entryUnread);
        if (dividerIdx < reversed.length) {
          setDmUnreadDividerMessageId(reversed[dividerIdx].id);
        }
      }
      entryUnreadCountRef.current = 0;

      if (reversed.length > 0) {
        cursorRef.current = reversed[reversed.length - 1].id;

        // mark read: после reverse() самое новое сообщение — последнее в массиве.
        const newestMsg = reversed[reversed.length - 1];
        api.dmMarkRead(token, activeThreadId, newestMsg.id).catch(() => {});
      }
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    // Fetch reactions for the thread
    api.dmGetReactions(token, activeThreadId).then((res) => {
      if (!cancelled) setDmReactions(res.reactions);
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [activeThreadId, token]);

  const openDm = useCallback(async (peerUserId: string, peerName: string) => {
    if (activePeerUserId === peerUserId) return; // уже открыт
    onDmOpen?.();
    setActivePeerUserId(peerUserId);
    setActivePeerName(peerName);
    setDmText("");

    // Capture unread count before resetting (for divider computation)
    const threadForPeer = threads.find((t) => t.peerUserId === peerUserId);
    entryUnreadCountRef.current = threadForPeer?.unreadCount || 0;

    // Reset unread count for this peer
    setThreads((prev) =>
      prev.map((t) =>
        t.peerUserId === peerUserId ? { ...t, unreadCount: 0 } : t
      )
    );

    try {
      const res = await api.dmCreateThread(token, peerUserId);
      setActiveThreadId(res.thread.id);
    } catch {
      // Если не получилось создать thread — всё равно показываем пустой стейт
      setActiveThreadId(null);
    }
  }, [token, threads, onDmOpen, activePeerUserId]);

  const closeDm = useCallback(() => {
    onDmClose?.();
    setActiveThreadId(null);
    setActivePeerUserId(null);
    setActivePeerName(null);
    setMessages([]);
    setMessagesHasMore(false);
    setDmText("");
    setPendingDmImageDataUrl(null);
    setDmReactions([]);
    setDmUnreadDividerMessageId(null);
    cursorRef.current = null;
  }, [onDmClose]);

  const sendDmMessage = useCallback(async (text: string, imageDataUrl?: string | null, replyToMessageId?: string) => {
    if (!activeThreadId || !token) return;
    if (!text.trim() && !imageDataUrl) return;

    if (imageDataUrl) {
      try {
        const imageResponse = await fetch(imageDataUrl);
        const imageBlob = await imageResponse.blob();
        const mimeType = String(imageBlob.type || "image/jpeg").trim().toLowerCase();
        const sizeBytes = Number(imageBlob.size || 0);
        if (!mimeType || sizeBytes <= 0) return;

        const init = await api.dmUploadInit(token, activeThreadId, { mimeType, sizeBytes });
        await api.uploadChatObject(init.uploadUrl, imageBlob, init.requiredHeaders || { "content-type": mimeType });
        const result = await api.dmUploadFinalize(token, activeThreadId, {
          uploadId: init.uploadId,
          storageKey: init.storageKey,
          mimeType,
          sizeBytes,
          text: text.trim()
        });

        setMessages((prev) => {
          if (prev.some((m) => m.id === result.message.id)) return prev;
          return [...prev, result.message];
        });
        setDmText("");
        setPendingDmImageDataUrl(null);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("datowave:chat:own-send"));
        }
      } catch {
        // upload failed — silently ignore for now
      }
      return;
    }

    const res = await api.dmSendMessage(token, activeThreadId, text.trim(), replyToMessageId);
    setMessages((prev) => {
      if (prev.some((m) => m.id === res.message.id)) return prev;
      return [...prev, res.message];
    });
    setDmText("");
    // B3: сигнал ChatPanel для принудительного скролла к низу.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("datowave:chat:own-send"));
    }
  }, [activeThreadId, token]);

  const editDmMessage = useCallback(async (messageId: string, body: string) => {
    if (!token) return;
    try {
      const res = await api.dmEditMessage(token, messageId, body);
      setMessages((prev) => prev.map((m) => (m.id === res.message.id ? res.message : m)));
    } catch {
      // edit failed — ignore
    }
  }, [token]);

  const deleteDmMessage = useCallback(async (messageId: string) => {
    if (!token) return;
    try {
      await api.dmDeleteMessage(token, messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch {
      // delete failed — ignore
    }
  }, [token]);

  const toggleDmReaction = useCallback(async (messageId: string, emoji: string, active: boolean) => {
    if (!token) return;
    try {
      await api.dmToggleReaction(token, messageId, emoji, active);
    } catch {
      // reaction toggle failed — ignore
    }
  }, [token]);

  const loadOlderMessages = useCallback(async () => {
    if (!activeThreadId || !token || !messagesHasMore) return;

    const oldestMsg = messages[0];
    if (!oldestMsg) return;

    const res = await api.dmGetMessages(token, activeThreadId, oldestMsg.id, 50);
    setMessages((prev) => [...res.messages.reverse(), ...prev]);
    setMessagesHasMore(res.hasMore);
  }, [activeThreadId, token, messagesHasMore, messages]);

  const handleDmRealtimeEvent = useCallback((type: string, payload: unknown) => {
    const data = payload as Record<string, unknown>;

    if (type === "dm.message.created") {
      const msg = data as unknown as DmMessageItem;
      if (msg.threadId === activeThreadId) {
        setMessages((prev) => {
          // Дедупликация
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });

        // auto mark-read
        if (token && activeThreadId) {
          api.dmMarkRead(token, activeThreadId, msg.id).catch(() => {});
        }
      }

      // Обновить unread в threads list
      setThreads((prev) => {
        const isActiveThread = msg.threadId === activeThreadId;
        const exists = prev.some((t) => t.id === msg.threadId);
        if (!exists) {
          // Новый thread — добавляем с unreadCount=1 (если не активный)
          return [
            {
              id: msg.threadId,
              userLowId: "",
              userHighId: "",
              createdAt: msg.createdAt,
              updatedAt: msg.createdAt,
              peerUserId: (msg as Record<string, unknown>).senderUserId as string | undefined,
              unreadCount: isActiveThread ? 0 : 1
            },
            ...prev
          ];
        }
        return prev.map((t) =>
          t.id === msg.threadId
            ? { ...t, updatedAt: msg.createdAt, unreadCount: isActiveThread ? t.unreadCount : t.unreadCount + 1 }
            : t
        );
      });
    }

    if (type === "dm.message.updated") {
      const msg = data as unknown as DmMessageItem;
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
    }

    if (type === "dm.message.deleted") {
      const { id } = data as { id: string };
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }

    if (type === "dm.reaction.changed") {
      const { messageId, emoji, userId, active } = data as { messageId: string; emoji: string; userId: string; active: boolean };
      setDmReactions((prev) => {
        if (active) {
          // Add reaction (deduplicate)
          if (prev.some((r) => r.messageId === messageId && r.emoji === emoji && r.userId === userId)) return prev;
          return [...prev, { messageId, emoji, userId }];
        } else {
          return prev.filter((r) => !(r.messageId === messageId && r.emoji === emoji && r.userId === userId));
        }
      });
    }
  }, [activeThreadId, token]);

  // Слушаем DM-события из WS через CustomEvent (dispatched в wsMessageController)
  const handleDmRealtimeEventRef = useRef(handleDmRealtimeEvent);
  handleDmRealtimeEventRef.current = handleDmRealtimeEvent;

  useEffect(() => {
    const handler = (event: Event) => {
      const { type, payload } = (event as CustomEvent<{ type: string; payload: unknown }>).detail;
      handleDmRealtimeEventRef.current(type, payload);
    };

    window.addEventListener("datowave:dm", handler);
    return () => window.removeEventListener("datowave:dm", handler);
  }, []);

  const value: DmContextValue = {
    activeThreadId,
    activePeerUserId,
    activePeerName,
    threads,
    dmUnreadByPeerUserId,
    messages,
    messagesHasMore,
    dmText,
    loading,
    pendingDmImageDataUrl,
    dmReactions,
    dmUnreadDividerMessageId,
    openDm,
    closeDm,
    sendDmMessage,
    editDmMessage,
    deleteDmMessage,
    toggleDmReaction,
    loadOlderMessages,
    setDmText,
    setPendingDmImageDataUrl,
    handleDmRealtimeEvent
  };

  return <DmContext.Provider value={value}>{children}</DmContext.Provider>;
}
