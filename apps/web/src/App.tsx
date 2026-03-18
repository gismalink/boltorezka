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
  AccessStateGate,
  AppHeader,
  AppWorkspacePanels,
  AppUpdatedOverlay,
  DesktopBrowserCompletionGate,
  DesktopUpdateBanner,
  FirstRunIntroOverlay,
  GuestLoginGate,
  MediaAccessDeniedBanner,
  ServerProfileModalContainer,
  SessionMovedOverlay,
  ToastStack
} from "./components";
import {
  DEFAULT_CHAT_IMAGE_DATA_URL_LENGTH,
  DEFAULT_CHAT_IMAGE_MAX_SIDE,
  DEFAULT_CHAT_IMAGE_QUALITY,
  DEFAULT_MIC_VOLUME,
  DEFAULT_OUTPUT_VOLUME,
  MAX_CHAT_RETRIES,
  MESSAGE_EDIT_DELETE_WINDOW_MS,
  PENDING_ACCESS_AUTO_REFRESH_SEC,
  ROOM_SLUG_STORAGE_KEY,
  VERSION_UPDATE_PENDING_KEY
} from "./constants/appConfig";
import type { InputProfile, MediaDevicesState } from "./components";
import {
  useAppUiState,
  useAdminUsersSync,
  useAutoRoomVoiceConnection,
  useAppEventLogs,
  useAuthProfileFlow,
  useBuildVersionSync,
  useDesktopHandoffState,
  useDesktopUpdateFlow,
  usePendingAccessAutoRefresh,
  useWorkspaceRoomsPanelProps,
  useServerVideoWindowBounds,
  useWorkspaceChatVideoProps,
  useWorkspaceUserDockProps,
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
import { detectInitialLang, LOCALE_BY_LANG, TEXT, type Lang } from "./i18n";
import { DEFAULT_UI_THEME, formatBuildDateLabel, normalizeUiTheme, readNonZeroDefaultVolume } from "./utils/appShell";
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
  UiTheme,
  User
} from "./domain";
import type {
  ServerScreenShareResolution,
  ServerVideoEffectType,
  ServerVideoResolution
} from "./hooks/rtc/voiceCallTypes";
import type { RnnoiseSuppressionLevel } from "./hooks/rtc/rnnoiseAudioProcessor";

const CLIENT_BUILD_VERSION = String(import.meta.env.VITE_APP_VERSION || "").trim();
const CLIENT_BUILD_SHA = String(import.meta.env.VITE_APP_BUILD_SHA || CLIENT_BUILD_VERSION || "").trim();
const CLIENT_BUILD_DATE = String(import.meta.env.VITE_APP_BUILD_DATE || "").trim();
const CLIENT_BUILD_DATE_LABEL = formatBuildDateLabel(CLIENT_BUILD_VERSION, CLIENT_BUILD_DATE);
const COOKIE_MODE = import.meta.env.VITE_AUTH_COOKIE_MODE === "1";
const CHAT_TYPING_TTL_MS = 4500;
const CHAT_TYPING_PING_INTERVAL_MS = 1800;

