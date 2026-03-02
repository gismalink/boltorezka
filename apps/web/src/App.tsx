import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { TooltipPortal } from "./TooltipPortal";
import {
  AuthController,
  ChatController,
  RealtimeClient,
  RoomAdminController,
  WsMessageController
} from "./services";
import type { CallStatus } from "./services";
import {
  AppHeader,
  ChatPanel,
  RoomsPanel,
  ServerProfileModal,
  ToastStack,
  UserDock
} from "./components";
import type { InputProfile, MediaDevicesState, VoiceSettingsPanel } from "./components";
import {
  useAutoRoomVoiceConnection,
  useAuthProfileFlow,
  useCollapsedCategories,
  useMediaDevicePreferences,
  useMicrophoneLevelMeter,
  usePopupOutsideClose,
  useRealtimeChatLifecycle,
  useRoomAdminActions,
  useRoomsDerived,
  useScreenWakeLock,
  useServerMenuAccessGuard,
  useVoiceCallRuntime,
  useVoiceRoomStateMaps
} from "./hooks";
import { detectInitialLang, LANGUAGE_OPTIONS, LOCALE_BY_LANG, TEXT, type Lang } from "./i18n";
import type {
  AudioQuality,
  ChannelAudioQualitySetting,
  Message,
  MessagesCursor,
  PresenceMember,
  Room,
  RoomKind,
  RoomsTreeResponse,
  TelemetrySummary,
  User
} from "./domain";

const MAX_CHAT_RETRIES = 3;
const TOAST_AUTO_DISMISS_MS = 4500;
const TOAST_ID_RANDOM_RANGE = 10000;
const TOAST_DUPLICATE_THROTTLE_MS = 12000;
const TOAST_MAX_VISIBLE = 4;

