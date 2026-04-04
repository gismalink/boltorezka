import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../api";
import { getDesktopNotificationBridge } from "../../../desktopBridge";

type InboxItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  messageId: string | null;
  topicId: string | null;
  roomSlug: string;
  priority: "normal" | "critical";
};

type UseChatPanelInboxNotificationsArgs = {
  authToken: string;
  roomSlug: string;
  activeTopicId: string | null;
  onJumpToMessage: (payload: {
    messageId: string;
    roomSlug: string;
    topicId: string | null;
    includeHistoryLoad?: boolean;
  }) => void;
  onResetJumpStatus: () => void;
};

export function useChatPanelInboxNotifications({
  authToken,
  roomSlug,
  activeTopicId,
  onJumpToMessage,
  onResetJumpStatus
}: UseChatPanelInboxNotificationsArgs) {
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);

  const notificationPermissionRequestedRef = useRef(false);
  const desktopNotificationBridgeRef = useRef(getDesktopNotificationBridge());
  const inboxItemsRef = useRef(inboxItems);
  const activeRoomSlugRef = useRef(roomSlug);
  const activeTopicIdRef = useRef(activeTopicId);
  const onJumpToMessageRef = useRef(onJumpToMessage);
  const onResetJumpStatusRef = useRef(onResetJumpStatus);
  const notifiedInboxEventIdsRef = useRef<Set<string>>(new Set());
  const pollUnreadInFlightRef = useRef(false);

  useEffect(() => {
    inboxItemsRef.current = inboxItems;
  }, [inboxItems]);

  useEffect(() => {
    activeRoomSlugRef.current = roomSlug;
    activeTopicIdRef.current = activeTopicId;
  }, [roomSlug, activeTopicId]);

  useEffect(() => {
    onJumpToMessageRef.current = onJumpToMessage;
    onResetJumpStatusRef.current = onResetJumpStatus;
  }, [onJumpToMessage, onResetJumpStatus]);

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

  const loadInbox = useCallback(async () => {
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
  }, [authToken]);

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

  const markInboxAllRead = useCallback(async () => {
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
  }, [authToken, inboxLoading]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

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

    onResetJumpStatusRef.current();
    onJumpToMessageRef.current({
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
      if (pollUnreadInFlightRef.current) {
        return;
      }

      pollUnreadInFlightRef.current = true;
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
      } finally {
        pollUnreadInFlightRef.current = false;
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

  return {
    inboxLoading,
    inboxItems,
    loadInbox,
    markInboxAllRead,
    openInboxItem
  };
}
