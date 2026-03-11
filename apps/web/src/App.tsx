import { ClipboardEvent, FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  UserDock,
  VideoWindowsOverlay
} from "./components";
import type { InputProfile, MediaDevicesState } from "./components";
import {
  useAppUiState,
  useAdminUsersSync,
  useAutoRoomVoiceConnection,
  useAppEventLogs,
  useAuthProfileFlow,
  useBuildVersionSync,
  useSessionStateLifecycle,
  useMemberPreferencesSync,
  useTelemetryRefresh,
  useCollapsedCategories,
  useCurrentRoomSnapshot,
  useMediaDevicePreferences,
  useMicrophoneLevelMeter,
  useMicrophoneSelfMonitor,
  usePersistedClientSettings,
  usePopupOutsideClose,
  useRealtimeSoundEffects,
  useRealtimeChatLifecycle,
  useRealtimeConnectionReset,
  useRealtimeIncomingCallState,
  useScreenShareOrchestrator,
  useWsEventAcks,
  useRoomAdminActions,
  useRoomMediaCapabilities,
  useRoomPresenceActions,
  useServerModerationActions,
  useRoomsDerived,
  useScreenWakeLock,
  useServerVideoPreview,
  useServerSounds,
  useServerMenuAccessGuard,
  useToastQueue,
  useLivekitVoiceRuntime,
  useVoiceSignalingOrchestrator,
  useVoiceRoomStateMaps
} from "./hooks";
import { detectInitialLang, LANGUAGE_OPTIONS, LOCALE_BY_LANG, TEXT, type Lang } from "./i18n";
import type {
  AudioQuality,
  ChannelAudioQualitySetting,
  Message,
  MessagesCursor,
  PresenceMember,
  RoomMemberPreference,
  Room,
  RoomKind,
  RoomsTreeResponse,
  TelemetrySummary,
  User
} from "./domain";
import type { ServerVideoEffectType } from "./hooks/rtc/voiceCallTypes";
import type { RnnoiseSuppressionLevel } from "./hooks/rtc/rnnoiseAudioProcessor";

const MAX_CHAT_RETRIES = 3;
const DEFAULT_CHAT_IMAGE_DATA_URL_LENGTH = 28000;
const DEFAULT_CHAT_IMAGE_MAX_SIDE = 1200;
const DEFAULT_CHAT_IMAGE_QUALITY = 0.6;
const MESSAGE_EDIT_DELETE_WINDOW_MS = 10 * 60 * 1000;
const ROOM_SLUG_STORAGE_KEY = "boltorezka_room_slug";
const CLIENT_BUILD_VERSION = String(import.meta.env.VITE_APP_VERSION || "").trim();
const CLIENT_BUILD_DATE = String(import.meta.env.VITE_APP_BUILD_DATE || "").trim();
const CLIENT_BUILD_DATE_LABEL = CLIENT_BUILD_DATE ? `v.${CLIENT_BUILD_DATE}` : "";

type ServerVideoResolution = "160x120" | "320x240" | "640x480";