export function App() {
  const [token, setToken] = useState(() => (COOKIE_MODE ? "" : localStorage.getItem("boltorezka_token") || ""));
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState("loading");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsTree, setRoomsTree] = useState<RoomsTreeResponse | null>(null);
  const [roomSlug, setRoomSlug] = useState(() => {
    const stored = String(localStorage.getItem(ROOM_SLUG_STORAGE_KEY) || "").trim();
    return stored;
  });
  const [chatRoomSlug, setChatRoomSlug] = useState(() => {
    const stored = String(localStorage.getItem(ROOM_SLUG_STORAGE_KEY) || "").trim();
    return stored;
  });
  const [showAppUpdatedOverlay, setShowAppUpdatedOverlay] = useState(
    () => sessionStorage.getItem(VERSION_UPDATE_PENDING_KEY) === "1"
  );
  const [pendingAccessRefreshInSec, setPendingAccessRefreshInSec] = useState(PENDING_ACCESS_AUTO_REFRESH_SEC);
  const [showFirstRunIntro, setShowFirstRunIntro] = useState(false);
  const [sessionMovedOverlayMessage, setSessionMovedOverlayMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [messagesNextCursor, setMessagesNextCursor] = useState<MessagesCursor | null>(null);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [chatText, setChatText] = useState("");
  const [pendingChatImageDataUrl, setPendingChatImageDataUrl] = useState<string | null>(null);
  const [chatTypingByRoomSlug, setChatTypingByRoomSlug] = useState<Record<string, Record<string, { userName: string; expiresAt: number }>>>({});
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
  const [selectedUiTheme, setSelectedUiTheme] = useState<UiTheme>(() =>
    normalizeUiTheme(localStorage.getItem("boltorezka_ui_theme"))
  );
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
    if (value === "none" || value === "soft" || value === "medium" || value === "strong") {
      return value;
    }
    return "medium";
  });
  const [preRnnEchoCancellationEnabled, setPreRnnEchoCancellationEnabled] = useState<boolean>(() => localStorage.getItem("boltorezka_pre_rnn_echo_cancellation") !== "0");
  const [preRnnAutoGainControlEnabled, setPreRnnAutoGainControlEnabled] = useState<boolean>(() => localStorage.getItem("boltorezka_pre_rnn_agc") !== "0");
  const [selfMonitorEnabled, setSelfMonitorEnabled] = useState<boolean>(() => localStorage.getItem("boltorezka_self_monitor") === "1");
  const [mediaDevicesState, setMediaDevicesState] = useState<MediaDevicesState>("ready");
  const [mediaDevicesHint, setMediaDevicesHint] = useState("");
  const [micVolume, setMicVolume] = useState<number>(() => readNonZeroDefaultVolume("boltorezka_mic_volume", DEFAULT_MIC_VOLUME));
  const [outputVolume, setOutputVolume] = useState<number>(() => readNonZeroDefaultVolume("boltorezka_output_volume", DEFAULT_OUTPUT_VOLUME));
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
  const [serverScreenShareResolution, setServerScreenShareResolution] = useState<ServerScreenShareResolution>(() => {
    const value = localStorage.getItem("boltorezka_server_screen_share_resolution");
    if (value === "hd" || value === "fullhd" || value === "max") {
      return value;
    }
    return "fullhd";
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
  const lastRoomSlugForScrollRef = useRef(chatRoomSlug);
  const lastMessageIdRef = useRef<string | null>(null);
  const chatLogRef = useRef<HTMLDivElement>(null);
  const chatTypingStopTimerRef = useRef<number | null>(null);
  const chatTypingLastSentAtRef = useRef(0);
  const chatTypingActiveRef = useRef(false);
  const chatTypingRoomSlugRef = useRef("");
  const previousChatRoomSlugRef = useRef(chatRoomSlug);
  const autoSsoAttemptedRef = useRef(false);
  const authMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const categoryPopupRef = useRef<HTMLDivElement>(null);
  const channelPopupRef = useRef<HTMLDivElement>(null);
  const audioOutputAnchorRef = useRef<HTMLDivElement>(null);
  const voiceSettingsAnchorRef = useRef<HTMLDivElement>(null);
  const userSettingsRef = useRef<HTMLDivElement>(null);

  const canCreateRooms = user?.role === "admin" || user?.role === "super_admin";
  const canManageUsers = canCreateRooms;
  const canPromote = user?.role === "super_admin";
  const canUseService = Boolean(
    user && (user.role === "admin" || user.role === "super_admin" || user.access_state === "active")
  );
  const serviceToken = canUseService ? token : "";
  const canManageAudioQuality = canPromote;
  const canViewTelemetry = canPromote || canCreateRooms;
  const locale = LOCALE_BY_LANG[lang];
  const t = useMemo(() => {
    const dict = TEXT[lang];
    return (key: string) => dict[key] || key;
  }, [lang]);
  const maxChatImageKb = Math.max(1, Math.floor(serverChatImagePolicy.maxDataUrlLength / 1024));
  const chatImageTooLargeMessage = t("chat.imageTooLarge")
    .replace("{maxSide}", String(serverChatImagePolicy.maxImageSide))
    .replace("{maxKb}", String(maxChatImageKb));
  const {
    desktopUpdateReadyVersion,
    desktopUpdateApplying,
    desktopUpdateBannerDismissed,
    dismissDesktopUpdateBanner,
    applyDesktopUpdate
  } = useDesktopUpdateFlow({ t, pushToast });
  const { showDesktopBrowserCompletion, desktopHandoffError } = useDesktopHandoffState(token);
  const { eventLog, callEventLog, pushLog, pushCallLog } = useAppEventLogs(locale);

  const { collapsedCategoryIds, toggleCategoryCollapsed } = useCollapsedCategories(roomsTree);
  const {
    settings: serverSoundSettings,
    setMasterVolume: setServerSoundsMasterVolume,
    setEventEnabled: setServerSoundEnabled,
    playServerSound
  } = useServerSounds();

  useBuildVersionSync(CLIENT_BUILD_SHA);

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

  const clearChatTypingStopTimer = useCallback(() => {
    if (chatTypingStopTimerRef.current !== null) {
      window.clearTimeout(chatTypingStopTimerRef.current);
      chatTypingStopTimerRef.current = null;
    }
  }, []);

  const sendChatTypingState = useCallback((targetRoomSlug: string, isTyping: boolean) => {
    const slug = String(targetRoomSlug || "").trim();
    if (!slug || !user?.id) {
      return;
    }

    void sendWsEvent("chat.typing", { roomSlug: slug, isTyping }, { maxRetries: 1 });
    chatTypingLastSentAtRef.current = Date.now();
    chatTypingActiveRef.current = isTyping;
    chatTypingRoomSlugRef.current = isTyping ? slug : "";

    if (!isTyping) {
      clearChatTypingStopTimer();
    }
  }, [clearChatTypingStopTimer, sendWsEvent, user?.id]);

  const scheduleChatTypingStop = useCallback((targetRoomSlug: string) => {
    clearChatTypingStopTimer();
    chatTypingStopTimerRef.current = window.setTimeout(() => {
      sendChatTypingState(targetRoomSlug, false);
    }, CHAT_TYPING_TTL_MS);
  }, [clearChatTypingStopTimer, sendChatTypingState]);

  const handleSetChatText = useCallback((value: string) => {
    setChatText(value);

    if (!chatRoomSlug || !user?.id) {
      return;
    }

    const hasText = value.trim().length > 0;
    if (!hasText) {
      if (chatTypingActiveRef.current && chatTypingRoomSlugRef.current === chatRoomSlug) {
        sendChatTypingState(chatRoomSlug, false);
      }
      return;
    }

    const now = Date.now();
    if (
      !chatTypingActiveRef.current
      || chatTypingRoomSlugRef.current !== chatRoomSlug
      || now - chatTypingLastSentAtRef.current >= CHAT_TYPING_PING_INTERVAL_MS
    ) {
      sendChatTypingState(chatRoomSlug, true);
    }

    scheduleChatTypingStop(chatRoomSlug);
  }, [chatRoomSlug, scheduleChatTypingStop, sendChatTypingState, user?.id]);

  const currentRoomVoiceTargets = useMemo(() => {
    const members = roomsPresenceDetailsBySlug[roomSlug] || [];
    const me = user?.id || "";
    return members.filter((member) => member.userId !== me);
  }, [roomsPresenceDetailsBySlug, roomSlug, user?.id]);

  const activeChatTypingUsers = useMemo(() => {
    const now = Date.now();
    const roomTyping = chatTypingByRoomSlug[chatRoomSlug] || {};

    return Object.values(roomTyping)
      .filter((entry) => entry.expiresAt > now)
      .map((entry) => entry.userName)
      .filter((name, index, all) => all.indexOf(name) === index);
  }, [chatRoomSlug, chatTypingByRoomSlug]);

  const { currentRoom: currentRoomSnapshot, currentRoomKind, currentRoomAudioQualityOverride } = useCurrentRoomSnapshot({
    rooms,
    roomsTree,
    roomSlug
  });
  const effectiveAudioQuality = currentRoomAudioQualityOverride ?? serverAudioQuality;
  const roomMediaCapabilities = useRoomMediaCapabilities(currentRoomKind);
  const currentRoomTopology = roomSlug ? roomMediaTopologyBySlug[roomSlug] : undefined;
  const topologySupportsRtc = currentRoomTopology === "livekit";
  const currentRoomSupportsRtc = roomMediaCapabilities.supportsVoice || topologySupportsRtc;
  const currentRoomSupportsVideo = roomMediaCapabilities.supportsCamera;
  const allowVideoStreaming = roomMediaCapabilities.supportsCamera || topologySupportsRtc;
  const currentRoomSupportsScreenShare = roomMediaCapabilities.supportsScreenShare || topologySupportsRtc;
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
    t,
    token: serviceToken,
    localUserId: user?.id || "",
    roomSlug,
    allowVideoStreaming,
    videoStreamingEnabled: cameraEnabled,
    videoResolution: serverVideoResolution,
    videoFps: serverVideoFps,
    screenShareResolution: serverScreenShareResolution,
    audioQuality: effectiveAudioQuality,
    roomVoiceTargets: currentRoomVoiceTargets,
    selectedInputId,
    selectedInputProfile,
    rnnoiseSuppressionLevel,
    preRnnEchoCancellationEnabled,
    preRnnAutoGainControlEnabled,
    selectedOutputId,
    memberVolumeByUserId,
    selectedVideoInputId,
    micVolume,
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
    remoteAudioAutoplayBlocked,
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

  const {
    normalizedMinWidth: normalizedServerVideoWindowMinWidth,
    normalizedMaxWidth: normalizedServerVideoWindowMaxWidth,
    setBoundedMinWidth: setBoundedServerVideoWindowMinWidth,
    setBoundedMaxWidth: setBoundedServerVideoWindowMaxWidth
  } = useServerVideoWindowBounds({
    minWidth: serverVideoWindowMinWidth,
    maxWidth: serverVideoWindowMaxWidth,
    setMinWidth: setServerVideoWindowMinWidth,
    setMaxWidth: setServerVideoWindowMaxWidth
  });

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
    preRnnEchoCancellationEnabled,
    preRnnAutoGainControlEnabled,
    selfMonitorEnabled,
    micMuted,
    audioMuted,
    cameraEnabled,
    serverVideoEffectType,
    serverVideoResolution,
    serverVideoFps,
    serverScreenShareResolution,
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
    roomSlug,
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
    serverScreenShareResolution,
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
    hasSessionToken: Boolean(serviceToken),
    roomSlug,
    currentRoomKind,
    currentRoomSupportsScreenShare,
    roomVoiceConnected,
    connectRoom,
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
    setServerScreenShareResolution,
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
    selectedUiTheme,
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
    document.documentElement.setAttribute("data-ui-theme", selectedUiTheme);
    localStorage.setItem("boltorezka_ui_theme", selectedUiTheme);
  }, [selectedUiTheme]);

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
    setSelectedUiTheme(normalizeUiTheme(user?.ui_theme));
    setProfileStatusText("");
  }, [user]);

  useEffect(() => {
    if (!user?.id) {
      setShowFirstRunIntro(false);
      return;
    }

    const storageKey = `boltorezka_intro_v1_seen:${user.id}`;
    const alreadySeen = localStorage.getItem(storageKey) === "1";
    setShowFirstRunIntro(!alreadySeen);
  }, [user?.id]);

  useEffect(() => {
    setEditingMessageId(null);
    setPendingChatImageDataUrl(null);
  }, [chatRoomSlug]);

  useEffect(() => {
    if (roomSlug) {
      localStorage.setItem(ROOM_SLUG_STORAGE_KEY, roomSlug);
      return;
    }

    localStorage.removeItem(ROOM_SLUG_STORAGE_KEY);
  }, [roomSlug]);

  useEffect(() => {
    if (!chatRoomSlug && roomSlug) {
      setChatRoomSlug(roomSlug);
    }
  }, [chatRoomSlug, roomSlug]);

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
    token: serviceToken,
    reconnectNonce: realtimeReconnectNonce,
    joinedRoomSlug: roomSlug,
    chatRoomSlug,
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
    setJoinedRoomSlug: setRoomSlug,
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
    onSessionMoved: ({ code, message }) => {
      const activeSlug = String(roomSlugRef.current || "").trim();
      if (activeSlug) {
        void playServerSound("self_disconnected");
        setRoomsPresenceBySlug((prev) => {
          if (!(activeSlug in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[activeSlug];
          return next;
        });
        setRoomsPresenceDetailsBySlug((prev) => {
          if (!(activeSlug in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[activeSlug];
          return next;
        });
      }

      disconnectRoom();
      realtimeClientRef.current?.dispose();
      realtimeClientRef.current = null;
      setRoomSlug("");
      setChatTypingByRoomSlug({});
      setSessionMovedOverlayMessage(`${code}: ${message}`);
      pushLog(`session moved: ${code} ${message}`);
    },
    onChatCleared: (payload) => {
      const targetRoomSlug = String(payload.roomSlug || "").trim();
      if (!targetRoomSlug || targetRoomSlug !== chatRoomSlug) {
        return;
      }

      setMessages([]);
      setMessagesHasMore(false);
      setMessagesNextCursor(null);

      const deletedCount = Number(payload.deletedCount || 0);
      pushLog(`channel chat cleared by admin (${Number.isFinite(deletedCount) ? deletedCount : 0})`);
    },
    onChatTyping: (payload) => {
      const typingRoomSlug = String(payload.roomSlug || "").trim();
      const typingUserId = String(payload.userId || "").trim();
      const typingUserName = String(payload.userName || "").trim();

      if (!typingRoomSlug || !typingUserId || !typingUserName || typingUserId === user?.id) {
        return;
      }

      const isTyping = payload.isTyping === true;
      setChatTypingByRoomSlug((prev) => {
        const roomTyping = prev[typingRoomSlug] || {};

        if (isTyping) {
          return {
            ...prev,
            [typingRoomSlug]: {
              ...roomTyping,
              [typingUserId]: {
                userName: typingUserName,
                expiresAt: Date.now() + CHAT_TYPING_TTL_MS
              }
            }
          };
        }

        if (!(typingUserId in roomTyping)) {
          return prev;
        }

        const nextRoomTyping = { ...roomTyping };
        delete nextRoomTyping[typingUserId];

        if (Object.keys(nextRoomTyping).length === 0) {
          const next = { ...prev };
          delete next[typingRoomSlug];
          return next;
        }

        return {
          ...prev,
          [typingRoomSlug]: nextRoomTyping
        };
      });
    }
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setChatTypingByRoomSlug((prev) => {
        let changed = false;
        const next: Record<string, Record<string, { userName: string; expiresAt: number }>> = {};

        Object.entries(prev).forEach(([slug, users]) => {
          const aliveEntries = Object.entries(users).filter(([, entry]) => entry.expiresAt > now);
          if (aliveEntries.length !== Object.keys(users).length) {
            changed = true;
          }
          if (aliveEntries.length > 0) {
            next[slug] = Object.fromEntries(aliveEntries);
          } else if (Object.keys(users).length > 0) {
            changed = true;
          }
        });

        return changed ? next : prev;
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const previousRoomSlug = previousChatRoomSlugRef.current;
    if (previousRoomSlug && previousRoomSlug !== chatRoomSlug && chatTypingActiveRef.current) {
      sendChatTypingState(previousRoomSlug, false);
    }
    previousChatRoomSlugRef.current = chatRoomSlug;
  }, [chatRoomSlug, sendChatTypingState]);

  useEffect(() => () => {
    if (chatTypingActiveRef.current && chatTypingRoomSlugRef.current) {
      void sendWsEvent("chat.typing", { roomSlug: chatTypingRoomSlugRef.current, isTyping: false }, { maxRetries: 1 });
    }
    clearChatTypingStopTimer();
  }, [clearChatTypingStopTimer, sendWsEvent]);

  useAdminUsersSync({
    token,
    canManageUsers,
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

  useEffect(() => {
    if (userSettingsOpen && userSettingsTab === "sound") {
      return;
    }

    setSelfMonitorEnabled(false);
  }, [userSettingsOpen, userSettingsTab]);

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
    if (!chatRoomSlug) {
      pushToast(t("chat.selectChannelPlaceholder"));
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
          text: nextText,
          roomSlug: chatRoomSlug
        },
        { withIdempotency: true, maxRetries: MAX_CHAT_RETRIES }
      );

      if (!requestId) {
        pushToast(t("toast.serverError"));
        return;
      }

      setChatText("");
      setEditingMessageId(null);
      sendChatTypingState(chatRoomSlug, false);
      return;
    }

    const baseText = chatText.trim();
    const imageMarkdown = pendingChatImageDataUrl ? `![скриншот](${pendingChatImageDataUrl})` : "";
    const outgoingText = [baseText, imageMarkdown].filter(Boolean).join("\n");
    const result = chatController.sendMessage(outgoingText, chatRoomSlug, user, MAX_CHAT_RETRIES);
    if (result.sent) {
      setChatText("");
      setPendingChatImageDataUrl(null);
      sendChatTypingState(chatRoomSlug, false);
    }
  };

  const handleChatPaste = (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!chatRoomSlug) {
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
          pushToast(chatImageTooLargeMessage);
          return;
        }

        setPendingChatImageDataUrl(dataUrl);
      } catch {
        pushToast(chatImageTooLargeMessage);
      }
    })();
  };

  const handleChatInputKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
      return;
    }

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
    if (!chatRoomSlug) {
      pushToast(t("chat.selectChannelPlaceholder"));
      return;
    }

    const targetMessage = messages.find((item) => item.id === messageId);
    if (!targetMessage || !canManageOwnMessage(targetMessage)) {
      return;
    }

    setEditingMessageId(messageId);
    setChatText(targetMessage.text);
  };

  const openRoomChat = useCallback((slug: string) => {
    const normalized = String(slug || "").trim();
    if (!normalized) {
      return;
    }

    if (normalized !== chatRoomSlug) {
      setMessages([]);
      setMessagesHasMore(false);
      setMessagesNextCursor(null);
    }

    setChatRoomSlug(normalized);
  }, [chatRoomSlug]);

  const deleteOwnMessage = (messageId: string) => {
    if (!chatRoomSlug) {
      pushToast(t("chat.selectChannelPlaceholder"));
      return;
    }

    const targetMessage = messages.find((item) => item.id === messageId);
    if (!targetMessage || !canManageOwnMessage(targetMessage)) {
      return;
    }

    const requestId = sendWsEvent(
      "chat.delete",
      {
        messageId,
        roomSlug: chatRoomSlug
      },
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
    setChatRoomSlug
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
    setUserAccessState,
    setServerAudioQualityValue
  } = useServerModerationActions({
    token,
    canManageUsers,
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

  const activeChatRoom = useMemo(
    () => allRooms.find((room) => room.slug === chatRoomSlug) || null,
    [allRooms, chatRoomSlug]
  );

  useEffect(() => {
    if (allRooms.length === 0) {
      return;
    }

    if (roomSlug) {
      const joinedRoomExists = allRooms.some((room) => room.slug === roomSlug);
      if (!joinedRoomExists) {
        setRoomSlug("");
      }
    }

    if (chatRoomSlug) {
      const chatRoomExists = allRooms.some((room) => room.slug === chatRoomSlug);
      if (!chatRoomExists) {
        setChatRoomSlug("");
      }
    }
  }, [allRooms, roomSlug, chatRoomSlug]);

  useEffect(() => {
    if (chatRoomSlug) {
      return;
    }

    if (roomSlug) {
      setChatRoomSlug(roomSlug);
      return;
    }

    const firstRoom = allRooms[0];
    if (firstRoom?.slug) {
      setChatRoomSlug(firstRoom.slug);
    }
  }, [allRooms, chatRoomSlug, roomSlug]);

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

  usePendingAccessAutoRefresh({
    user,
    resetValue: PENDING_ACCESS_AUTO_REFRESH_SEC,
    setPendingAccessRefreshInSec
  });

  useAutoRoomVoiceConnection({
    roomMediaResolved: Boolean(currentRoomSnapshot) || topologySupportsRtc,
    currentRoomSupportsRtc: currentRoomSupportsRtc && !showAppUpdatedOverlay,
    roomVoiceTargetsCount: currentRoomVoiceTargets.length,
    roomVoiceConnected,
    // Keep RTC transport attached while user stays in a voice-enabled room.
    // This avoids false "no RTC" states during presence churn and multi-client switches.
    keepConnectedWithoutTargets: true,
    connectRoom,
    disconnectRoom
  });

  const acknowledgeUpdatedApp = useCallback(() => {
    sessionStorage.removeItem(VERSION_UPDATE_PENDING_KEY);
    setShowAppUpdatedOverlay(false);
  }, []);

  useServerMenuAccessGuard({
    serverMenuTab,
    canManageUsers,
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

  const userDockSharedProps = useWorkspaceUserDockProps({
    t,
    user,
    currentRoomSupportsRtc,
    currentRoomSupportsVideo,
    currentRoomTitle: currentRoom?.title || "",
    callStatus,
    localVoiceMediaStatusSummary,
    lastCallPeer,
    roomVoiceConnected,
    remoteAudioAutoplayBlocked,
    screenShareActive: Boolean(currentRoomScreenShareOwner.userId),
    screenShareOwnedByCurrentUser: isCurrentUserScreenShareOwner,
    canStartScreenShare: canToggleScreenShare,
    noiseSuppressionEnabled,
    rnnoiseSuppressionLevel,
    rnnoiseRuntimeStatus,
    preRnnEchoCancellationEnabled,
    preRnnAutoGainControlEnabled,
    cameraEnabled,
    micMuted,
    audioMuted,
    audioOutputMenuOpen,
    voiceSettingsOpen,
    userSettingsOpen,
    userSettingsTab,
    voiceSettingsPanel,
    profileNameDraft,
    profileSaving,
    profileStatusText,
    lang,
    selectedUiTheme,
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
    handleToggleMic,
    handleToggleAudio,
    handleToggleCamera,
    handleToggleScreenShareClick,
    handleToggleNoiseSuppression,
    setRnnoiseSuppressionLevel,
    setPreRnnEchoCancellationEnabled,
    setPreRnnAutoGainControlEnabled,
    selfMonitorEnabled,
    setSelfMonitorEnabled,
    requestVideoAccess,
    handleToggleVoiceSettings,
    handleToggleAudioOutput,
    openUserSettings,
    setVoiceSettingsOpen,
    setAudioOutputMenuOpen,
    setVoiceSettingsPanel,
    setUserSettingsOpen,
    setUserSettingsTab,
    setProfileNameDraft,
    setLang,
    setSelectedUiTheme,
    saveMyProfile,
    setSelectedInputId,
    setSelectedOutputId,
    setSelectedVideoInputId,
    setSelectedInputProfile,
    refreshDevices,
    requestMediaAccess,
    setMicVolume,
    setOutputVolume,
    setServerSoundsMasterVolume,
    setServerSoundEnabled,
    playServerSound,
    leaveRoom,
    isMobileViewport
  });

  const completeFirstRunIntro = useCallback(async () => {
    if (!user?.id) {
      return;
    }

    const trimmedName = profileNameDraft.trim();
    if (!trimmedName) {
      pushToast(t("profile.saveError"));
      return;
    }

    setProfileSaving(true);
    setProfileStatusText("");
    try {
      const response = await api.updateMe(token, {
        name: trimmedName,
        uiTheme: selectedUiTheme
      });
      if (response.user) {
        setUser(response.user);
      }
      localStorage.setItem(`boltorezka_intro_v1_seen:${user.id}`, "1");
      setShowFirstRunIntro(false);
      pushToast(t("profile.saveSuccess"));
    } catch (error) {
      const message = (error as Error).message || t("profile.saveError");
      setProfileStatusText(message);
      pushToast(message);
    } finally {
      setProfileSaving(false);
    }
  }, [profileNameDraft, pushToast, selectedUiTheme, t, token, user?.id]);

  const roomsPanelProps = useWorkspaceRoomsPanelProps({
    t,
    canCreateRooms,
    canManageAudioQuality,
    roomsTree,
    roomSlug,
    chatRoomSlug,
    roomMediaTopologyBySlug,
    currentUserId: user?.id || null,
    liveRoomMembersBySlug: roomsPresenceBySlug,
    liveRoomMemberDetailsBySlug: roomsPresenceDetailsBySlug,
    memberPreferencesByUserId,
    voiceMicStateByUserIdInCurrentRoom,
    effectiveVoiceCameraEnabledByUserIdInCurrentRoom,
    voiceAudioOutputMutedByUserIdInCurrentRoom,
    voiceRtcStateByUserIdInCurrentRoom,
    voiceMediaStatusSummaryByUserIdInCurrentRoom,
    collapsedCategoryIds,
    uncategorizedRooms,
    newCategorySlug,
    newCategoryTitle,
    categoryPopupOpen,
    newRoomSlug,
    newRoomTitle,
    newRoomKind,
    newRoomCategoryId,
    channelPopupOpen,
    categorySettingsPopupOpenId,
    editingCategoryTitle,
    channelSettingsPopupOpenId,
    editingRoomTitle,
    editingRoomKind,
    editingRoomCategoryId,
    editingRoomAudioQualitySetting,
    categoryPopupRef,
    channelPopupRef,
    onSetCategoryPopupOpen: setCategoryPopupOpen,
    onSetChannelPopupOpen: setChannelPopupOpen,
    onSetNewCategorySlug: setNewCategorySlug,
    onSetNewCategoryTitle: setNewCategoryTitle,
    onSetNewRoomSlug: setNewRoomSlug,
    onSetNewRoomTitle: setNewRoomTitle,
    onSetNewRoomKind: setNewRoomKind,
    onSetNewRoomCategoryId: setNewRoomCategoryId,
    onSetEditingCategoryTitle: setEditingCategoryTitle,
    onSetEditingRoomTitle: setEditingRoomTitle,
    onSetEditingRoomKind: setEditingRoomKind,
    onSetEditingRoomCategoryId: setEditingRoomCategoryId,
    onSetEditingRoomAudioQualitySetting: setEditingRoomAudioQualitySetting,
    onCreateCategory: createCategory,
    onCreateRoom: createRoom,
    onOpenCreateChannelPopup: openCreateChannelPopup,
    onOpenCategorySettingsPopup: openCategorySettingsPopup,
    onOpenChannelSettingsPopup: openChannelSettingsPopup,
    onSaveCategorySettings: saveCategorySettings,
    moveCategory,
    deleteCategory,
    onSaveChannelSettings: saveChannelSettings,
    moveChannel,
    clearChannelMessages,
    deleteChannel,
    onToggleCategoryCollapsed: toggleCategoryCollapsed,
    onJoinRoom: joinRoom,
    onOpenRoomChat: openRoomChat,
    onKickRoomMember: kickRoomMember,
    onMoveRoomMember: moveRoomMember,
    onSaveMemberPreference: saveMemberPreference
  });

  const { chatPanelProps, videoWindowsOverlayProps } = useWorkspaceChatVideoProps({
    t,
    locale,
    chatRoomSlug,
    activeChatRoomTitle: activeChatRoom?.title || "",
    messages,
    currentUserId: user?.id || null,
    messagesHasMore,
    loadingOlderMessages,
    chatText,
    pendingChatImageDataUrl,
    activeChatTypingUsers,
    chatLogRef,
    loadOlderMessages,
    setChatText: handleSetChatText,
    handleChatPaste,
    handleChatInputKeyDown,
    sendMessage,
    editingMessageId,
    currentRoomSupportsRtc,
    videoWindowsVisible,
    setVideoWindowsVisible,
    setEditingMessageId,
    startEditingMessage,
    deleteOwnMessage,
    userName: user?.name || "",
    allowVideoStreaming,
    cameraEnabled,
    localVideoStream,
    remoteVideoStreamsByUserId,
    effectiveVoiceCameraEnabledByUserIdInCurrentRoom,
    remoteVideoLabelsByUserId,
    activeScreenShare,
    normalizedServerVideoWindowMinWidth,
    normalizedServerVideoWindowMaxWidth,
    speakingVideoWindowIds
  });

  if (showDesktopBrowserCompletion) {
    return <DesktopBrowserCompletionGate desktopHandoffError={desktopHandoffError} />;
  }

  if (user && !canUseService) {
    const blocked = user.access_state === "blocked";
    return (
      <AccessStateGate
        blocked={blocked}
        pendingAccessRefreshInSec={pendingAccessRefreshInSec}
        t={t}
        onRefresh={() => window.location.reload()}
        onLogout={logout}
      />
    );
  }

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

      {mediaDevicesState === "denied" ? <MediaAccessDeniedBanner t={t} onRequestMediaAccess={requestMediaAccess} /> : null}

      {desktopUpdateReadyVersion && !desktopUpdateBannerDismissed ? (
        <DesktopUpdateBanner
          t={t}
          desktopUpdateReadyVersion={desktopUpdateReadyVersion}
          desktopUpdateApplying={desktopUpdateApplying}
          onDismiss={dismissDesktopUpdateBanner}
          onApply={() => {
            void applyDesktopUpdate();
          }}
        />
      ) : null}

      {user ? (
        <AppWorkspacePanels
          isMobileViewport={isMobileViewport}
          mobileTab={mobileTab}
          onSelectTab={setMobileTab}
          t={t}
          hasUser={Boolean(user)}
          userDockSharedProps={userDockSharedProps}
          roomsPanelProps={roomsPanelProps}
          chatPanelProps={chatPanelProps}
          videoWindowsOverlayProps={videoWindowsOverlayProps}
        />
      ) : authMode !== "loading" ? (
        <GuestLoginGate t={t} onBeginGoogleSso={() => beginSso("google")} />
      ) : null}

      <ServerProfileModalContainer
        open={appMenuOpen}
        t={t}
        permissions={{
          canManageUsers,
          canPromote,
          canViewTelemetry,
          canManageAudioQuality
        }}
        state={{
          serverMenuTab,
          serverAudioQuality,
          serverAudioQualitySaving,
          serverChatImagePolicy,
          serverVideoEffectType,
          serverVideoResolution,
          serverVideoFps,
          serverScreenShareResolution,
          serverVideoPixelFxStrength,
          serverVideoPixelFxPixelSize,
          serverVideoPixelFxGridThickness,
          serverVideoAsciiCellSize,
          serverVideoAsciiContrast,
          serverVideoAsciiColor,
          serverVideoWindowMinWidth: normalizedServerVideoWindowMinWidth,
          serverVideoWindowMaxWidth: normalizedServerVideoWindowMaxWidth
        }}
        data={{
          adminUsers,
          eventLog,
          telemetrySummary,
          callStatus,
          lastCallPeer,
          roomVoiceConnected,
          callEventLog,
          serverVideoPreviewStream
        }}
        actions={{
          onClose: () => setAppMenuOpen(false),
          onSetServerMenuTab: setServerMenuTab,
          onPromote: (userId) => void promote(userId),
          onDemote: (userId) => void demote(userId),
          onSetBan: (userId, banned) => void setUserBan(userId, banned),
          onSetAccessState: (userId, accessState) => void setUserAccessState(userId, accessState),
          onRefreshTelemetry: () => void loadTelemetrySummary(),
          onSetServerAudioQuality: (value) => void setServerAudioQualityValue(value),
          onSetServerVideoEffectType: setServerVideoEffectType,
          onSetServerVideoResolution: setServerVideoResolution,
          onSetServerVideoFps: setServerVideoFps,
          onSetServerScreenShareResolution: setServerScreenShareResolution,
          onSetServerVideoPixelFxStrength: setServerVideoPixelFxStrength,
          onSetServerVideoPixelFxPixelSize: setServerVideoPixelFxPixelSize,
          onSetServerVideoPixelFxGridThickness: setServerVideoPixelFxGridThickness,
          onSetServerVideoAsciiCellSize: setServerVideoAsciiCellSize,
          onSetServerVideoAsciiContrast: setServerVideoAsciiContrast,
          onSetServerVideoAsciiColor: setServerVideoAsciiColor,
          onSetServerVideoWindowMinWidth: setBoundedServerVideoWindowMinWidth,
          onSetServerVideoWindowMaxWidth: setBoundedServerVideoWindowMaxWidth
        }}
      />

      <ToastStack toasts={toasts} />

      {showAppUpdatedOverlay ? <AppUpdatedOverlay t={t} onContinue={acknowledgeUpdatedApp} /> : null}

      {user && showFirstRunIntro ? (
        <FirstRunIntroOverlay
          t={t}
          selectedUiTheme={selectedUiTheme}
          onSelectTheme={setSelectedUiTheme}
          profileNameDraft={profileNameDraft}
          onChangeProfileName={setProfileNameDraft}
          profileSaving={profileSaving}
          onContinue={() => {
            void completeFirstRunIntro();
          }}
        />
      ) : null}

      {sessionMovedOverlayMessage ? (
        <SessionMovedOverlay
          message={sessionMovedOverlayMessage}
          onReopenHere={() => {
            setSessionMovedOverlayMessage("");
            window.location.reload();
          }}
        />
      ) : null}

    </main>
  );
}
