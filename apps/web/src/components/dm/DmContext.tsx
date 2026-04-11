import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type DmMessageItem, type DmThreadWithUnread } from "../../api";

// ─── types ──────────────────────────────────────────────

type DmState = {
  /** Активный DM thread (null = DM не открыт) */
  activeThreadId: string | null;
  activePeerUserId: string | null;
  activePeerName: string | null;
  threads: DmThreadWithUnread[];
  messages: DmMessageItem[];
  messagesHasMore: boolean;
  dmText: string;
  loading: boolean;
};

type DmActions = {
  openDm: (peerUserId: string, peerName: string) => void;
  closeDm: () => void;
  sendDmMessage: (text: string) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  setDmText: (text: string) => void;
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

export function DmProvider({ token, children }: { token: string; children: ReactNode }) {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activePeerUserId, setActivePeerUserId] = useState<string | null>(null);
  const [activePeerName, setActivePeerName] = useState<string | null>(null);
  const [threads, setThreads] = useState<DmThreadWithUnread[]>([]);
  const [messages, setMessages] = useState<DmMessageItem[]>([]);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [dmText, setDmText] = useState("");
  const [loading, setLoading] = useState(false);
  const cursorRef = useRef<string | null>(null);

  // Загрузить сообщения при открытии thread
  useEffect(() => {
    if (!activeThreadId || !token) return;
    let cancelled = false;

    setLoading(true);
    setMessages([]);
    setMessagesHasMore(false);
    cursorRef.current = null;

    api.dmGetMessages(token, activeThreadId).then((res) => {
      if (cancelled) return;
      setMessages(res.messages.reverse());
      setMessagesHasMore(res.hasMore);
      if (res.messages.length > 0) {
        cursorRef.current = res.messages[res.messages.length - 1].id;

        // mark read
        const lastMsg = res.messages[0]; // Самое новое (до reverse — первый)
        api.dmMarkRead(token, activeThreadId, lastMsg.id).catch(() => {});
      }
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [activeThreadId, token]);

  const openDm = useCallback(async (peerUserId: string, peerName: string) => {
    setActivePeerUserId(peerUserId);
    setActivePeerName(peerName);
    setDmText("");

    try {
      const res = await api.dmCreateThread(token, peerUserId);
      setActiveThreadId(res.thread.id);
    } catch {
      // Если не получилось создать thread — всё равно показываем пустой стейт
      setActiveThreadId(null);
    }
  }, [token]);

  const closeDm = useCallback(() => {
    setActiveThreadId(null);
    setActivePeerUserId(null);
    setActivePeerName(null);
    setMessages([]);
    setMessagesHasMore(false);
    setDmText("");
    cursorRef.current = null;
  }, []);

  const sendDmMessage = useCallback(async (text: string) => {
    if (!activeThreadId || !token || !text.trim()) return;

    const res = await api.dmSendMessage(token, activeThreadId, text.trim());
    setMessages((prev) => [...prev, res.message]);
    setDmText("");
  }, [activeThreadId, token]);

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
      setThreads((prev) =>
        prev.map((t) =>
          t.id === msg.threadId ? { ...t, updatedAt: msg.createdAt } : t
        )
      );
    }

    if (type === "dm.message.updated") {
      const msg = data as unknown as DmMessageItem;
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
    }

    if (type === "dm.message.deleted") {
      const { id } = data as { id: string };
      setMessages((prev) => prev.filter((m) => m.id !== id));
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

    window.addEventListener("boltorezka:dm", handler);
    return () => window.removeEventListener("boltorezka:dm", handler);
  }, []);

  const value: DmContextValue = {
    activeThreadId,
    activePeerUserId,
    activePeerName,
    threads,
    messages,
    messagesHasMore,
    dmText,
    loading,
    openDm,
    closeDm,
    sendDmMessage,
    loadOlderMessages,
    setDmText,
    handleDmRealtimeEvent
  };

  return <DmContext.Provider value={value}>{children}</DmContext.Provider>;
}