export function App() {
  const [token, setToken] = useState(localStorage.getItem("boltorezka_token") || "");
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState("loading");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsTree, setRoomsTree] = useState<RoomsTreeResponse | null>(null);
  const [roomSlug, setRoomSlug] = useState(() => {
    const stored = String(localStorage.getItem(ROOM_SLUG_STORAGE_KEY) || "").trim();
    return stored || "general";
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [messagesNextCursor, setMessagesNextCursor] = useState<MessagesCursor | null>(null);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [chatText, setChatText] = useState("");
  const [pendingChatImageDataUrl, setPendingChatImageDataUrl] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [lastCallPeer, setLastCallPeer] = useState("");
  const [roomsPresenceBySlug, setRoomsPresenceBySlug] = useState<Record<string, string[]>>({});
  const [roomsPresenceDetailsBySlug, setRoomsPresenceDetailsBySlug] = useState<Record<string, PresenceMember[]>>({});
  const [memberPreferencesByUserId, setMemberPreferencesByUserId] = useState<Record<string, RoomMemberPreference>>({});
  const [roomMediaTopologyBySlug, setRoomMediaTopologyBySlug] = useState<Record<string, "livekit">>({});
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
  const [micMuted, setMicMuted] = useState<boolean>(() => localStorage.getItem("boltorezka_mic_muted") !== "0");
  const [audioMuted, setAudioMuted] = useState<boolean>(() => localStorage.getItem("boltorezka_audio_muted") === "1");
  const [lang, setLang] = useState<Lang>(() => detectInitialLang());
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profileStatusText, setProfileStatusText] = useState("");
  const [rnnoiseRuntimeStatus, setRnnoiseRuntimeStatus] = useState<"inactive" | "active" | "unavailable" | "error">("inactive");
  const [profileSaving, setProfileSaving] = useState(false);
  const [inputDevices, setInputDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [outputDevices, setOutputDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [videoInputDevices, setVideoInputDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>(() => localStorage.getItem("boltorezka_selected_input_id") || "default");
  const [selectedOutputId, setSelectedOutputId] = useState<string>(() => localStorage.getItem("boltorezka_selected_output_id") || "default");
  const [selectedVideoInputId, setSelectedVideoInputId] = useState<string>(() => localStorage.getItem("boltorezka_selected_video_input_id") || "default");
  const [cameraEnabled, setCameraEnabled] = useState<boolean>(() => localStorage.getItem("boltorezka_camera_enabled") === "1");
  const [screenShareOwnerByRoomSlug, setScreenShareOwnerByRoomSlug] = useState<Record<string, { userId: string | null; userName: string | null }>>({});
  const [voiceCameraEnabledByUserIdInCurrentRoom, setVoiceCameraEnabledByUserIdInCurrentRoom] = useState<Record<string, boolean>>({});
  const [voiceInitialMicStateByUserIdInCurrentRoom, setVoiceInitialMicStateByUserIdInCurrentRoom] = useState<Record<string, "muted" | "silent" | "speaking">>({});
  const [voiceInitialAudioOutputMutedByUserIdInCurrentRoom, setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom] = useState<Record<string, boolean>>({});
  const [selectedInputProfile, setSelectedInputProfile] = useState<InputProfile>(() => {
    const value = String(localStorage.getItem("boltorezka_selected_input_profile") || "").trim();
    if (value === "noise_reduction" || value === "custom") {
      return value;
    }
    return "custom";
  });
  const [rnnoiseSuppressionLevel, setRnnoiseSuppressionLevel] = useState<RnnoiseSuppressionLevel>(() => {
    const value = String(localStorage.getItem("boltorezka_rnnoise_level") || "").trim();
    if (value === "soft" || value === "medium" || value === "strong") {
      return value;
    }
    return "medium";
  });
  const [selfMonitorEnabled, setSelfMonitorEnabled] = useState<boolean>(() => localStorage.getItem("boltorezka_self_monitor") === "1");
  const [mediaDevicesState, setMediaDevicesState] = useState<MediaDevicesState>("ready");
  const [mediaDevicesHint, setMediaDevicesHint] = useState("");
  const [micVolume, setMicVolume] = useState<number>(() => Number(localStorage.getItem("boltorezka_mic_volume") || 75));
  const [outputVolume, setOutputVolume] = useState<number>(() => {
    const parsed = Number(localStorage.getItem("boltorezka_output_volume"));
    if (!Number.isFinite(parsed)) {
      return 70;
    }
    return Math.max(0, Math.min(100, parsed));
  });
  const [micTestLevel, setMicTestLevel] = useState(0);
  const [serverAudioQuality, setServerAudioQuality] = useState<AudioQuality>("standard");
  const [serverAudioQualitySaving, setServerAudioQualitySaving] = useState(false);
  const [serverChatImagePolicy, setServerChatImagePolicy] = useState({
    maxDataUrlLength: DEFAULT_CHAT_IMAGE_DATA_URL_LENGTH,
    maxImageSide: DEFAULT_CHAT_IMAGE_MAX_SIDE,
    jpegQuality: DEFAULT_CHAT_IMAGE_QUALITY
  });
  const [serverVideoEffectType, setServerVideoEffectType] = useState<ServerVideoEffectType>(() => {
    const value = localStorage.getItem("boltorezka_server_video_effect_type");
    if (value === "none" || value === "pixel8" || value === "ascii") {
      return value;
    }
    return "none";
  });
  const [serverVideoResolution, setServerVideoResolution] = useState<ServerVideoResolution>(() => {
    const value = localStorage.getItem("boltorezka_server_video_resolution");
    if (value === "160x120" || value === "320x240" || value === "640x480") {
      return value;
    }
    return "320x240";
  });
  const [serverVideoFps, setServerVideoFps] = useState<10 | 15 | 24 | 30>(() => {
    const value = Number(localStorage.getItem("boltorezka_server_video_fps"));
    if (value === 10 || value === 15 || value === 24 || value === 30) {
      return value;
    }
    return 15;
  });
  const [serverVideoPixelFxStrength, setServerVideoPixelFxStrength] = useState(() => {
    const value = Number(localStorage.getItem("boltorezka_server_video_fx_strength"));
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 85;
  });
  const [serverVideoPixelFxPixelSize, setServerVideoPixelFxPixelSize] = useState(() => {
    const value = Number(localStorage.getItem("boltorezka_server_video_fx_pixel_size"));
    return Number.isFinite(value) ? Math.max(2, Math.min(10, value)) : 5;
  });
  const [serverVideoPixelFxGridThickness, setServerVideoPixelFxGridThickness] = useState(() => {
    const value = Number(localStorage.getItem("boltorezka_server_video_fx_grid_thickness"));
    return Number.isFinite(value) ? Math.max(1, Math.min(4, Math.round(value))) : 1;
  });
  const [serverVideoAsciiCellSize, setServerVideoAsciiCellSize] = useState(() => {
    const value = Number(localStorage.getItem("boltorezka_server_video_ascii_cell_size"));
    return Number.isFinite(value) ? Math.max(4, Math.min(16, Math.round(value))) : 8;
  });
  const [serverVideoAsciiContrast, setServerVideoAsciiContrast] = useState(() => {
    const value = Number(localStorage.getItem("boltorezka_server_video_ascii_contrast"));
    return Number.isFinite(value) ? Math.max(60, Math.min(200, Math.round(value))) : 120;
  });
  const [serverVideoAsciiColor, setServerVideoAsciiColor] = useState(() => {
    const value = String(localStorage.getItem("boltorezka_server_video_ascii_color") || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#eaffff";
  });
  const [serverVideoWindowMinWidth, setServerVideoWindowMinWidth] = useState(() => {
    const value = Number(localStorage.getItem("boltorezka_server_video_window_min_width"));
    return Number.isFinite(value) ? Math.max(80, Math.min(300, Math.round(value))) : 100;
  });
  const [serverVideoWindowMaxWidth, setServerVideoWindowMaxWidth] = useState(() => {
    const value = Number(localStorage.getItem("boltorezka_server_video_window_max_width"));
    return Number.isFinite(value) ? Math.max(120, Math.min(480, Math.round(value))) : 320;
  });
  const [realtimeReconnectNonce, setRealtimeReconnectNonce] = useState(0);
  const {
    audioOutputMenuOpen,
    setAudioOutputMenuOpen,
    voiceSettingsOpen,
    setVoiceSettingsOpen,
    userSettingsOpen,
    setUserSettingsOpen,
    userSettingsTab,
    setUserSettingsTab,
    voiceSettingsPanel,
    setVoiceSettingsPanel,
    authMenuOpen,
    setAuthMenuOpen,
    profileMenuOpen,
    setProfileMenuOpen,
    appMenuOpen,
    setAppMenuOpen,
    serverMenuTab,
    setServerMenuTab,
    isMobileViewport,
    setIsMobileViewport,
    mobileTab,
    setMobileTab,
    videoWindowsVisible,
    setVideoWindowsVisible
  } = useAppUiState();
  const { toasts, pushToast } = useToastQueue();
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
  const canManageAudioQuality = canPromote;
  const canViewTelemetry = canPromote || canCreateRooms;
  const locale = LOCALE_BY_LANG[lang];
  const t = useMemo(() => {
    const dict = TEXT[lang];
    return (key: string) => dict[key] || key;
  }, [lang]);
  const { eventLog, callEventLog, pushLog, pushCallLog } = useAppEventLogs(locale);

  const { collapsedCategoryIds, toggleCategoryCollapsed } = useCollapsedCategories(roomsTree);
  const {
    settings: serverSoundSettings,
    setMasterVolume: setServerSoundsMasterVolume,
    setEventEnabled: setServerSoundEnabled,
    playServerSound
  } = useServerSounds();

  useBuildVersionSync(CLIENT_BUILD_VERSION);

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

  const {
    sendWsEvent,
    sendWsEventAwaitAck,
    handleWsAck,
    handleWsNack
  } = useWsEventAcks({
    realtimeClientRef
  });

  const currentRoomVoiceTargets = useMemo(() => {
    const members = roomsPresenceDetailsBySlug[roomSlug] || [];
    const me = user?.id || "";
    return members.filter((member) => member.userId !== me);
  }, [roomsPresenceDetailsBySlug, roomSlug, user?.id]);

  const { currentRoom: currentRoomSnapshot, currentRoomKind, currentRoomAudioQualityOverride } = useCurrentRoomSnapshot({
    rooms,
    roomsTree,
    roomSlug
  });
  const effectiveAudioQuality = currentRoomAudioQualityOverride ?? serverAudioQuality;
  const roomMediaCapabilities = useRoomMediaCapabilities(currentRoomKind);
  const currentRoomSupportsRtc = roomMediaCapabilities.supportsVoice;
  const currentRoomSupportsVideo = roomMediaCapabilities.supportsCamera;
  const allowVideoStreaming = roomMediaCapabilities.supportsCamera;
  const currentRoomSupportsScreenShare = roomMediaCapabilities.supportsScreenShare;
  const memberVolumeByUserId = useMemo(() => {
    const volumes: Record<string, number> = {};
    Object.entries(memberPreferencesByUserId).forEach(([userId, preference]) => {
      volumes[userId] = Number(preference?.volume ?? 100);
    });
    return volumes;
  }, [memberPreferencesByUserId]);

  const handleRnnoiseStatusChange = useCallback((status: "inactive" | "active" | "unavailable" | "error") => {
    setRnnoiseRuntimeStatus(selectedInputProfile === "noise_reduction" ? status : "inactive");
  }, [selectedInputProfile]);

  const handleRnnoiseFallback = useCallback((reason: "unavailable" | "error") => {
    if (selectedInputProfile !== "noise_reduction") {
      return;
    }

    setSelectedInputProfile("custom");
    setRnnoiseRuntimeStatus("inactive");
    if (reason === "unavailable") {
      pushToast(t("settings.rnnFallbackUnavailable"));
    } else {
      pushToast(t("settings.rnnFallbackError"));
    }
  }, [pushToast, selectedInputProfile, t]);

  const livekitVoiceRuntime = useLivekitVoiceRuntime({
    token,
    localUserId: user?.id || "",
    roomSlug,
    allowVideoStreaming,
    videoStreamingEnabled: cameraEnabled,
    roomVoiceTargets: currentRoomVoiceTargets,
    selectedInputId,
    selectedInputProfile,
    rnnoiseSuppressionLevel,
    selectedOutputId,
    memberVolumeByUserId,
    selectedVideoInputId,
    micMuted,
    audioMuted,
    outputVolume,
    pushToast,
    pushCallLog,
    onRnnoiseStatusChange: handleRnnoiseStatusChange,
    onRnnoiseFallback: handleRnnoiseFallback,
    setCallStatus,
    setLastCallPeer
  });

  const {
    roomVoiceConnected,
    connectedPeerUserIds,
    connectingPeerUserIds,
    remoteMutedPeerUserIds,
    remoteSpeakingPeerUserIds,
    remoteAudioMutedPeerUserIds,
    voiceMediaStatusByPeerUserId,
    localVoiceMediaStatusSummary,
    localVideoStream,
    remoteVideoStreamsByUserId,
    localScreenShareStream,
    remoteScreenShareStreamsByUserId,
    isLocalScreenSharing,
    startLocalScreenShare,
    stopLocalScreenShare,
    connectRoom,
    disconnectRoom,
    handleIncomingMicState: _handleIncomingRtcMicState,
    handleIncomingVideoState: handleIncomingRtcVideoState,
    handleCallNack
  } = livekitVoiceRuntime;
  void _handleIncomingRtcMicState;

  const remoteVideoLabelsByUserId = useMemo(() => {
    const labels: Record<string, string> = {};
    currentRoomVoiceTargets.forEach((member) => {
      labels[member.userId] = member.userName || member.userId;
    });
    return labels;
  }, [currentRoomVoiceTargets]);

  const videoPolicyAudienceKey = useMemo(() => {
    return currentRoomVoiceTargets
      .map((member) => String(member.userId || "").trim())
      .filter((userId) => userId.length > 0)
      .sort()
      .join("|");
  }, [currentRoomVoiceTargets]);

  useEffect(() => {
    // Wait until room metadata is resolved; otherwise boot-time fallback to "text"
    // can incorrectly clear persisted camera state on page reload.
    if (!currentRoomSnapshot) {
      return;
    }

    if (!allowVideoStreaming) {
      setCameraEnabled(false);
      setVideoWindowsVisible(true);
    }
  }, [allowVideoStreaming, currentRoomSnapshot, setVideoWindowsVisible]);

  useEffect(() => {
    setVoiceCameraEnabledByUserIdInCurrentRoom({});
    setVoiceInitialMicStateByUserIdInCurrentRoom({});
    setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom({});
  }, [roomSlug]);

  usePersistedClientSettings({
    selectedInputProfile,
    rnnoiseSuppressionLevel,
    selfMonitorEnabled,
    micMuted,
    audioMuted,
    cameraEnabled,
    serverVideoEffectType,
    serverVideoResolution,
    serverVideoFps,
    serverVideoPixelFxStrength,
    serverVideoPixelFxPixelSize,
    serverVideoPixelFxGridThickness,
    serverVideoAsciiCellSize,
    serverVideoAsciiContrast,
    serverVideoAsciiColor,
    serverVideoWindowMinWidth,
    serverVideoWindowMaxWidth
  });

  useVoiceSignalingOrchestrator({
    roomVoiceConnected,
    currentRoomSupportsRtc,
    micMuted,
    micTestLevel,
    audioMuted,
    canManageAudioQuality,
    videoPolicyAudienceKey,
    serverVideoEffectType,
    serverVideoResolution,
    serverVideoFps,
    serverVideoPixelFxStrength,
    serverVideoPixelFxPixelSize,
    serverVideoPixelFxGridThickness,
    serverVideoAsciiCellSize,
    serverVideoAsciiContrast,
    serverVideoAsciiColor,
    serverVideoWindowMinWidth,
    serverVideoWindowMaxWidth,
    sendWsEvent
  });

  const serverVideoPreviewStream = useServerVideoPreview({
    appMenuOpen,
    serverMenuTab,
    canManageAudioQuality,
    selectedVideoInputId,
    serverVideoResolution,
    serverVideoFps,
    serverVideoEffectType,
    serverVideoPixelFxStrength,
    serverVideoPixelFxPixelSize,
    serverVideoPixelFxGridThickness,
    serverVideoAsciiCellSize,
    serverVideoAsciiContrast,
    serverVideoAsciiColor
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
    remoteAudioMutedPeerUserIds,
    initialMicStateByUserIdInCurrentRoom: voiceInitialMicStateByUserIdInCurrentRoom,
    initialAudioOutputMutedByUserIdInCurrentRoom: voiceInitialAudioOutputMutedByUserIdInCurrentRoom
  });

  const speakingVideoWindowIds = useMemo(() => {
    const ids = new Set<string>();

    remoteSpeakingPeerUserIds
      .map((userId) => String(userId || "").trim())
      .filter((userId) => userId.length > 0)
      .forEach((userId) => ids.add(userId));

    const localUserId = String(user?.id || "").trim();
    if (localUserId && voiceMicStateByUserIdInCurrentRoom[localUserId] === "speaking") {
      ids.add("local");
    }

    return Array.from(ids);
  }, [remoteSpeakingPeerUserIds, user?.id, voiceMicStateByUserIdInCurrentRoom]);

  const {
    currentRoomScreenShareOwner,
    isCurrentUserScreenShareOwner,
    canToggleScreenShare,
    activeScreenShare,
    handleIncomingScreenShareState,
    handleToggleScreenShare
  } = useScreenShareOrchestrator({
    hasSessionToken: Boolean(token),
    roomSlug,
    currentRoomKind,
    currentRoomSupportsScreenShare,
    roomVoiceConnected,
    userId: user?.id || "",
    userName: user?.name || "",
    t,
    pushToast,
    screenShareOwnerByRoomSlug,
    setScreenShareOwnerByRoomSlug,
    isLocalScreenSharing,
    localScreenShareStream,
    remoteScreenShareStreamsByUserId,
    remoteVideoLabelsByUserId,
    startLocalScreenShare,
    stopLocalScreenShare,
    sendWsEventAwaitAck
  });

  const effectiveVoiceCameraEnabledByUserIdInCurrentRoom = useMemo(() => {
    const map: Record<string, boolean> = {};
    const activeTargetIds = new Set(
      currentRoomVoiceTargets
        .map((member) => String(member.userId || "").trim())
        .filter((userId) => userId.length > 0)
    );

    // Keep camera status strictly scoped to current room participants and active RTC peers.
    activeTargetIds.forEach((userId) => {
      const hasRemoteStream = Object.prototype.hasOwnProperty.call(remoteVideoStreamsByUserId, userId);
      // LiveKit-only path: remote camera visibility follows subscribed remote video tracks.
      map[userId] = hasRemoteStream;
    });

    const localUserId = String(user?.id || "").trim();
    if (localUserId) {
      map[localUserId] = Boolean(roomVoiceConnected && allowVideoStreaming && cameraEnabled);
    }

    return map;
  }, [
    remoteVideoStreamsByUserId,
    currentRoomVoiceTargets,
    user?.id,
    roomVoiceConnected,
    allowVideoStreaming,
    cameraEnabled
  ]);

  const voiceMediaStatusSummaryByUserIdInCurrentRoom = useMemo(() => {
    const map = {
      ...voiceMediaStatusByPeerUserId
    };

    const localUserId = String(user?.id || "").trim();
    if (localUserId) {
      map[localUserId] = localVoiceMediaStatusSummary;
    }

    return map;
  }, [voiceMediaStatusByPeerUserId, user?.id, localVoiceMediaStatusSummary]);

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
        pushToast,
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
    [pushLog, pushToast, sendWsEvent]
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
    handleIncomingVideoState,
    handleIncomingMicState,
    handleIncomingInitialCallState,
    handleAudioQualityUpdated
  } = useRealtimeIncomingCallState({
    canManageAudioQuality,
    roomSlugRef,
    serverVideoWindowMinWidth,
    serverVideoWindowMaxWidth,
    handleIncomingRtcVideoState,
    setServerVideoEffectType,
    setServerVideoResolution,
    setServerVideoFps,
    setServerVideoPixelFxStrength,
    setServerVideoPixelFxPixelSize,
    setServerVideoPixelFxGridThickness,
    setServerVideoAsciiCellSize,
    setServerVideoAsciiContrast,
    setServerVideoAsciiColor,
    setServerVideoWindowMinWidth,
    setServerVideoWindowMaxWidth,
    setVoiceCameraEnabledByUserIdInCurrentRoom,
    setVoiceInitialMicStateByUserIdInCurrentRoom,
    setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom,
    setServerAudioQuality,
    setRooms,
    setRoomsTree
  });

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
    setEditingMessageId(null);
    setPendingChatImageDataUrl(null);
  }, [roomSlug]);

  useEffect(() => {
    localStorage.setItem(ROOM_SLUG_STORAGE_KEY, roomSlug);
  }, [roomSlug]);

  useSessionStateLifecycle({
    token,
    roomAdminController,
    pushLog,
    realtimeClientRef,
    defaultChatImageDataUrlLength: DEFAULT_CHAT_IMAGE_DATA_URL_LENGTH,
    defaultChatImageMaxSide: DEFAULT_CHAT_IMAGE_MAX_SIDE,
    defaultChatImageQuality: DEFAULT_CHAT_IMAGE_QUALITY,
    setToken,
    setUser,
    setRooms,
    setRoomsTree,
    setMessages,
    setChatText,
    setPendingChatImageDataUrl,
    setMessagesHasMore,
    setMessagesNextCursor,
    setLoadingOlderMessages,
    setAdminUsers,
    setRoomsPresenceBySlug,
    setRoomsPresenceDetailsBySlug,
    setRoomMediaTopologyBySlug,
    setVoiceCameraEnabledByUserIdInCurrentRoom,
    setVoiceInitialMicStateByUserIdInCurrentRoom,
    setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom,
    setTelemetrySummary,
    setServerAudioQuality,
    setServerAudioQualitySaving,
    setServerChatImagePolicy
  });

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
    setRoomSlug,
    onRoomMediaTopology: ({ roomSlug: nextRoomSlug, mediaTopology }) => {
      setRoomMediaTopologyBySlug((prev) => {
        if (prev[nextRoomSlug] === mediaTopology) {
          return prev;
        }

        return {
          ...prev,
          [nextRoomSlug]: mediaTopology
        };
      });
    },
    setRoomsPresenceBySlug,
    setRoomsPresenceDetailsBySlug,
    pushLog,
    pushCallLog,
    pushToast,
    markMessageDelivery,
    onCallMicState: handleIncomingMicState,
    onCallVideoState: handleIncomingVideoState,
    onCallInitialState: handleIncomingInitialCallState,
    onCallNack: handleCallNack,
    onAudioQualityUpdated: handleAudioQualityUpdated,
    onAck: handleWsAck,
    onNack: handleWsNack,
    onScreenShareState: handleIncomingScreenShareState,
    onChatCleared: (payload) => {
      const targetRoomSlug = String(payload.roomSlug || "").trim();
      const activeRoomSlug = roomSlugRef.current;
      if (!targetRoomSlug || targetRoomSlug !== activeRoomSlug) {
        return;
      }

      setMessages([]);
      setMessagesHasMore(false);
      setMessagesNextCursor(null);

      const deletedCount = Number(payload.deletedCount || 0);
      pushLog(`channel chat cleared by admin (${Number.isFinite(deletedCount) ? deletedCount : 0})`);
    }
  });

  useAdminUsersSync({
    token,
    canPromote,
    pushLog,
    setAdminUsers
  });

  useTelemetryRefresh({
    token,
    canViewTelemetry,
    wsState,
    setTelemetrySummary,
    loadTelemetrySummary
  });

  useRealtimeConnectionReset({
    wsState,
    setRoomsPresenceBySlug,
    setRoomsPresenceDetailsBySlug,
    setRoomMediaTopologyBySlug,
    setScreenShareOwnerByRoomSlug,
    setVoiceInitialMicStateByUserIdInCurrentRoom,
    setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom
  });

  useRealtimeSoundEffects({
    wsState,
    roomsPresenceDetailsBySlug,
    roomSlug,
    userId: user?.id,
    messages,
    playServerSound
  });

  useEffect(() => {
    if (!roomSlug) {
      return;
    }

    const roomTopology = roomMediaTopologyBySlug[roomSlug];
    if (roomTopology === "livekit") {
      pushCallLog(`media topology for ${roomSlug}: ${roomTopology}`);
    }
  }, [roomSlug, roomMediaTopologyBySlug, pushCallLog]);

  const { refreshDevices, requestMediaAccess, requestVideoAccess } = useMediaDevicePreferences({
    t,
    selectedInputId,
    selectedOutputId,
    selectedVideoInputId,
    micVolume,
    outputVolume,
    setInputDevices,
    setOutputDevices,
    setVideoInputDevices,
    setMediaDevicesState,
    setMediaDevicesHint,
    setSelectedInputId,
    setSelectedOutputId,
    setSelectedVideoInputId
  });

  const shouldRunMicrophoneMeter = Boolean(user)
    && (
      roomVoiceConnected
      || voiceSettingsOpen
      || voiceSettingsPanel === "input_device"
      || (userSettingsOpen && userSettingsTab === "sound")
    );

  useMicrophoneLevelMeter({
    running: shouldRunMicrophoneMeter,
    selectedInputId,
    t,
    pushToast,
    setLevel: setMicTestLevel
  });

  useMicrophoneSelfMonitor({
    enabled: selfMonitorEnabled,
    selectedInputId,
    selectedInputProfile,
    rnnoiseSuppressionLevel,
    micVolume,
    t,
    pushToast
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

  const canManageOwnMessage = useCallback((message: Message) => {
    if (!user || message.user_id !== user.id) {
      return false;
    }

    const createdAtTs = Number(new Date(message.created_at));
    if (!Number.isFinite(createdAtTs)) {
      return false;
    }

    return Date.now() - createdAtTs <= MESSAGE_EDIT_DELETE_WINDOW_MS;
  }, [user]);

  const compressImageToDataUrl = useCallback((file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("read_failed"));
      reader.onload = () => {
        const source = String(reader.result || "");
        if (!source.startsWith("data:image/")) {
          reject(new Error("invalid_image"));
          return;
        }

        const image = new Image();
        image.onerror = () => reject(new Error("decode_failed"));
        image.onload = () => {
          const originalWidth = Math.max(1, Math.round(image.naturalWidth || 1));
          const originalHeight = Math.max(1, Math.round(image.naturalHeight || 1));
          const maxSide = Math.max(originalWidth, originalHeight);
          const scale = maxSide > serverChatImagePolicy.maxImageSide
            ? serverChatImagePolicy.maxImageSide / maxSide
            : 1;
          const targetWidth = Math.max(1, Math.round(originalWidth * scale));
          const targetHeight = Math.max(1, Math.round(originalHeight * scale));
          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("canvas_context_unavailable"));
            return;
          }

          context.drawImage(image, 0, 0, targetWidth, targetHeight);
          const compressed = canvas.toDataURL("image/jpeg", serverChatImagePolicy.jpegQuality);
          resolve(compressed);
        };
        image.src = source;
      };

      reader.readAsDataURL(file);
    });
  }, [serverChatImagePolicy.jpegQuality, serverChatImagePolicy.maxImageSide]);

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    if (!roomSlug) {
      return;
    }

    if (editingMessageId) {
      const nextText = chatText.trim();
      if (!nextText) {
        return;
      }

      const requestId = sendWsEvent(
        "chat.edit",
        {
          messageId: editingMessageId,
          text: nextText
        },
        { withIdempotency: true, maxRetries: MAX_CHAT_RETRIES }
      );

      if (!requestId) {
        pushToast(t("toast.serverError"));
        return;
      }

      setChatText("");
      setEditingMessageId(null);
      return;
    }

    const baseText = chatText.trim();
    const imageMarkdown = pendingChatImageDataUrl ? `![скриншот](${pendingChatImageDataUrl})` : "";
    const outgoingText = [baseText, imageMarkdown].filter(Boolean).join("\n");
    const result = chatController.sendMessage(outgoingText, user, MAX_CHAT_RETRIES);
    if (result.sent) {
      setChatText("");
      setPendingChatImageDataUrl(null);
    }
  };

  const handleChatPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    if (!roomSlug) {
      return;
    }

    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) {
      return;
    }

    const file = imageItem.getAsFile();
    if (!file) {
      return;
    }

    event.preventDefault();
    void (async () => {
      try {
        const dataUrl = await compressImageToDataUrl(file);
        const markdown = `![скриншот](${dataUrl})`;

        if (markdown.length > serverChatImagePolicy.maxDataUrlLength) {
          pushToast(t("chat.imageTooLarge"));
          return;
        }

        setPendingChatImageDataUrl(dataUrl);
      } catch {
        pushToast(t("chat.imageTooLarge"));
      }
    })();
  };

  const handleChatInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "ArrowUp") {
      return;
    }

    const target = event.currentTarget;
    const selectionStart = typeof target.selectionStart === "number" ? target.selectionStart : 0;
    const selectionEnd = typeof target.selectionEnd === "number" ? target.selectionEnd : 0;
    if (selectionStart !== 0 || selectionEnd !== 0) {
      return;
    }

    if (chatText.trim().length > 0) {
      return;
    }

    const lastOwn = [...messages]
      .reverse()
      .find((message) => message.user_id === user?.id && canManageOwnMessage(message));

    if (!lastOwn) {
      return;
    }

    event.preventDefault();
    setEditingMessageId(lastOwn.id);
    setChatText(lastOwn.text);
  };

  const startEditingMessage = (messageId: string) => {
    const targetMessage = messages.find((item) => item.id === messageId);
    if (!targetMessage || !canManageOwnMessage(targetMessage)) {
      return;
    }

    setEditingMessageId(messageId);
    setChatText(targetMessage.text);
  };

  const deleteOwnMessage = (messageId: string) => {
    const targetMessage = messages.find((item) => item.id === messageId);
    if (!targetMessage || !canManageOwnMessage(targetMessage)) {
      return;
    }

    const requestId = sendWsEvent(
      "chat.delete",
      { messageId },
      { withIdempotency: true, maxRetries: 1 }
    );

    if (!requestId) {
      pushToast(t("toast.serverError"));
    }
  };

  const {
    joinRoom,
    leaveRoom,
    kickRoomMember,
    moveRoomMember
  } = useRoomPresenceActions({
    roomSlug,
    canCreateRooms,
    roomAdminController,
    disconnectRoom,
    sendWsEvent,
    pushToast,
    pushLog,
    t,
    setRoomSlug,
    setMessages,
    setMessagesHasMore,
    setMessagesNextCursor
  });

  const handleToggleMic = useCallback(() => {
    setMicMuted((value) => {
      const nextMuted = !value;
      if (!nextMuted) {
        setAudioMuted(false);
      }
      return nextMuted;
    });
  }, []);

  const handleToggleAudio = useCallback(() => {
    setAudioMuted((value) => {
      const nextMuted = !value;
      if (nextMuted) {
        setMicMuted(true);
      }
      return nextMuted;
    });
  }, []);

  const saveMemberPreference = useCallback(async (targetUserId: string, input: { volume: number; note: string }) => {
    if (!token || !targetUserId) {
      return;
    }

    const nextPreference: RoomMemberPreference = {
      targetUserId,
      volume: Math.max(0, Math.min(100, Math.round(Number(input.volume) || 0))),
      note: String(input.note || "").trim().slice(0, 32),
      updatedAt: new Date().toISOString()
    };

    setMemberPreferencesByUserId((prev) => ({
      ...prev,
      [targetUserId]: nextPreference
    }));

    try {
      const response = await api.upsertMemberPreference(token, targetUserId, {
        volume: nextPreference.volume,
        note: nextPreference.note
      });

      setMemberPreferencesByUserId((prev) => ({
        ...prev,
        [targetUserId]: response.preference
      }));
    } catch (error) {
      pushLog(`member preference save failed: ${(error as Error).message}`);
      pushToast(t("toast.serverError"));
    }
  }, [pushLog, pushToast, t, token]);

  useMemberPreferencesSync({
    token,
    currentUserId: user?.id || "",
    roomsPresenceDetailsBySlug,
    setMemberPreferencesByUserId,
    pushLog
  });

  const {
    promote,
    demote,
    setUserBan,
    setServerAudioQualityValue
  } = useServerModerationActions({
    token,
    canPromote,
    canManageAudioQuality,
    roomAdminController,
    pushLog,
    setServerAudioQuality,
    setServerAudioQualitySaving
  });

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
  const videoInputOptions = videoInputDevices.length > 0 ? videoInputDevices : [{ id: "default", label: t("video.systemCamera") }];
  const currentInputLabel = inputOptions.find((device) => device.id === selectedInputId)?.label ?? inputOptions[0]?.label ?? t("device.systemDefault");
  const inputProfileLabel = selectedInputProfile === "noise_reduction"
    ? t("settings.voiceIsolation")
    : selectedInputProfile === "studio"
      ? t("settings.studio")
      : t("settings.custom");
  const noiseSuppressionEnabled = selectedInputProfile === "noise_reduction";

  const handleToggleNoiseSuppression = useCallback(() => {
    setSelectedInputProfile((current) => {
      const next = current === "noise_reduction" ? "custom" : "noise_reduction";
      if (next !== "noise_reduction") {
        setRnnoiseRuntimeStatus("inactive");
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (selectedInputProfile !== "noise_reduction") {
      setRnnoiseRuntimeStatus("inactive");
    }
  }, [selectedInputProfile]);

  useEffect(() => {
    if (!roomSlug) {
      return;
    }

    if (allRooms.length === 0) {
      return;
    }

    const roomExists = allRooms.some((room) => room.slug === roomSlug);
    if (!roomExists) {
      setRoomSlug("general");
    }
  }, [allRooms, roomSlug]);

  useAutoRoomVoiceConnection({
    roomMediaResolved: Boolean(currentRoomSnapshot),
    currentRoomSupportsRtc,
    roomVoiceTargetsCount: currentRoomVoiceTargets.length,
    roomVoiceConnected,
    // Keep established LiveKit sessions alive across short presence/ws flaps.
    keepConnectedWithoutTargets: (allowVideoStreaming && cameraEnabled) || roomVoiceConnected,
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

  useScreenWakeLock(Boolean(user && roomSlug && currentRoomSupportsRtc && roomVoiceConnected));

  const handleToggleCamera = useCallback(() => {
    if (allowVideoStreaming && !cameraEnabled) {
      requestVideoAccess();
    }
    setCameraEnabled((value) => !value);
  }, [allowVideoStreaming, cameraEnabled, requestVideoAccess]);

  const handleToggleScreenShareClick = useCallback(() => {
    void handleToggleScreenShare();
  }, [handleToggleScreenShare]);

  const handleToggleVoiceSettings = useCallback(() => {
    setAudioOutputMenuOpen(false);
    setVoiceSettingsPanel(null);
    setVoiceSettingsOpen((value) => !value);
  }, [setAudioOutputMenuOpen, setVoiceSettingsOpen, setVoiceSettingsPanel]);

  const handleToggleAudioOutput = useCallback(() => {
    setVoiceSettingsOpen(false);
    setVoiceSettingsPanel(null);
    setAudioOutputMenuOpen((value) => !value);
  }, [setAudioOutputMenuOpen, setVoiceSettingsOpen, setVoiceSettingsPanel]);

  const userDockSharedProps = user ? {
    t,
    user,
    currentRoomSupportsRtc,
    currentRoomSupportsVideo,
    currentRoomTitle: currentRoom?.title || "",
    callStatus,
    localVoiceMediaStatusSummary,
    lastCallPeer,
    roomVoiceConnected,
    screenShareActive: Boolean(currentRoomScreenShareOwner.userId),
    screenShareOwnedByCurrentUser: isCurrentUserScreenShareOwner,
    canStartScreenShare: canToggleScreenShare,
    noiseSuppressionEnabled,
    rnnoiseSuppressionLevel,
    rnnoiseRuntimeStatus,
    cameraEnabled,
    micMuted,
    audioMuted,
    audioOutputMenuOpen,
    voiceSettingsOpen,
    userSettingsOpen,
    userSettingsTab,
    voiceSettingsPanel,
    profileUsername: String(user.username || user.email.split("@")[0] || ""),
    profileNameDraft,
    profileEmail: user.email,
    profileSaving,
    profileStatusText,
    selectedLang: lang,
    languageOptions: LANGUAGE_OPTIONS,
    inputOptions,
    outputOptions,
    videoInputOptions,
    selectedInputId,
    selectedOutputId,
    selectedVideoInputId,
    selectedInputProfile,
    inputProfileLabel,
    currentInputLabel,
    micVolume,
    outputVolume,
    serverSoundsMasterVolume: serverSoundSettings.masterVolume,
    serverSoundsEnabled: serverSoundSettings.enabledByEvent,
    micTestLevel,
    mediaDevicesState,
    mediaDevicesHint,
    audioOutputAnchorRef,
    voiceSettingsAnchorRef,
    userSettingsRef,
    onToggleMic: handleToggleMic,
    onToggleAudio: handleToggleAudio,
    onToggleCamera: handleToggleCamera,
    onToggleScreenShare: handleToggleScreenShareClick,
    onToggleNoiseSuppression: handleToggleNoiseSuppression,
    onSetRnnoiseSuppressionLevel: setRnnoiseSuppressionLevel,
    selfMonitorEnabled,
    onToggleSelfMonitor: () => setSelfMonitorEnabled((value) => !value),
    onRequestVideoAccess: requestVideoAccess,
    onToggleVoiceSettings: handleToggleVoiceSettings,
    onToggleAudioOutput: handleToggleAudioOutput,
    onOpenUserSettings: openUserSettings,
    onSetVoiceSettingsOpen: setVoiceSettingsOpen,
    onSetAudioOutputMenuOpen: setAudioOutputMenuOpen,
    onSetVoiceSettingsPanel: setVoiceSettingsPanel,
    onSetUserSettingsOpen: setUserSettingsOpen,
    onSetUserSettingsTab: setUserSettingsTab,
    onSetProfileNameDraft: setProfileNameDraft,
    onSetSelectedLang: setLang,
    onSaveProfile: saveMyProfile,
    onSetSelectedInputId: setSelectedInputId,
    onSetSelectedOutputId: setSelectedOutputId,
    onSetSelectedVideoInputId: setSelectedVideoInputId,
    onSetSelectedInputProfile: setSelectedInputProfile,
    onRefreshDevices: () => refreshDevices(true),
    onRequestMediaAccess: requestMediaAccess,
    onSetMicVolume: setMicVolume,
    onSetOutputVolume: setOutputVolume,
    onSetServerSoundsMasterVolume: setServerSoundsMasterVolume,
    onSetServerSoundEnabled: setServerSoundEnabled,
    onPreviewServerSound: playServerSound,
    onDisconnectCall: leaveRoom,
    isMobileViewport
  } : null;

  const userDockNode = userDockSharedProps ? <UserDock {...userDockSharedProps} inlineSettingsMode={false} /> : null;

  const userDockInlineSettingsNode = userDockSharedProps ? <UserDock {...userDockSharedProps} inlineSettingsMode /> : null;

  return (
    <main className="app legacy-layout mx-auto grid h-[100dvh] max-h-[100dvh] w-full max-w-[1400px] grid-rows-[auto_1fr] gap-4 overflow-hidden p-4 desktop:gap-6 desktop:p-8">
      <AppHeader
        t={t}
        user={user}
        buildDateLabel={CLIENT_BUILD_DATE_LABEL}
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
          <span>{t("mic.deniedBanner")}</span>
          <button type="button" className="secondary" onClick={requestMediaAccess}>
            {t("settings.requestMediaAccess")}
          </button>
        </div>
      ) : null}

      <div className={`workspace ${isMobileViewport ? "workspace-mobile" : ""} grid h-full min-h-0 items-stretch gap-4 desktop:grid-cols-[320px_1fr] desktop:gap-6`}>
        {(!isMobileViewport || mobileTab === "channels") ? (
          <aside className="leftcolumn flex min-h-0 flex-col gap-4 overflow-hidden desktop:gap-6">
            <RoomsPanel
              t={t}
              canCreateRooms={canCreateRooms}
              canKickMembers={canCreateRooms}
              canManageAudioQuality={canManageAudioQuality}
              roomsTree={roomsTree}
              roomSlug={roomSlug}
              roomMediaTopologyBySlug={roomMediaTopologyBySlug}
              currentUserId={user?.id || ""}
              liveRoomMembersBySlug={roomsPresenceBySlug}
              liveRoomMemberDetailsBySlug={roomsPresenceDetailsBySlug}
              memberPreferencesByUserId={memberPreferencesByUserId}
              voiceMicStateByUserIdInCurrentRoom={voiceMicStateByUserIdInCurrentRoom}
              voiceCameraEnabledByUserIdInCurrentRoom={effectiveVoiceCameraEnabledByUserIdInCurrentRoom}
              voiceAudioOutputMutedByUserIdInCurrentRoom={voiceAudioOutputMutedByUserIdInCurrentRoom}
              voiceRtcStateByUserIdInCurrentRoom={voiceRtcStateByUserIdInCurrentRoom}
              voiceMediaStatusSummaryByUserIdInCurrentRoom={voiceMediaStatusSummaryByUserIdInCurrentRoom}
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
              onKickRoomMember={kickRoomMember}
              onMoveRoomMember={moveRoomMember}
              onSaveMemberPreference={saveMemberPreference}
            />

            {userDockNode}
          </aside>
        ) : null}

        {(!isMobileViewport || mobileTab === "chat") ? (
          <section className="middlecolumn flex min-h-0 flex-col gap-4 desktop:gap-6">
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
              composePreviewImageUrl={pendingChatImageDataUrl}
              chatLogRef={chatLogRef}
              onLoadOlderMessages={() => void loadOlderMessages()}
              onSetChatText={setChatText}
              onChatPaste={handleChatPaste}
              onChatInputKeyDown={handleChatInputKeyDown}
              onSendMessage={sendMessage}
              editingMessageId={editingMessageId}
              showVideoToggle={currentRoomSupportsRtc}
              videoWindowsVisible={videoWindowsVisible}
              onToggleVideoWindows={() => setVideoWindowsVisible((prev) => !prev)}
              onCancelEdit={() => {
                setEditingMessageId(null);
                setChatText("");
              }}
              onEditMessage={startEditingMessage}
              onDeleteMessage={deleteOwnMessage}
            />
          </section>
        ) : null}

        <VideoWindowsOverlay
          t={t}
          currentUserId={user?.id || ""}
          localUserLabel={user?.name || t("video.you")}
          localCameraEnabled={allowVideoStreaming && cameraEnabled}
          localVideoStream={localVideoStream}
          remoteVideoStreamsByUserId={remoteVideoStreamsByUserId}
          remoteCameraEnabledByUserId={effectiveVoiceCameraEnabledByUserIdInCurrentRoom}
          remoteLabelsByUserId={remoteVideoLabelsByUserId}
          screenShareStream={activeScreenShare?.stream || null}
          screenShareOwnerLabel={activeScreenShare?.ownerLabel || ""}
          screenShareOwnerUserId={activeScreenShare?.ownerUserId || ""}
          screenShareActive={Boolean(activeScreenShare?.stream)}
          minWidth={Math.min(serverVideoWindowMinWidth, serverVideoWindowMaxWidth)}
          maxWidth={Math.max(serverVideoWindowMinWidth, serverVideoWindowMaxWidth)}
          visible={currentRoomSupportsRtc && videoWindowsVisible}
          speakingWindowIds={speakingVideoWindowIds}
        />

        {isMobileViewport && user && mobileTab === "settings" ? (
          <aside className="leftcolumn mobile-settings-column flex min-h-0 flex-col gap-4 overflow-hidden desktop:gap-6">
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
        serverChatImagePolicy={serverChatImagePolicy}
        serverVideoEffectType={serverVideoEffectType}
        serverVideoResolution={serverVideoResolution}
        serverVideoFps={serverVideoFps}
        serverVideoPixelFxStrength={serverVideoPixelFxStrength}
        serverVideoPixelFxPixelSize={serverVideoPixelFxPixelSize}
        serverVideoPixelFxGridThickness={serverVideoPixelFxGridThickness}
        serverVideoAsciiCellSize={serverVideoAsciiCellSize}
        serverVideoAsciiContrast={serverVideoAsciiContrast}
        serverVideoAsciiColor={serverVideoAsciiColor}
        serverVideoWindowMinWidth={Math.min(serverVideoWindowMinWidth, serverVideoWindowMaxWidth)}
        serverVideoWindowMaxWidth={Math.max(serverVideoWindowMinWidth, serverVideoWindowMaxWidth)}
        serverVideoPreviewStream={serverVideoPreviewStream}
        onClose={() => setAppMenuOpen(false)}
        onSetServerMenuTab={setServerMenuTab}
        onPromote={(userId) => void promote(userId)}
        onDemote={(userId) => void demote(userId)}
        onSetBan={(userId, banned) => void setUserBan(userId, banned)}
        onRefreshTelemetry={() => void loadTelemetrySummary()}
        onSetServerAudioQuality={(value) => void setServerAudioQualityValue(value)}
        onSetServerVideoEffectType={setServerVideoEffectType}
        onSetServerVideoResolution={setServerVideoResolution}
        onSetServerVideoFps={setServerVideoFps}
        onSetServerVideoPixelFxStrength={setServerVideoPixelFxStrength}
        onSetServerVideoPixelFxPixelSize={setServerVideoPixelFxPixelSize}
        onSetServerVideoPixelFxGridThickness={setServerVideoPixelFxGridThickness}
        onSetServerVideoAsciiCellSize={setServerVideoAsciiCellSize}
        onSetServerVideoAsciiContrast={setServerVideoAsciiContrast}
        onSetServerVideoAsciiColor={setServerVideoAsciiColor}
        onSetServerVideoWindowMinWidth={(value) => {
          const nextMin = Math.max(80, Math.min(300, Math.round(value)));
          setServerVideoWindowMinWidth(nextMin);
          setServerVideoWindowMaxWidth((prev) => Math.max(Math.max(120, Math.min(480, Math.round(prev))), nextMin));
        }}
        onSetServerVideoWindowMaxWidth={(value) => {
          const nextMax = Math.max(120, Math.min(480, Math.round(value)));
          setServerVideoWindowMaxWidth(nextMax);
          setServerVideoWindowMinWidth((prev) => Math.min(Math.max(80, Math.min(300, Math.round(prev))), nextMax));
        }}
      />

      <ToastStack toasts={toasts} />

    </main>
  );
}
