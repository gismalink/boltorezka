import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { AuthController } from "./services/authController";
import { CallSignalingController, type CallSignalEventType, type CallStatus } from "./services/callSignalingController";
import { ChatController } from "./services/chatController";
import { RealtimeClient } from "./services/realtimeClient";
import { RoomAdminController } from "./services/roomAdminController";
import { TooltipPortal } from "./TooltipPortal";
import { WsMessageController } from "./services/wsMessageController";
import { RoomsPanel } from "./components/RoomsPanel";
import { PopupPortal } from "./components/PopupPortal";
import { ToastStack } from "./components/ToastStack";
import { UserDock } from "./components/UserDock";
import type { InputProfile, MediaDevicesState, VoiceSettingsPanel } from "./components/types";
import { detectInitialLang, LANGUAGE_OPTIONS, LOCALE_BY_LANG, TEXT, type Lang } from "./i18n";
import { trackClientEvent } from "./telemetry";
import type {
  Message,
  MessagesCursor,
  Room,
  RoomKind,
  RoomsTreeResponse,
  TelemetrySummary,
  User
} from "./types";

const MAX_CHAT_RETRIES = 3;
const TOAST_AUTO_DISMISS_MS = 4500;
const TOAST_ID_RANDOM_RANGE = 10000;