type ServerMenuTab = "users" | "events" | "telemetry" | "call" | "sound";
type MobileTab = "channels" | "chat" | "settings";

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
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [lastCallPeer, setLastCallPeer] = useState("");
  const [callEventLog, setCallEventLog] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string }>>([]);
  const [roomsPresenceBySlug, setRoomsPresenceBySlug] = useState<Record<string, string[]>>({});
  const [roomsPresenceDetailsBySlug, setRoomsPresenceDetailsBySlug] = useState<Record<string, PresenceMember[]>>({});
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
  const [editingRoomAudioQualitySetting, setEditingRoomAudioQualitySetting] = useState<ChannelAudioQualitySetting>("server_default");
  const [micMuted, setMicMuted] = useState(true);
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
  const [micTestLevel, setMicTestLevel] = useState(0);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [serverMenuTab, setServerMenuTab] = useState<ServerMenuTab>("events");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const [serverAudioQuality, setServerAudioQuality] = useState<AudioQuality>("standard");
  const [serverAudioQualitySaving, setServerAudioQualitySaving] = useState(false);
  const [realtimeReconnectNonce, setRealtimeReconnectNonce] = useState(0);
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
  const toastTimeoutsRef = useRef<Map<number, number>>(new Map());
  const toastLastShownAtRef = useRef<Map<string, number>>(new Map());

  const canCreateRooms = user?.role === "admin" || user?.role === "super_admin";
  const canPromote = user?.role === "super_admin";
  const canManageAudioQuality = canPromote;
  const canViewTelemetry = canPromote || canCreateRooms;
  const locale = LOCALE_BY_LANG[lang];
  const t = useMemo(() => {
    const dict = TEXT[lang];
    return (key: string) => dict[key] || key;
  }, [lang]);

  const { collapsedCategoryIds, toggleCategoryCollapsed } = useCollapsedCategories(roomsTree);

  const pushLog = useCallback((text: string) => {
    setEventLog((prev) => [`${new Date().toLocaleTimeString(locale)} ${text}`, ...prev].slice(0, 30));
  }, [locale]);

  const pushCallLog = useCallback((text: string) => {
    setCallEventLog((prev) => [`${new Date().toLocaleTimeString(locale)} ${text}`, ...prev].slice(0, 30));
  }, [locale]);

  const pushToast = useCallback((message: string) => {
    const normalized = String(message || "").trim();
    if (!normalized) {
      return;
    }

    const now = Date.now();
    const lastAt = toastLastShownAtRef.current.get(normalized) || 0;
    if (now - lastAt < TOAST_DUPLICATE_THROTTLE_MS) {
      return;
    }
    toastLastShownAtRef.current.set(normalized, now);

    const toast = {
      id: Date.now() + Math.floor(Math.random() * TOAST_ID_RANDOM_RANGE),
      message: normalized
    };

    setToasts((prev) => {
      if (prev.some((item) => item.message === normalized)) {
        return prev;
      }

      const next = [...prev, toast];
      if (next.length <= TOAST_MAX_VISIBLE) {
        return next;
      }

      const [oldest, ...rest] = next;
      const timeoutId = toastTimeoutsRef.current.get(oldest.id);
      if (typeof timeoutId === "number") {
        window.clearTimeout(timeoutId);
        toastTimeoutsRef.current.delete(oldest.id);
      }

      return rest;
    });

    const timeoutId = window.setTimeout(() => {
      toastTimeoutsRef.current.delete(toast.id);
      setToasts((prev) => prev.filter((item) => item.id !== toast.id));
    }, TOAST_AUTO_DISMISS_MS);
    toastTimeoutsRef.current.set(toast.id, timeoutId);
  }, []);

  useEffect(() => {
    return () => {
      toastTimeoutsRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      toastTimeoutsRef.current.clear();
      toastLastShownAtRef.current.clear();
    };
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

  const currentRoomVoiceTargets = useMemo(() => {
    const members = roomsPresenceDetailsBySlug[roomSlug] || [];
    const me = user?.id || "";
    return members.filter((member) => member.userId !== me);
  }, [roomsPresenceDetailsBySlug, roomSlug, user?.id]);

  const currentRoomAudioQualityOverride = useMemo(() => {
    const roomFromList = rooms.find((room) => room.slug === roomSlug);
    if (roomFromList) {
      return roomFromList.audio_quality_override ?? null;
    }

    const roomFromTree = (roomsTree?.categories || [])
      .flatMap((category) => category.channels || [])
      .find((room) => room.slug === roomSlug)
      ?? (roomsTree?.uncategorized || []).find((room) => room.slug === roomSlug)
      ?? null;

    return roomFromTree?.audio_quality_override ?? null;
  }, [rooms, roomsTree, roomSlug]);

  const effectiveAudioQuality = currentRoomAudioQualityOverride ?? serverAudioQuality;

  const {
    roomVoiceConnected,
    connectedPeerUserIds,
    connectingPeerUserIds,
    remoteMutedPeerUserIds,
    remoteSpeakingPeerUserIds,
    remoteAudioMutedPeerUserIds,
    connectRoom,
    disconnectRoom,
    handleIncomingSignal,
    handleIncomingTerminal,
    handleIncomingMicState,
    handleCallNack
  } = useVoiceCallRuntime({
    localUserId: user?.id || "",
    roomSlug,
    roomVoiceTargets: currentRoomVoiceTargets,
    selectedInputId,
    selectedOutputId,
    micMuted,
    micTestLevel,
    audioMuted,
    outputVolume,
    serverAudioQuality: effectiveAudioQuality,
    t,
    pushToast,
    pushCallLog,
    sendWsEvent,
    setCallStatus,
    setLastCallPeer
  });

  const {
    voiceMicStateByUserIdInCurrentRoom,
    voiceAudioOutputMutedByUserIdInCurrentRoom,
    voiceRtcStateByUserIdInCurrentRoom
  } = useVoiceRoomStateMaps({
    userId: user?.id || "",
    roomVoiceConnected,
    micMuted,
    micTestLevel,
    audioMuted,
    callStatus,
    roomVoiceTargetsCount: currentRoomVoiceTargets.length,
    connectingPeerUserIds,
    connectedPeerUserIds,
    remoteMutedPeerUserIds,
    remoteSpeakingPeerUserIds,
    remoteAudioMutedPeerUserIds
  });

  const authController = useMemo(
    () =>
      new AuthController({
        pushLog,
        setToken,
        setUser
      }),
    [pushLog]
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
    [pushLog, sendWsEvent]
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
  }, [token, canViewTelemetry, pushLog]);

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
    [pushLog, sendWsEvent, loadTelemetrySummary]
  );

  const {
    beginSso,
    logout,
    openUserSettings,
    saveMyProfile
  } = useAuthProfileFlow({
    authController,
    token,
    authMode,
    autoSsoAttemptedRef,
    profileNameDraft,
    t,
    setAuthMode,
    setAuthMenuOpen,
    setProfileMenuOpen,
    setAudioOutputMenuOpen,
    setVoiceSettingsOpen,
    setVoiceSettingsPanel,
    setUserSettingsTab,
    setUserSettingsOpen,
    setProfileSaving,
    setProfileStatusText,
    setUser,
    pushToast,
    onProfileSaved: () => setRealtimeReconnectNonce((value) => value + 1)
  });

  useEffect(() => {
    localStorage.setItem("boltorezka_lang", lang);
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 800px)");
    const apply = (matches: boolean) => {
      setIsMobileViewport(matches);
      if (!matches) {
        setMobileTab("chat");
      }
    };

    apply(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => apply(event.matches);
    mediaQuery.addEventListener("change", handler);
    return () => {
      mediaQuery.removeEventListener("change", handler);
    };
  }, []);

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
      setRoomsPresenceDetailsBySlug({});
      setTelemetrySummary(null);
      setServerAudioQuality("standard");
      setServerAudioQualitySaving(false);
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

    api.serverAudioQuality(token)
      .then((res) => setServerAudioQuality(res.audioQuality))
      .catch((error) => pushLog(`server audio quality failed: ${error.message}`));

    void roomAdminController.loadRoomTree(token);
  }, [token]);

  const { loadOlderMessages } = useRealtimeChatLifecycle({
    token,
    reconnectNonce: realtimeReconnectNonce,
    roomSlug,
    messages,
    messagesNextCursor,
    loadingOlderMessages,
    chatController,
    chatLogRef,
    roomSlugRef,
    realtimeClientRef,
    lastRoomSlugForScrollRef,
    lastMessageIdRef,
    setWsState,
    setMessages,
    setLastCallPeer,
    setCallStatus,
    setRoomSlug,
    setRoomsPresenceBySlug,
    setRoomsPresenceDetailsBySlug,
    pushLog,
    pushCallLog,
    pushToast,
    markMessageDelivery,
    onCallSignal: handleIncomingSignal,
    onCallTerminal: handleIncomingTerminal,
    onCallMicState: handleIncomingMicState,
    onCallNack: handleCallNack
  });

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
      setRoomsPresenceBySlug({});
      setRoomsPresenceDetailsBySlug({});
      return;
    }

    void loadTelemetrySummary();
  }, [wsState, loadTelemetrySummary]);

  const { refreshDevices, requestMediaAccess } = useMediaDevicePreferences({
    t,
    selectedInputId,
    selectedOutputId,
    micVolume,
    outputVolume,
    setInputDevices,
    setOutputDevices,
    setMediaDevicesState,
    setMediaDevicesHint,
    setSelectedInputId,
    setSelectedOutputId
  });

  useMicrophoneLevelMeter({
    running: Boolean(user),
    selectedInputId,
    t,
    pushToast,
    setLevel: setMicTestLevel
  });

  usePopupOutsideClose({
    isAnyPopupOpen: Boolean(
      profileMenuOpen
      || authMenuOpen
      || categoryPopupOpen
      || channelPopupOpen
      || channelSettingsPopupOpenId
      || categorySettingsPopupOpenId
      || audioOutputMenuOpen
      || voiceSettingsOpen
      || userSettingsOpen
    ),
    profileMenuRef,
    authMenuRef,
    categoryPopupRef,
    channelPopupRef,
    audioOutputAnchorRef,
    voiceSettingsAnchorRef,
    userSettingsRef,
    onCloseAll: () => {
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
  });

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    if (!roomSlug) {
      return;
    }

    const result = chatController.sendMessage(chatText, user, MAX_CHAT_RETRIES);
    if (result.sent) {
      setChatText("");
    }
  };

  const joinRoom = (slug: string) => {
    roomAdminController.joinRoom(slug);
    if (isMobileViewport) {
      setMobileTab("chat");
    }
  };

  const leaveRoom = () => {
    if (!roomSlug) {
      return;
    }

    disconnectRoom();
    void sendWsEvent("room.leave", {}, { maxRetries: 1 });
    setRoomSlug("");
    setMessages([]);
    setMessagesHasMore(false);
    setMessagesNextCursor(null);
  };

  const handleToggleMic = useCallback(() => {
    setMicMuted((value) => {
      const nextMuted = !value;
      if (!nextMuted) {
        setAudioMuted(false);
      }
      return nextMuted;
    });
  }, []);

  const promote = async (userId: string) => {
    if (!token || !canPromote) return;
    await roomAdminController.promote(token, userId);
  };

  const demote = async (userId: string) => {
    if (!token || !canPromote) return;
    await roomAdminController.demote(token, userId);
  };

  const setUserBan = async (userId: string, banned: boolean) => {
    if (!token || !canPromote) return;
    await roomAdminController.setBan(token, userId, banned);
  };

  const setServerAudioQualityValue = async (value: AudioQuality) => {
    setServerAudioQuality(value);

    if (!token || !canManageAudioQuality) {
      return;
    }

    setServerAudioQualitySaving(true);
    try {
      const response = await api.updateServerAudioQuality(token, value);
      setServerAudioQuality(response.audioQuality);
      pushLog(`server audio quality updated: ${response.audioQuality}`);
    } catch (error) {
      pushLog(`server audio quality update failed: ${(error as Error).message}`);
      try {
        const current = await api.serverAudioQuality(token);
        setServerAudioQuality(current.audioQuality);
      } catch {
        setServerAudioQuality("standard");
      }
    } finally {
      setServerAudioQualitySaving(false);
    }
  };

  const {
    uncategorizedRooms,
    allRooms,
    currentRoom
  } = useRoomsDerived({
    roomsTree,
    rooms,
    roomSlug
  });

  const {
    createRoom,
    createCategory,
    openCreateChannelPopup,
    openChannelSettingsPopup,
    openCategorySettingsPopup,
    saveCategorySettings,
    moveCategory,
    deleteCategory,
    saveChannelSettings,
    moveChannel,
    deleteChannel,
    clearChannelMessages
  } = useRoomAdminActions({
    token,
    canCreateRooms,
    canManageAudioQuality,
    roomSlug,
    allRooms,
    roomAdminController,
    newRoomSlug,
    newRoomTitle,
    newRoomKind,
    newRoomCategoryId,
    newCategorySlug,
    newCategoryTitle,
    editingCategoryTitle,
    categorySettingsPopupOpenId,
    editingRoomTitle,
    editingRoomKind,
    editingRoomCategoryId,
    editingRoomAudioQualitySetting,
    channelSettingsPopupOpenId,
    setNewRoomSlug,
    setNewRoomTitle,
    setChannelPopupOpen,
    setNewCategorySlug,
    setNewCategoryTitle,
    setCategoryPopupOpen,
    setNewRoomCategoryId,
    setEditingRoomTitle,
    setEditingRoomKind,
    setEditingRoomCategoryId,
    setEditingRoomAudioQualitySetting,
    setChannelSettingsPopupOpenId,
    setEditingCategoryTitle,
    setCategorySettingsPopupOpenId,
    setMessages,
    setMessagesHasMore,
    setMessagesNextCursor,
    joinRoom
  });

  const inputOptions = inputDevices.length > 0 ? inputDevices : [{ id: "default", label: t("device.systemDefault") }];
  const outputOptions = outputDevices.length > 0 ? outputDevices : [{ id: "default", label: t("device.systemDefault") }];
  const currentInputLabel = inputOptions.find((device) => device.id === selectedInputId)?.label ?? inputOptions[0]?.label ?? t("device.systemDefault");
  const inputProfileLabel = selectedInputProfile === "noise_reduction"
    ? t("settings.voiceIsolation")
    : selectedInputProfile === "studio"
      ? t("settings.studio")
      : t("settings.custom");

  const currentRoomSupportsRtc = currentRoom ? currentRoom.kind !== "text" : false;

  useAutoRoomVoiceConnection({
    currentRoomSupportsRtc,
    roomVoiceTargetsCount: currentRoomVoiceTargets.length,
    roomVoiceConnected,
    connectRoom,
    disconnectRoom
  });

  useServerMenuAccessGuard({
    serverMenuTab,
    canPromote,
    canViewTelemetry,
    canManageAudioQuality,
    setServerMenuTab
  });

  useScreenWakeLock(Boolean(user));

  const userDockNode = user ? (
    <UserDock
      t={t}
      user={user}
      currentRoomSupportsRtc={currentRoomSupportsRtc}
      currentRoomTitle={currentRoom?.title || ""}
      callStatus={callStatus}
      lastCallPeer={lastCallPeer}
      roomVoiceConnected={roomVoiceConnected}
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
      micTestLevel={micTestLevel}
      mediaDevicesState={mediaDevicesState}
      mediaDevicesHint={mediaDevicesHint}
      audioOutputAnchorRef={audioOutputAnchorRef}
      voiceSettingsAnchorRef={voiceSettingsAnchorRef}
      userSettingsRef={userSettingsRef}
      onToggleMic={handleToggleMic}
      onToggleAudio={() => {
        setAudioMuted((value) => {
          const nextMuted = !value;
          if (nextMuted) {
            setMicMuted(true);
          }
          return nextMuted;
        });
      }}
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
      onRefreshDevices={() => refreshDevices(true)}
      onRequestMediaAccess={requestMediaAccess}
      onSetMicVolume={setMicVolume}
      onSetOutputVolume={setOutputVolume}
      onDisconnectCall={leaveRoom}
      isMobileViewport={isMobileViewport}
      inlineSettingsMode={false}
    />
  ) : null;

  const userDockInlineSettingsNode = user ? (
    <UserDock
      t={t}
      user={user}
      currentRoomSupportsRtc={currentRoomSupportsRtc}
      currentRoomTitle={currentRoom?.title || ""}
      callStatus={callStatus}
      lastCallPeer={lastCallPeer}
      roomVoiceConnected={roomVoiceConnected}
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
      micTestLevel={micTestLevel}
      mediaDevicesState={mediaDevicesState}
      mediaDevicesHint={mediaDevicesHint}
      audioOutputAnchorRef={audioOutputAnchorRef}
      voiceSettingsAnchorRef={voiceSettingsAnchorRef}
      userSettingsRef={userSettingsRef}
      onToggleMic={handleToggleMic}
      onToggleAudio={() => {
        setAudioMuted((value) => {
          const nextMuted = !value;
          if (nextMuted) {
            setMicMuted(true);
          }
          return nextMuted;
        });
      }}
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
      onRefreshDevices={() => refreshDevices(true)}
      onRequestMediaAccess={requestMediaAccess}
      onSetMicVolume={setMicVolume}
      onSetOutputVolume={setOutputVolume}
      onDisconnectCall={leaveRoom}
      isMobileViewport={isMobileViewport}
      inlineSettingsMode
    />
  ) : null;

  return (
    <main className="app legacy-layout mx-auto grid h-[100dvh] max-h-[100dvh] w-full max-w-[1400px] grid-rows-[auto_1fr] gap-4 overflow-hidden p-4 min-[801px]:gap-6 min-[801px]:p-8">
      <AppHeader
        t={t}
        user={user}
        appMenuOpen={appMenuOpen}
        authMenuOpen={authMenuOpen}
        profileMenuOpen={profileMenuOpen}
        authMenuRef={authMenuRef}
        profileMenuRef={profileMenuRef}
        onToggleAppMenu={() => setAppMenuOpen((value) => !value)}
        onToggleAuthMenu={() => setAuthMenuOpen((value) => !value)}
        onToggleProfileMenu={() => setProfileMenuOpen((value) => !value)}
        onBeginSso={beginSso}
        onLogout={logout}
        onOpenUserSettings={() => openUserSettings("profile")}
      />
      <TooltipPortal />

      {mediaDevicesState === "denied" ? (
        <div className="mic-denied-banner" role="status" aria-live="polite">
          {t("mic.deniedBanner")}
        </div>
      ) : null}

      <div className={`workspace ${isMobileViewport ? "workspace-mobile" : ""} grid h-full min-h-0 items-stretch gap-4 min-[801px]:grid-cols-[320px_1fr] min-[801px]:gap-6`}>
        {(!isMobileViewport || mobileTab === "channels") ? (
          <aside className="leftcolumn flex min-h-0 flex-col gap-4 overflow-hidden min-[801px]:gap-6">
            <RoomsPanel
              t={t}
              canCreateRooms={canCreateRooms}
              canManageAudioQuality={canManageAudioQuality}
              roomsTree={roomsTree}
              roomSlug={roomSlug}
              currentUserId={user?.id || ""}
              currentUserName={user?.name || ""}
              liveRoomMembersBySlug={roomsPresenceBySlug}
              liveRoomMemberDetailsBySlug={roomsPresenceDetailsBySlug}
              voiceMicStateByUserIdInCurrentRoom={voiceMicStateByUserIdInCurrentRoom}
              voiceAudioOutputMutedByUserIdInCurrentRoom={voiceAudioOutputMutedByUserIdInCurrentRoom}
              voiceRtcStateByUserIdInCurrentRoom={voiceRtcStateByUserIdInCurrentRoom}
              collapsedCategoryIds={collapsedCategoryIds}
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
              editingRoomAudioQualitySetting={editingRoomAudioQualitySetting}
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
              onSetEditingRoomAudioQualitySetting={setEditingRoomAudioQualitySetting}
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
              onToggleCategoryCollapsed={toggleCategoryCollapsed}
              onJoinRoom={joinRoom}
            />

            {userDockNode}
          </aside>
        ) : null}

        {(!isMobileViewport || mobileTab === "chat") ? (
          <section className="middlecolumn flex min-h-0 flex-col gap-4 min-[801px]:gap-6">
            <ChatPanel
              t={t}
              locale={locale}
              roomSlug={roomSlug}
              roomTitle={currentRoom?.title || ""}
              messages={messages}
              currentUserId={user?.id || null}
              messagesHasMore={messagesHasMore}
              loadingOlderMessages={loadingOlderMessages}
              chatText={chatText}
              chatLogRef={chatLogRef}
              onLoadOlderMessages={() => void loadOlderMessages()}
              onSetChatText={setChatText}
              onSendMessage={sendMessage}
            />
          </section>
        ) : null}

        {isMobileViewport && user && mobileTab === "settings" ? (
          <aside className="leftcolumn mobile-settings-column flex min-h-0 flex-col gap-4 overflow-hidden min-[801px]:gap-6">
            {userDockInlineSettingsNode}
          </aside>
        ) : null}
      </div>

      {isMobileViewport ? (
        <nav className="mobile-tabbar grid grid-cols-3 gap-2" aria-label={t("mobile.tabsAria") }>
          <button
            type="button"
            className={`secondary mobile-tab-btn inline-flex items-center justify-center gap-2 ${mobileTab === "channels" ? "mobile-tab-btn-active" : ""}`}
            onClick={() => setMobileTab("channels")}
          >
            <i className="bi bi-hash" aria-hidden="true" />
            <span>{t("mobile.tabChannels")}</span>
          </button>
          <button
            type="button"
            className={`secondary mobile-tab-btn inline-flex items-center justify-center gap-2 ${mobileTab === "chat" ? "mobile-tab-btn-active" : ""}`}
            onClick={() => setMobileTab("chat")}
          >
            <i className="bi bi-chat-dots" aria-hidden="true" />
            <span>{t("mobile.tabChat")}</span>
          </button>
          <button
            type="button"
            className={`secondary mobile-tab-btn inline-flex items-center justify-center gap-2 ${mobileTab === "settings" ? "mobile-tab-btn-active" : ""}`}
            onClick={() => {
              setMobileTab("settings");
            }}
            disabled={!user}
          >
            <i className="bi bi-gear" aria-hidden="true" />
            <span>{t("mobile.tabSettings")}</span>
          </button>
        </nav>
      ) : null}

      <ServerProfileModal
        open={appMenuOpen}
        t={t}
        canPromote={canPromote}
        canViewTelemetry={canViewTelemetry}
        serverMenuTab={serverMenuTab}
        adminUsers={adminUsers}
        eventLog={eventLog}
        telemetrySummary={telemetrySummary}
        callStatus={callStatus}
        lastCallPeer={lastCallPeer}
        roomVoiceConnected={roomVoiceConnected}
        callEventLog={callEventLog}
        serverAudioQuality={serverAudioQuality}
        serverAudioQualitySaving={serverAudioQualitySaving}
        canManageAudioQuality={canManageAudioQuality}
        onClose={() => setAppMenuOpen(false)}
        onSetServerMenuTab={setServerMenuTab}
        onPromote={(userId) => void promote(userId)}
        onDemote={(userId) => void demote(userId)}
        onSetBan={(userId, banned) => void setUserBan(userId, banned)}
        onRefreshTelemetry={() => void loadTelemetrySummary()}
        onSetServerAudioQuality={(value) => void setServerAudioQualityValue(value)}
      />

      <ToastStack toasts={toasts} />

    </main>
  );
}
