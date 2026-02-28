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
  useAuthProfileFlow,
  useCollapsedCategories,
  useMediaDevicePreferences,
  useMicrophoneLevelMeter,
  usePopupOutsideClose,
  useRealtimeChatLifecycle,
  useRoomAdminActions,
  useRoomsDerived,
  useServerMenuAccessGuard,
  useVoiceCallRuntime
} from "./hooks";
import { detectInitialLang, LANGUAGE_OPTIONS, LOCALE_BY_LANG, TEXT, type Lang } from "./i18n";
import type {
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

type ServerMenuTab = "users" | "events" | "telemetry" | "call";
type MobileTab = "channels" | "chat" | "profile";

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
  const [micTestLevel, setMicTestLevel] = useState(0);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [serverMenuTab, setServerMenuTab] = useState<ServerMenuTab>("events");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
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

  const { collapsedCategoryIds, toggleCategoryCollapsed } = useCollapsedCategories(roomsTree);

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

  const currentRoomVoiceTargets = useMemo(() => {
    const members = roomsPresenceDetailsBySlug[roomSlug] || [];
    const me = user?.id || "";
    return members.filter((member) => member.userId !== me);
  }, [roomsPresenceDetailsBySlug, roomSlug, user?.id]);

  const {
    roomVoiceConnected,
    connectedPeerUserIds,
    connectRoom,
    disconnectRoom,
    handleIncomingSignal,
    handleIncomingTerminal
  } = useVoiceCallRuntime({
    roomSlug,
    roomVoiceTargets: currentRoomVoiceTargets,
    selectedInputId,
    selectedOutputId,
    micMuted,
    audioMuted,
    outputVolume,
    t,
    pushToast,
    pushCallLog,
    sendWsEvent,
    setCallStatus,
    setLastCallPeer
  });

  const voiceActiveUserIdsInCurrentRoom = useMemo(() => {
    const ids = new Set(connectedPeerUserIds);
    if (roomVoiceConnected && user?.id) {
      ids.add(user.id);
    }
    return Array.from(ids);
  }, [connectedPeerUserIds, roomVoiceConnected, user?.id]);

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
    pushToast
  });

  useEffect(() => {
    localStorage.setItem("boltorezka_lang", lang);
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 900px)");
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

  const { loadOlderMessages } = useRealtimeChatLifecycle({
    token,
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
    onCallTerminal: handleIncomingTerminal
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

  const promote = async (userId: string) => {
    if (!token || !canPromote) return;
    await roomAdminController.promote(token, userId);
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

  useEffect(() => {
    if (!currentRoomSupportsRtc) {
      if (roomVoiceConnected) {
        disconnectRoom();
      }
      return;
    }

    const hasOtherParticipants = currentRoomVoiceTargets.length > 0;

    if (hasOtherParticipants) {
      if (!roomVoiceConnected) {
        void connectRoom();
      }
      return;
    }

    if (roomVoiceConnected) {
      disconnectRoom();
    }
  }, [
    currentRoomSupportsRtc,
    currentRoomVoiceTargets.length,
    roomVoiceConnected,
    connectRoom,
    disconnectRoom
  ]);

  useServerMenuAccessGuard({
    serverMenuTab,
    canPromote,
    canViewTelemetry,
    setServerMenuTab
  });

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
      onRefreshDevices={() => refreshDevices(true)}
      onRequestMediaAccess={requestMediaAccess}
      onSetMicVolume={setMicVolume}
      onSetOutputVolume={setOutputVolume}
      onDisconnectCall={disconnectRoom}
    />
  ) : null;

  return (
    <main className="app legacy-layout">
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

      <div className={`workspace ${isMobileViewport ? "workspace-mobile" : ""}`}>
        {(!isMobileViewport || mobileTab === "channels") ? (
          <aside className="leftcolumn">
            <RoomsPanel
              t={t}
              canCreateRooms={canCreateRooms}
              roomsTree={roomsTree}
              roomSlug={roomSlug}
              currentUserId={user?.id || ""}
              currentUserName={user?.name || ""}
              liveRoomMembersBySlug={roomsPresenceBySlug}
              liveRoomMemberDetailsBySlug={roomsPresenceDetailsBySlug}
              voiceActiveUserIdsInCurrentRoom={voiceActiveUserIdsInCurrentRoom}
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
              onToggleCategoryCollapsed={toggleCategoryCollapsed}
              onJoinRoom={joinRoom}
            />

            {!isMobileViewport ? userDockNode : null}
          </aside>
        ) : null}

        {(!isMobileViewport || mobileTab === "chat") ? (
          <section className="middlecolumn">
            <ChatPanel
              t={t}
              locale={locale}
              roomSlug={roomSlug}
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

        {isMobileViewport && user && mobileTab === "profile" ? (
          <aside className="leftcolumn mobile-profile-column">
            {userDockNode}
          </aside>
        ) : null}
      </div>

      {isMobileViewport ? (
        <nav className="mobile-tabbar" aria-label={t("mobile.tabsAria") }>
          <button
            type="button"
            className={`secondary mobile-tab-btn ${mobileTab === "channels" ? "mobile-tab-btn-active" : ""}`}
            onClick={() => setMobileTab("channels")}
          >
            <i className="bi bi-hash" aria-hidden="true" />
            <span>{t("mobile.tabChannels")}</span>
          </button>
          <button
            type="button"
            className={`secondary mobile-tab-btn ${mobileTab === "chat" ? "mobile-tab-btn-active" : ""}`}
            onClick={() => setMobileTab("chat")}
          >
            <i className="bi bi-chat-dots" aria-hidden="true" />
            <span>{t("mobile.tabChat")}</span>
          </button>
          <button
            type="button"
            className={`secondary mobile-tab-btn ${mobileTab === "profile" ? "mobile-tab-btn-active" : ""}`}
            onClick={() => setMobileTab("profile")}
            disabled={!user}
          >
            <i className="bi bi-person" aria-hidden="true" />
            <span>{t("mobile.tabProfile")}</span>
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
        onClose={() => setAppMenuOpen(false)}
        onSetServerMenuTab={setServerMenuTab}
        onPromote={(userId) => void promote(userId)}
        onRefreshTelemetry={() => void loadTelemetrySummary()}
      />

      <ToastStack toasts={toasts} />

    </main>
  );
}