export function App() {
  const [token, setToken] = useState(localStorage.getItem("boltorezka_token") || "");
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState("loading");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsTree, setRoomsTree] = useState<RoomsTreeResponse | null>(null);
  const [roomSlug, setRoomSlug] = useState("general");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [messagesNextCursor, setMessagesNextCursor] = useState<MessagesCursor | null>(null);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [chatText, setChatText] = useState("");
  const [callTargetUserId, setCallTargetUserId] = useState("");
  const [callSignalJson, setCallSignalJson] = useState('{"type":"offer","sdp":""}');
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [lastCallPeer, setLastCallPeer] = useState("");
  const [callEventLog, setCallEventLog] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string }>>([]);
  const [roomsPresenceBySlug, setRoomsPresenceBySlug] = useState<Record<string, string[]>>({});
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [telemetrySummary, setTelemetrySummary] = useState<TelemetrySummary | null>(null);
  const [wsState, setWsState] = useState<"disconnected" | "connecting" | "connected">(
    "disconnected"
  );
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [newRoomSlug, setNewRoomSlug] = useState("");
  const [newRoomTitle, setNewRoomTitle] = useState("");
  const [newRoomKind, setNewRoomKind] = useState<RoomKind>("text");
  const [newRoomCategoryId, setNewRoomCategoryId] = useState<string>("none");
  const [newCategorySlug, setNewCategorySlug] = useState("");
  const [newCategoryTitle, setNewCategoryTitle] = useState("");
  const [categoryPopupOpen, setCategoryPopupOpen] = useState(false);
  const [channelPopupOpen, setChannelPopupOpen] = useState(false);
  const [categorySettingsPopupOpenId, setCategorySettingsPopupOpenId] = useState<string | null>(null);
  const [editingCategoryTitle, setEditingCategoryTitle] = useState("");
  const [channelSettingsPopupOpenId, setChannelSettingsPopupOpenId] = useState<string | null>(null);
  const [editingRoomTitle, setEditingRoomTitle] = useState("");
  const [editingRoomKind, setEditingRoomKind] = useState<RoomKind>("text");
  const [editingRoomCategoryId, setEditingRoomCategoryId] = useState<string>("none");
  const [micMuted, setMicMuted] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [audioOutputMenuOpen, setAudioOutputMenuOpen] = useState(false);
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const [userSettingsOpen, setUserSettingsOpen] = useState(false);
  const [userSettingsTab, setUserSettingsTab] = useState<"profile" | "sound">("profile");
  const [lang, setLang] = useState<Lang>(() => detectInitialLang());
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profileStatusText, setProfileStatusText] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [inputDevices, setInputDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [outputDevices, setOutputDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>(() => localStorage.getItem("boltorezka_selected_input_id") || "default");
  const [selectedOutputId, setSelectedOutputId] = useState<string>(() => localStorage.getItem("boltorezka_selected_output_id") || "default");
  const [selectedInputProfile, setSelectedInputProfile] = useState<InputProfile>("custom");
  const [voiceSettingsPanel, setVoiceSettingsPanel] = useState<VoiceSettingsPanel>(null);
  const [mediaDevicesState, setMediaDevicesState] = useState<MediaDevicesState>("ready");
  const [mediaDevicesHint, setMediaDevicesHint] = useState("");
  const [micVolume, setMicVolume] = useState<number>(() => Number(localStorage.getItem("boltorezka_mic_volume") || 75));
  const [outputVolume, setOutputVolume] = useState<number>(() => Number(localStorage.getItem("boltorezka_output_volume") || 70));
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const realtimeClientRef = useRef<RealtimeClient | null>(null);
  const roomSlugRef = useRef(roomSlug);
  const lastRoomSlugForScrollRef = useRef(roomSlug);
  const lastMessageIdRef = useRef<string | null>(null);
  const chatLogRef = useRef<HTMLDivElement>(null);
  const autoSsoAttemptedRef = useRef(false);
  const authMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const categoryPopupRef = useRef<HTMLDivElement>(null);
  const channelPopupRef = useRef<HTMLDivElement>(null);
  const audioOutputAnchorRef = useRef<HTMLDivElement>(null);
  const voiceSettingsAnchorRef = useRef<HTMLDivElement>(null);
  const userSettingsRef = useRef<HTMLDivElement>(null);

  const canCreateRooms = user?.role === "admin" || user?.role === "super_admin";
  const canPromote = user?.role === "super_admin";
  const canViewTelemetry = canPromote || canCreateRooms;
  const locale = LOCALE_BY_LANG[lang];
  const t = useMemo(() => {
    const dict = TEXT[lang];
    return (key: string) => dict[key] || key;
  }, [lang]);

  const pushLog = (text: string) => {
    setEventLog((prev) => [`${new Date().toLocaleTimeString(locale)} ${text}`, ...prev].slice(0, 30));
  };

  const pushCallLog = (text: string) => {
    setCallEventLog((prev) => [`${new Date().toLocaleTimeString(locale)} ${text}`, ...prev].slice(0, 30));
  };

  const pushToast = useCallback((message: string) => {
    const normalized = String(message || "").trim();
    if (!normalized) {
      return;
    }

    const toast = {
      id: Date.now() + Math.floor(Math.random() * TOAST_ID_RANDOM_RANGE),
      message: normalized
    };

    setToasts((prev) => [...prev, toast]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== toast.id));
    }, TOAST_AUTO_DISMISS_MS);
  }, []);

  const markMessageDelivery = (
    requestId: string,
    status: "sending" | "delivered" | "failed",
    patch: Partial<Message> = {}
  ) => {
    setMessages((prev) =>
      prev.map((item) =>
        item.clientRequestId === requestId ? { ...item, deliveryStatus: status, ...patch } : item
      )
    );
  };

  const sendWsEvent = useCallback((
    eventType: string,
    payload: Record<string, unknown>,
    options: { withIdempotency?: boolean; trackAck?: boolean; maxRetries?: number } = {}
  ) => {
    return realtimeClientRef.current?.sendEvent(eventType, payload, options) ?? null;
  }, []);

  const callSignalingController = useMemo(
    () =>
      new CallSignalingController({
        sendWsEvent,
        setCallStatus,
        setLastCallPeer,
        pushCallLog
      }),
    [sendWsEvent]
  );

  const authController = useMemo(
    () =>
      new AuthController({
        pushLog,
        setToken,
        setUser
      }),
    []
  );

  const roomAdminController = useMemo(
    () =>
      new RoomAdminController({
        pushLog,
        setRoomSlug,
        setMessages,
        setMessagesHasMore,
        setMessagesNextCursor,
        sendRoomJoinEvent: (slug) => {
          void sendWsEvent("room.join", { roomSlug: slug }, { maxRetries: 1 });
        },
        setRooms,
        setRoomsTree,
        setAdminUsers
      }),
    [sendWsEvent]
  );

  const loadTelemetrySummary = useCallback(async () => {
    if (!token || !canViewTelemetry) {
      return;
    }

    try {
      const summary = await api.telemetrySummary(token);
      setTelemetrySummary(summary);
    } catch (error) {
      pushLog(`telemetry summary failed: ${(error as Error).message}`);
    }
  }, [token, canViewTelemetry]);

  const chatController = useMemo(
    () =>
      new ChatController({
        pushLog,
        setMessages,
        setMessagesHasMore,
        setMessagesNextCursor,
        setLoadingOlderMessages,
        sendWsEvent,
        loadTelemetrySummary
      }),
    [sendWsEvent, loadTelemetrySummary]
  );

  useEffect(() => {
    api.authMode()
      .then((res) => setAuthMode(res.mode))
      .catch(() => setAuthMode("sso"));
  }, []);

  useEffect(() => {
    if (token || authMode !== "sso" || autoSsoAttemptedRef.current) {
      return;
    }

    autoSsoAttemptedRef.current = true;
    void authController.completeSso({ silent: true });
  }, [token, authMode, authController]);

  useEffect(() => {
    localStorage.setItem("boltorezka_lang", lang);
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    setProfileNameDraft(user?.name || "");
    setProfileStatusText("");
  }, [user]);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setRooms([]);
      setRoomsTree(null);
      setMessages([]);
      setMessagesHasMore(false);
      setMessagesNextCursor(null);
      setLoadingOlderMessages(false);
      setAdminUsers([]);
      setRoomsPresenceBySlug({});
      setTelemetrySummary(null);
      realtimeClientRef.current?.dispose();
      realtimeClientRef.current = null;
      return;
    }

    localStorage.setItem("boltorezka_token", token);

    api.me(token)
      .then((res) => setUser(res.user))
      .catch(() => {
        setToken("");
        localStorage.removeItem("boltorezka_token");
      });

    api.rooms(token)
      .then((res) => setRooms(res.rooms))
      .catch((error) => pushLog(`rooms failed: ${error.message}`));

    void roomAdminController.loadRoomTree(token);
  }, [token]);

  useEffect(() => {
    roomSlugRef.current = roomSlug;
    realtimeClientRef.current?.setRoomSlug(roomSlug);
  }, [roomSlug]);

  useEffect(() => {
    if (!token) {
      setWsState("disconnected");
      return;
    }

    const messageController = new WsMessageController({
      clearPendingRequest: (requestId) => realtimeClientRef.current?.clearPendingRequest(requestId),
      markMessageDelivery,
      setMessages,
      setLastCallPeer,
      setCallStatus,
      pushLog,
      pushCallLog,
      pushToast,
      setRoomSlug,
      setRoomsPresenceBySlug,
      trackNack: ({ requestId, eventType, code, message }) => {
        trackClientEvent(
          "ws.nack.received",
          {
            requestId,
            eventType,
            code,
            message
          },
          token
        );
      }
    });

    const client = new RealtimeClient({
      getTicket: async (authToken) => {
        const response = await api.wsTicket(authToken);
        return response.ticket;
      },
      onWsStateChange: setWsState,
      onLog: (message) => {
        pushLog(message);
        if (message === "ws error") {
          trackClientEvent("ws.error", {}, token);
        }
      },
      onMessage: (message) => messageController.handle(message),
      onConnected: () => {
        trackClientEvent("ws.connected", { roomSlug: roomSlugRef.current }, token);
      },
      onRequestResent: (requestId, eventType) => {
        if (eventType === "chat.send") {
          markMessageDelivery(requestId, "sending");
        }
      },
      onRequestFailed: (requestId, eventType, retries) => {
        if (eventType === "chat.send") {
          markMessageDelivery(requestId, "failed");
          trackClientEvent(
            "chat.request.failed.retries_exhausted",
            { requestId, eventType, retries },
            token
          );
        }
      }
    });

    realtimeClientRef.current = client;
    client.setRoomSlug(roomSlugRef.current);
    client.connect(token);

    return () => {
      client.dispose();
      if (realtimeClientRef.current === client) {
        realtimeClientRef.current = null;
      }
    };
  }, [token]);

  useEffect(() => {
    if (!token || !roomSlug) return;
    void chatController.loadRecentMessages(token, roomSlug);
  }, [token, roomSlug, chatController]);

  useEffect(() => {
    const chatLogElement = chatLogRef.current;
    if (!chatLogElement) {
      return;
    }

    const latestMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
    const roomChanged = lastRoomSlugForScrollRef.current !== roomSlug;
    const latestMessageChanged = latestMessageId !== lastMessageIdRef.current;

    if (roomChanged || latestMessageChanged) {
      chatLogElement.scrollTop = chatLogElement.scrollHeight;
    }

    lastRoomSlugForScrollRef.current = roomSlug;
    lastMessageIdRef.current = latestMessageId;
  }, [messages, roomSlug]);

  const loadOlderMessages = async () => {
    if (!token || !roomSlug || !messagesNextCursor || loadingOlderMessages) {
      return;
    }

    await chatController.loadOlderMessages(token, roomSlug, messagesNextCursor, loadingOlderMessages);
  };

  useEffect(() => {
    if (!token || !canPromote) return;
    api.adminUsers(token)
      .then((res) => setAdminUsers(res.users))
      .catch((error) => pushLog(`admin users failed: ${error.message}`));
  }, [token, canPromote]);

  useEffect(() => {
    if (!token || !canViewTelemetry) {
      setTelemetrySummary(null);
      return;
    }

    void loadTelemetrySummary();
  }, [token, canViewTelemetry, loadTelemetrySummary]);

  useEffect(() => {
    if (wsState !== "connected") {
      return;
    }

    void loadTelemetrySummary();
  }, [wsState, loadTelemetrySummary]);

  useEffect(() => {
    localStorage.setItem("boltorezka_mic_volume", String(micVolume));
  }, [micVolume]);

  useEffect(() => {
    localStorage.setItem("boltorezka_output_volume", String(outputVolume));
  }, [outputVolume]);

  useEffect(() => {
    localStorage.setItem("boltorezka_selected_input_id", selectedInputId);
  }, [selectedInputId]);

  useEffect(() => {
    localStorage.setItem("boltorezka_selected_output_id", selectedOutputId);
  }, [selectedOutputId]);

  useEffect(() => {
    const loadDevices = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setMediaDevicesState("unsupported");
        setMediaDevicesHint(t("settings.browserUnsupported"));
        return;
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices
          .filter((item) => item.kind === "audioinput")
          .map((item, index) => ({
            id: item.deviceId || `input-${index}`,
            label: item.label || `${t("settings.microphone")} ${index + 1}`
          }));
        const outputs = devices
          .filter((item) => item.kind === "audiooutput")
          .map((item, index) => ({
            id: item.deviceId || `output-${index}`,
            label: item.label || `${t("settings.outputDevice")} ${index + 1}`
          }));

        setInputDevices(inputs);
        setOutputDevices(outputs);

        if (inputs.length === 0 && outputs.length === 0) {
          setMediaDevicesState("error");
          setMediaDevicesHint(t("settings.devicesNotFound"));
        } else {
          setMediaDevicesState("ready");
          setMediaDevicesHint("");
        }

        if (inputs.length > 0 && !inputs.some((item) => item.id === selectedInputId)) {
          setSelectedInputId(inputs[0].id);
        }
        if (outputs.length > 0 && !outputs.some((item) => item.id === selectedOutputId)) {
          setSelectedOutputId(outputs[0].id);
        }
      } catch (error) {
        const errorName = (error as { name?: string })?.name || "";
        if (errorName === "NotAllowedError" || errorName === "SecurityError") {
          setMediaDevicesState("denied");
          setMediaDevicesHint(t("settings.mediaDenied"));
          return;
        }

        setMediaDevicesState("error");
        setMediaDevicesHint(t("settings.devicesLoadFailed"));
        return;
      }
    };

    void loadDevices();
  }, [selectedInputId, selectedOutputId, t]);

  useEffect(() => {
    if (!profileMenuOpen && !authMenuOpen && !categoryPopupOpen && !channelPopupOpen && !channelSettingsPopupOpenId && !categorySettingsPopupOpenId && !audioOutputMenuOpen && !voiceSettingsOpen && !userSettingsOpen) {
      return;
    }

    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      const insideProfile = Boolean(target && profileMenuRef.current?.contains(target));
      const insideAuth = Boolean(target && authMenuRef.current?.contains(target));
      const insideCategoryPopup = Boolean(target && categoryPopupRef.current?.contains(target));
      const insideChannelPopup = Boolean(target && channelPopupRef.current?.contains(target));
      const insideChannelSettings = Boolean(target && target instanceof HTMLElement && target.closest(".channel-settings-anchor"));
      const insideCategorySettings = Boolean(target && target instanceof HTMLElement && target.closest(".category-settings-anchor"));
      const insideOutputSettings = Boolean(target && audioOutputAnchorRef.current?.contains(target));
      const insideVoiceSettings = Boolean(target && voiceSettingsAnchorRef.current?.contains(target));
      const insideUserSettings = Boolean(target && userSettingsRef.current?.contains(target));
      const insidePopupLayer = Boolean(target && target instanceof HTMLElement && target.closest(".popup-layer-content"));

      if (!insideProfile && !insideAuth && !insideCategoryPopup && !insideChannelPopup && !insideChannelSettings && !insideCategorySettings && !insideOutputSettings && !insideVoiceSettings && !insideUserSettings && !insidePopupLayer) {
        setProfileMenuOpen(false);
        setAuthMenuOpen(false);
        setCategoryPopupOpen(false);
        setChannelPopupOpen(false);
        setChannelSettingsPopupOpenId(null);
        setCategorySettingsPopupOpenId(null);
        setAudioOutputMenuOpen(false);
        setVoiceSettingsOpen(false);
        setUserSettingsOpen(false);
      }
    };

    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [profileMenuOpen, authMenuOpen, categoryPopupOpen, channelPopupOpen, channelSettingsPopupOpenId, categorySettingsPopupOpenId, audioOutputMenuOpen, voiceSettingsOpen, userSettingsOpen]);

  const beginSso = (provider: "google" | "yandex") => {
    setAuthMenuOpen(false);
    authController.beginSso(provider);
  };
  const logout = () => {
    setProfileMenuOpen(false);
    authController.logout();
  };

  const openUserSettings = (tab: "profile" | "sound") => {
    setProfileMenuOpen(false);
    setAudioOutputMenuOpen(false);
    setVoiceSettingsOpen(false);
    setVoiceSettingsPanel(null);
    setUserSettingsTab(tab);
    setUserSettingsOpen(true);
  };

  const saveMyProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }

    const trimmedName = profileNameDraft.trim();
    if (!trimmedName) {
      setProfileStatusText(t("profile.saveError"));
      return;
    }

    setProfileSaving(true);
    setProfileStatusText("");

    try {
      const response = await api.updateMe(token, { name: trimmedName });
      if (response.user) {
        setUser(response.user);
      }
      setProfileStatusText(t("profile.saveSuccess"));
      pushToast(t("profile.saveSuccess"));
    } catch (error) {
      const message = (error as Error).message || t("profile.saveError");
      setProfileStatusText(message);
      pushToast(message);
    } finally {
      setProfileSaving(false);
    }
  };

  const createRoom = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !canCreateRooms) return;

    const created = await roomAdminController.createRoom(token, newRoomSlug, newRoomTitle, {
      kind: newRoomKind,
      categoryId: newRoomCategoryId === "none" ? null : newRoomCategoryId
    });
    if (created) {
      setNewRoomSlug("");
      setNewRoomTitle("");
      setChannelPopupOpen(false);
    }
  };

  const createCategory = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !canCreateRooms) return;

    const created = await roomAdminController.createCategory(token, newCategorySlug, newCategoryTitle);
    if (created) {
      setNewCategorySlug("");
      setNewCategoryTitle("");
      setCategoryPopupOpen(false);
    }
  };

  const openCreateChannelPopup = (categoryId: string | null = null) => {
    setNewRoomCategoryId(categoryId || "none");
    setChannelPopupOpen(true);
  };

  const openChannelSettingsPopup = (room: Room) => {
    setEditingRoomTitle(room.title);
    setEditingRoomKind(room.kind);
    setEditingRoomCategoryId(room.category_id || "none");
    setChannelSettingsPopupOpenId(room.id);
  };

  const openCategorySettingsPopup = (categoryId: string, categoryTitle: string) => {
    setEditingCategoryTitle(categoryTitle);
    setCategorySettingsPopupOpenId(categoryId);
  };

  const saveCategorySettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !categorySettingsPopupOpenId) {
      return;
    }

    const updated = await roomAdminController.updateCategory(token, categorySettingsPopupOpenId, editingCategoryTitle);
    if (updated) {
      setCategorySettingsPopupOpenId(null);
    }
  };

  const moveCategory = async (direction: "up" | "down") => {
    if (!token || !categorySettingsPopupOpenId) {
      return;
    }

    await roomAdminController.moveCategory(token, categorySettingsPopupOpenId, direction);
  };

  const deleteCategory = async () => {
    if (!token || !categorySettingsPopupOpenId) {
      return;
    }

    const deleted = await roomAdminController.deleteCategory(token, categorySettingsPopupOpenId);
    if (deleted) {
      setCategorySettingsPopupOpenId(null);
    }
  };

  const saveChannelSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !channelSettingsPopupOpenId) {
      return;
    }

    const updated = await roomAdminController.updateRoom(token, channelSettingsPopupOpenId, {
      title: editingRoomTitle,
      kind: editingRoomKind,
      categoryId: editingRoomCategoryId === "none" ? null : editingRoomCategoryId
    });

    if (updated) {
      setChannelSettingsPopupOpenId(null);
    }
  };

  const moveChannel = async (direction: "up" | "down") => {
    if (!token || !channelSettingsPopupOpenId) {
      return;
    }

    await roomAdminController.moveRoom(token, channelSettingsPopupOpenId, direction);
  };

  const deleteChannel = async (room: Room) => {
    if (!token || !channelSettingsPopupOpenId) {
      return;
    }

    const deleted = await roomAdminController.deleteRoom(token, channelSettingsPopupOpenId);
    if (!deleted) {
      return;
    }

    if (room.slug === roomSlug) {
      const fallbackRoom = allRooms.find((item) => item.id !== room.id && item.slug === "general")
        || allRooms.find((item) => item.id !== room.id)
        || null;

      if (fallbackRoom) {
        joinRoom(fallbackRoom.slug);
      }
    }

    setChannelSettingsPopupOpenId(null);
  };

  const clearChannelMessages = async (room: Room) => {
    if (!token || !channelSettingsPopupOpenId) {
      return;
    }

    const cleared = await roomAdminController.clearRoomMessages(token, channelSettingsPopupOpenId);
    if (!cleared) {
      return;
    }

    if (room.slug === roomSlug) {
      setMessages([]);
      setMessagesHasMore(false);
      setMessagesNextCursor(null);
    }
  };

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();

    const result = chatController.sendMessage(chatText, user, MAX_CHAT_RETRIES);
    if (result.sent) {
      setChatText("");
    }
  };

  const sendCallSignal = (eventType: "call.offer" | "call.answer" | "call.ice") => {
    callSignalingController.sendSignal(eventType as CallSignalEventType, callSignalJson, callTargetUserId);
  };

  const sendCallReject = () => {
    callSignalingController.sendReject(callTargetUserId);
  };

  const sendCallHangup = () => {
    callSignalingController.sendHangup(callTargetUserId);
  };

  const joinRoom = (slug: string) => {
    roomAdminController.joinRoom(slug);
  };

  const promote = async (userId: string) => {
    if (!token || !canPromote) return;
    await roomAdminController.promote(token, userId);
  };

  const categorizedRoomIds = useMemo(() => {
    const ids = new Set<string>();
    roomsTree?.categories.forEach((category) => {
      category.channels.forEach((channel) => ids.add(channel.id));
    });
    return ids;
  }, [roomsTree]);

  const uncategorizedRooms = useMemo(() => {
    if (roomsTree) {
      return roomsTree.uncategorized;
    }

    return rooms.filter((room) => !categorizedRoomIds.has(room.id));
  }, [roomsTree, rooms, categorizedRoomIds]);

  const allRooms = useMemo(() => {
    if (roomsTree) {
      const fromCategories = roomsTree.categories.flatMap((category) => category.channels);
      return [...fromCategories, ...roomsTree.uncategorized];
    }

    return rooms;
  }, [roomsTree, rooms]);

  const currentRoom = useMemo(
    () => allRooms.find((room) => room.slug === roomSlug) || null,
    [allRooms, roomSlug]
  );

  const inputOptions = inputDevices.length > 0 ? inputDevices : [{ id: "default", label: t("device.systemDefault") }];
  const outputOptions = outputDevices.length > 0 ? outputDevices : [{ id: "default", label: t("device.systemDefault") }];
  const currentInputLabel = inputOptions.find((device) => device.id === selectedInputId)?.label ?? inputOptions[0]?.label ?? t("device.systemDefault");
  const inputProfileLabel = selectedInputProfile === "noise_reduction"
    ? t("settings.voiceIsolation")
    : selectedInputProfile === "studio"
      ? t("settings.studio")
      : t("settings.custom");

  const currentRoomSupportsRtc = currentRoom ? currentRoom.kind !== "text" : false;
  const roomPeople = useMemo(() => {
    const unique = Array.from(new Set(roomsPresenceBySlug[roomSlug] || []));
    if (unique.length > 0) {
      return unique;
    }

    if (user?.name) {
      return [user.name];
    }

    return [];
  }, [roomsPresenceBySlug, roomSlug, user?.name]);

  return (
    <main className="app legacy-layout">
      <header className="app-header">
        <h1 className="app-title">{t("app.title")}</h1>
        <div className="header-actions">
          {user ? (
            <>
              <span className="user-chip">{user.name}</span>
              <div className="profile-menu" ref={profileMenuRef}>
                <button
                  type="button"
                  className="secondary profile-icon"
                  onClick={() => setProfileMenuOpen((value) => !value)}
                  aria-label={t("profile.menuAria")}
                >
                  <i className="bi bi-person-circle" aria-hidden="true" />
                </button>
                <PopupPortal open={profileMenuOpen} anchorRef={profileMenuRef} className="profile-popup" placement="bottom-end">
                  <div>
                    <button type="button" className="secondary" onClick={() => openUserSettings("profile")}>{t("profile.openSettings")}</button>
                    <button type="button" onClick={logout}>{t("auth.logout")}</button>
                  </div>
                </PopupPortal>
              </div>
            </>
          ) : (
            <div className="auth-menu" ref={authMenuRef}>
              <button type="button" onClick={() => setAuthMenuOpen((value) => !value)}>
                {t("auth.login")}
              </button>
              <PopupPortal open={authMenuOpen} anchorRef={authMenuRef} className="auth-popup" placement="bottom-end">
                <div>
                  <button type="button" className="provider-btn" onClick={() => beginSso("google")}> 
                    <span className="provider-icon provider-google">G</span>
                    {t("auth.google")}
                  </button>
                  <button type="button" className="provider-btn" onClick={() => beginSso("yandex")}>
                    <span className="provider-icon provider-yandex">Я</span>
                    {t("auth.yandex")}
                  </button>
                </div>
              </PopupPortal>
            </div>
          )}
        </div>
      </header>
      <TooltipPortal />

      <div className="workspace">
        <aside className="leftcolumn">
          <RoomsPanel
            t={t}
            canCreateRooms={canCreateRooms}
            roomsTree={roomsTree}
            roomSlug={roomSlug}
            liveRoomMembersBySlug={roomsPresenceBySlug}
            uncategorizedRooms={uncategorizedRooms}
            newCategorySlug={newCategorySlug}
            newCategoryTitle={newCategoryTitle}
            categoryPopupOpen={categoryPopupOpen}
            newRoomSlug={newRoomSlug}
            newRoomTitle={newRoomTitle}
            newRoomKind={newRoomKind}
            newRoomCategoryId={newRoomCategoryId}
            channelPopupOpen={channelPopupOpen}
            categorySettingsPopupOpenId={categorySettingsPopupOpenId}
            editingCategoryTitle={editingCategoryTitle}
            channelSettingsPopupOpenId={channelSettingsPopupOpenId}
            editingRoomTitle={editingRoomTitle}
            editingRoomKind={editingRoomKind}
            editingRoomCategoryId={editingRoomCategoryId}
            categoryPopupRef={categoryPopupRef}
            channelPopupRef={channelPopupRef}
            onSetCategoryPopupOpen={setCategoryPopupOpen}
            onSetChannelPopupOpen={setChannelPopupOpen}
            onSetNewCategorySlug={setNewCategorySlug}
            onSetNewCategoryTitle={setNewCategoryTitle}
            onSetNewRoomSlug={setNewRoomSlug}
            onSetNewRoomTitle={setNewRoomTitle}
            onSetNewRoomKind={setNewRoomKind}
            onSetNewRoomCategoryId={setNewRoomCategoryId}
            onSetEditingCategoryTitle={setEditingCategoryTitle}
            onSetEditingRoomTitle={setEditingRoomTitle}
            onSetEditingRoomKind={setEditingRoomKind}
            onSetEditingRoomCategoryId={setEditingRoomCategoryId}
            onCreateCategory={createCategory}
            onCreateRoom={createRoom}
            onOpenCreateChannelPopup={openCreateChannelPopup}
            onOpenCategorySettingsPopup={openCategorySettingsPopup}
            onOpenChannelSettingsPopup={openChannelSettingsPopup}
            onSaveCategorySettings={saveCategorySettings}
            onMoveCategory={(direction) => void moveCategory(direction)}
            onDeleteCategory={() => void deleteCategory()}
            onSaveChannelSettings={saveChannelSettings}
            onMoveChannel={(direction) => void moveChannel(direction)}
            onClearChannelMessages={(room) => void clearChannelMessages(room)}
            onDeleteChannel={(room) => void deleteChannel(room)}
            onJoinRoom={joinRoom}
          />

          {user ? (
            <UserDock
              t={t}
              user={user}
              currentRoomSupportsRtc={currentRoomSupportsRtc}
              currentRoomTitle={currentRoom?.title || ""}
              micMuted={micMuted}
              audioMuted={audioMuted}
              audioOutputMenuOpen={audioOutputMenuOpen}
              voiceSettingsOpen={voiceSettingsOpen}
              userSettingsOpen={userSettingsOpen}
              userSettingsTab={userSettingsTab}
              voiceSettingsPanel={voiceSettingsPanel}
              profileNameDraft={profileNameDraft}
              profileEmail={user.email}
              profileSaving={profileSaving}
              profileStatusText={profileStatusText}
              selectedLang={lang}
              languageOptions={LANGUAGE_OPTIONS}
              inputOptions={inputOptions}
              outputOptions={outputOptions}
              selectedInputId={selectedInputId}
              selectedOutputId={selectedOutputId}
              selectedInputProfile={selectedInputProfile}
              inputProfileLabel={inputProfileLabel}
              currentInputLabel={currentInputLabel}
              micVolume={micVolume}
              outputVolume={outputVolume}
              mediaDevicesState={mediaDevicesState}
              mediaDevicesHint={mediaDevicesHint}
              audioOutputAnchorRef={audioOutputAnchorRef}
              voiceSettingsAnchorRef={voiceSettingsAnchorRef}
              userSettingsRef={userSettingsRef}
              onToggleMic={() => setMicMuted((value) => !value)}
              onToggleAudio={() => setAudioMuted((value) => !value)}
              onToggleVoiceSettings={() => {
                setAudioOutputMenuOpen(false);
                setVoiceSettingsPanel(null);
                setVoiceSettingsOpen((value) => !value);
              }}
              onToggleAudioOutput={() => {
                setVoiceSettingsOpen(false);
                setVoiceSettingsPanel(null);
                setAudioOutputMenuOpen((value) => !value);
              }}
              onOpenUserSettings={openUserSettings}
              onSetVoiceSettingsOpen={setVoiceSettingsOpen}
              onSetAudioOutputMenuOpen={setAudioOutputMenuOpen}
              onSetVoiceSettingsPanel={setVoiceSettingsPanel}
              onSetUserSettingsOpen={setUserSettingsOpen}
              onSetUserSettingsTab={setUserSettingsTab}
              onSetProfileNameDraft={setProfileNameDraft}
              onSetSelectedLang={setLang}
              onSaveProfile={saveMyProfile}
              onSetSelectedInputId={setSelectedInputId}
              onSetSelectedOutputId={setSelectedOutputId}
              onSetSelectedInputProfile={setSelectedInputProfile}
              onSetMicVolume={setMicVolume}
              onSetOutputVolume={setOutputVolume}
            />
          ) : null}
        </aside>

        <section className="middlecolumn">
          <section className="card middle-card">
            <h2>{t("chat.title")} ({roomSlug})</h2>
            <div className="row">
              <button
                type="button"
                className="secondary"
                onClick={() => void loadOlderMessages()}
                disabled={!messagesHasMore || loadingOlderMessages}
              >
                {loadingOlderMessages ? t("chat.loading") : t("chat.loadOlder")}
              </button>
              {!messagesHasMore && messages.length > 0 ? (
                <span className="muted">{t("chat.historyLoaded")}</span>
              ) : null}
            </div>
            <div className="chat-log" ref={chatLogRef}>
              {messages.map((message) => (
                <div key={message.id} className="chat-line">
                  <span className="chat-user">{message.user_name}:</span> {message.text}
                  {message.deliveryStatus ? (
                    <span className={`delivery delivery-${message.deliveryStatus}`}>
                      {message.deliveryStatus}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
            <form className="chat-compose" onSubmit={sendMessage}>
              <input value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder={t("chat.typePlaceholder")} />
              <button type="submit">{t("chat.send")}</button>
            </form>

          </section>
        </section>

        <aside className="rightcolumn">
          <section className="card compact">
            <h2>{t("people.title")}</h2>
            {roomPeople.length > 0 ? (
              <ul className="room-people-list">
                {roomPeople.map((item) => (
                  <li key={item} className="room-people-item">
                    <i className="bi bi-person-fill" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t("people.none")}</p>
            )}
          </section>

          {canPromote ? (
            <section className="card compact">
              <h2>{t("admin.title")}</h2>
              <ul className="admin-list">
                {adminUsers.map((item) => (
                  <li key={item.id} className="row admin-row">
                    <span>{item.email} ({item.role})</span>
                    {item.role === "user" ? (
                      <button onClick={() => promote(item.id)}>{t("admin.promote")}</button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {canViewTelemetry ? (
            <section className="card compact">
              <h2>{t("telemetry.title")}</h2>
              <p className="muted">{t("telemetry.day")}: {telemetrySummary?.day || "-"}</p>
              <div className="stack">
                <div>ack_sent: {telemetrySummary?.metrics.ack_sent ?? 0}</div>
                <div>nack_sent: {telemetrySummary?.metrics.nack_sent ?? 0}</div>
                <div>chat_sent: {telemetrySummary?.metrics.chat_sent ?? 0}</div>
                <div>chat_idempotency_hit: {telemetrySummary?.metrics.chat_idempotency_hit ?? 0}</div>
                <div>telemetry_web_event: {telemetrySummary?.metrics.telemetry_web_event ?? 0}</div>
              </div>
              <button onClick={() => void loadTelemetrySummary()}>{t("telemetry.refresh")}</button>
            </section>
          ) : null}

          <section className="card compact">
            <h2>{t("events.title")}</h2>
            <div className="log">
              {eventLog.map((line, index) => (
                <div key={`${line}-${index}`}>{line}</div>
              ))}
            </div>
          </section>

          <section className="card compact">
            <div className="stack signaling-panel">
              <h2>{t("call.title")}</h2>
              <p className="muted">{t("call.status")}: {callStatus}{lastCallPeer ? ` (${lastCallPeer})` : ""}</p>
              <input
                value={callTargetUserId}
                onChange={(e) => setCallTargetUserId(e.target.value)}
                placeholder={t("call.targetPlaceholder")}
              />
              <textarea
                value={callSignalJson}
                onChange={(e) => setCallSignalJson(e.target.value)}
                rows={4}
                placeholder={t("call.payloadPlaceholder")}
              />
              <div className="row">
                <button type="button" onClick={() => sendCallSignal("call.offer")}>{t("call.offer")}</button>
                <button type="button" onClick={() => sendCallSignal("call.answer")}>{t("call.answer")}</button>
                <button type="button" onClick={() => sendCallSignal("call.ice")}>{t("call.ice")}</button>
                <button type="button" className="secondary" onClick={sendCallReject}>{t("call.reject")}</button>
                <button type="button" className="secondary" onClick={sendCallHangup}>{t("call.hangup")}</button>
              </div>
              <div className="log call-log">
                {callEventLog.map((line, index) => (
                  <div key={`${line}-${index}`}>{line}</div>
                ))}
              </div>
            </div>
          </section>
        </aside>
      </div>

      <ToastStack toasts={toasts} />

    </main>
  );
}
