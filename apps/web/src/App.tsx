import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api } from "./api";
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
  AgeVerificationRequiredOverlay,
  AppHeader,
  AppWorkspacePanels,
  AppUpdatedOverlay,
  CookieConsentBanner,
  DesktopBrowserCompletionGate,
  DesktopUpdateBanner,
  EmptyServerOnboarding,
  FirstRunIntroOverlay,
  GuestLoginGate,
  LegalLinks,
  MediaAccessDeniedBanner,
  RemoteAudioAutoplayBanner,
  ServerProfileModalContainer,
  SessionMovedOverlay,
  ToastStack,
  UserDock
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
  VERSION_UPDATE_PENDING_KEY
} from "./constants/appConfig";
import type { InputProfile, MediaDevicesState } from "./components";
import {
  useAppUiState,
  useAppShellLifecycleEffects,
  useAdminUsersSync,
  useAutoRoomVoiceConnection,
  useAppEventLogs,
  useAuthProfileFlow,
  useBuildVersionSync,
  useDesktopHandoffState,
  useDesktopUpdateFlow,
  useInviteAcceptanceFlow,
  usePendingAccessAutoRefresh,
  useOnboardingOverlayActions,
  useRoomSlugPersistence,
  useServerDataSync,
  useWorkspaceRoomsPanelProps,
  useServerVideoWindowBounds,
  useWorkspaceChatVideoProps,
  useWorkspaceUserDockController,
  useSessionStateLifecycle,
  useTelemetryRefresh,
  useCollapsedCategories,
  useCurrentRoomSnapshot,
  useMediaDevicePreferences,
  useMicrophoneLevelMeter,
  useMicrophoneSelfMonitor,
  usePersistedClientSettings,
  usePopupOutsideClose,
  useRealtimeSoundEffects,
  useChatComposerActions,
  useChatTypingController,
  useRealtimeChatLifecycle,
  useRealtimeConnectionReset,
  useRealtimeIncomingCallState,
  useScreenShareOrchestrator,
  useWsEventAcks,
  useRoomAdminActions,
  useRoomMediaCapabilities,
  useRoomMemberPreferencesOrchestrator,
  useRoomPresenceActions,
  useRoomSelectionGuard,
  useServerProfileActions,
  useServerModerationActions,
  useRoomsDerived,
  useScreenWakeLock,
  useServerVideoPreview,
  useServerSounds,
  useServerMenuAccessGuard,
  useToastQueue,
  useLivekitVoiceRuntime,
  useVoiceSignalingOrchestrator,
  useVoiceRoomStateMaps,
  useVoiceUiLifecycleEffects
} from "./hooks";
import { detectInitialLang, LOCALE_BY_LANG, TEXT, type Lang } from "./i18n";
import { DEFAULT_UI_THEME, formatBuildDateLabel, normalizeUiTheme, readNonZeroDefaultVolume } from "./utils/appShell";
import type {
  AdminServerListItem,
  AdminServerOverview,
  AudioQuality,
  ChannelAudioQualitySetting,
  Message,
  MessagesCursor,
  PresenceMember,
  RoomMemberPreference,
  Room,
  RoomKind,
  RoomsTreeResponse,
  ServerMemberItem,
  ServerListItem,
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
const COOKIE_CONSENT_KEY = "boltorezka_cookie_consent_v1";
const CURRENT_SERVER_ID_STORAGE_KEY = "boltorezka_current_server_id";
const ROOM_SLUG_STORAGE_KEY = "boltorezka_room_slug";

// IMPORTANT: `App` is an orchestration boundary only.
// Do not add new business logic, parsing, transport rules, or large feature workflows here.
// Put feature logic into dedicated hooks/services/components and keep this file as glue code.
export function App() {
  const [token, setToken] = useState(() => (COOKIE_MODE ? "" : localStorage.getItem("boltorezka_token") || ""));
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState("loading");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsTree, setRoomsTree] = useState<RoomsTreeResponse | null>(null);
  const [archivedRooms, setArchivedRooms] = useState<Room[]>([]);
  const [roomSlug, setRoomSlug] = useState("");
  const [chatRoomSlug, setChatRoomSlug] = useState("");
  const [showAppUpdatedOverlay, setShowAppUpdatedOverlay] = useState(
    () => sessionStorage.getItem(VERSION_UPDATE_PENDING_KEY) === "1"
  );
  const [cookieConsentAccepted, setCookieConsentAccepted] = useState(
    () => localStorage.getItem(COOKIE_CONSENT_KEY) === "1"
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
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [lastCallPeer, setLastCallPeer] = useState("");
  const [roomsPresenceBySlug, setRoomsPresenceBySlug] = useState<Record<string, string[]>>({});
  const [roomsPresenceDetailsBySlug, setRoomsPresenceDetailsBySlug] = useState<Record<string, PresenceMember[]>>({});
  const [memberPreferencesByUserId, setMemberPreferencesByUserId] = useState<Record<string, RoomMemberPreference>>({});
  const [roomMediaTopologyBySlug, setRoomMediaTopologyBySlug] = useState<Record<string, "livekit">>({});
  const [servers, setServers] = useState<ServerListItem[]>([]);
  const [serversLoading, setServersLoading] = useState(false);
  const [currentServerId, setCurrentServerId] = useState(() => String(localStorage.getItem(CURRENT_SERVER_ID_STORAGE_KEY) || "").trim());
  const [creatingServer, setCreatingServer] = useState(false);
  const [serverMembers, setServerMembers] = useState<ServerMemberItem[]>([]);
  const [serverMembersLoading, setServerMembersLoading] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [serverAgeLoading, setServerAgeLoading] = useState(false);
  const [serverAgeConfirmedAt, setServerAgeConfirmedAt] = useState<string | null>(null);
  const [serverAgeConfirming, setServerAgeConfirming] = useState(false);
  const [ageGateBlockedRoomSlug, setAgeGateBlockedRoomSlug] = useState("");
  const [pendingInviteToken, setPendingInviteToken] = useState("");
  const [inviteAccepting, setInviteAccepting] = useState(false);
  const [telemetrySummary, setTelemetrySummary] = useState<TelemetrySummary | null>(null);
  const [wsState, setWsState] = useState<"disconnected" | "connecting" | "connected">(
    "disconnected"
  );
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [adminServers, setAdminServers] = useState<AdminServerListItem[]>([]);
  const [adminServersLoading, setAdminServersLoading] = useState(false);
  const [selectedAdminServerId, setSelectedAdminServerId] = useState("");
  const [adminServerOverview, setAdminServerOverview] = useState<AdminServerOverview | null>(null);
  const [adminServerOverviewLoading, setAdminServerOverviewLoading] = useState(false);
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
  const [editingRoomNsfw, setEditingRoomNsfw] = useState(false);
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
  const currentServerIdRef = useRef(currentServerId);
  const roomSlugRef = useRef(roomSlug);
  const lastRoomSlugForScrollRef = useRef(chatRoomSlug);
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

  useEffect(() => {
    currentServerIdRef.current = currentServerId;
  }, [currentServerId]);

  const currentServerRole = useMemo(
    () => servers.find((item) => item.id === currentServerId)?.role || null,
    [servers, currentServerId]
  );
  const canCreateRooms = Boolean(
    user && (
      user.role === "admin"
      || user.role === "super_admin"
      || currentServerRole === "owner"
      || currentServerRole === "admin"
    )
  );
  const canManageUsers = user?.role === "admin" || user?.role === "super_admin";
  const canPromote = user?.role === "super_admin";
  const canUseService = Boolean(
    user && (user.role === "admin" || user.role === "super_admin" || user.access_state === "active")
  );
  const serviceToken = canUseService ? token : "";
  const canManageAudioQuality = canPromote;
  const canManageServerControlPlane = canPromote;
  const canViewTelemetry = canPromote || canCreateRooms;
  const locale = LOCALE_BY_LANG[lang];
  const t = useMemo(() => {
    const dict = TEXT[lang];
    return (key: string) => dict[key] || key;
  }, [lang]);
  const maxChatImageKb = Math.max(1, Math.floor(serverChatImagePolicy.maxDataUrlLength / 1024));
  const selectChannelPlaceholderMessage = t("chat.selectChannelPlaceholder");
  const serverErrorMessage = t("toast.serverError");
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

  const {
    setChatTypingByRoomSlug,
    activeChatTypingUsers,
    handleSetChatText,
    sendChatTypingState,
    applyRemoteTypingPayload
  } = useChatTypingController({
    chatRoomSlug,
    userId: user?.id,
    sendWsEvent,
    setChatText,
    typingTtlMs: CHAT_TYPING_TTL_MS,
    typingPingIntervalMs: CHAT_TYPING_PING_INTERVAL_MS
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
          return sendWsEventAwaitAck("room.join", { roomSlug: slug }, { maxRetries: 1 });
        },
        setRooms,
        setRoomsTree,
        setArchivedRooms,
        setAdminUsers,
        getCurrentServerId: () => currentServerIdRef.current
      }),
    [pushLog, pushToast, sendWsEventAwaitAck]
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

  useAppShellLifecycleEffects({
    lang,
    selectedUiTheme,
    user,
    chatRoomSlug,
    setIsMobileViewport,
    setProfileNameDraft,
    setSelectedUiTheme,
    setProfileStatusText,
    setShowFirstRunIntro,
    setEditingMessageId,
    setPendingChatImageDataUrl
  });

  useRoomSlugPersistence({
    currentServerId,
    roomSlug,
    roomSlugStorageKey: ROOM_SLUG_STORAGE_KEY,
    setRoomSlug,
    setChatRoomSlug
  });

  useInviteAcceptanceFlow({
    token,
    hasUser: Boolean(user),
    pendingInviteToken,
    setPendingInviteToken,
    setInviteAccepting,
    setServers,
    setCurrentServerId,
    pushToast,
    t
  });

  useServerDataSync({
    token,
    hasUser: Boolean(user),
    currentServerId,
    selectedAdminServerId,
    canManageServerControlPlane,
    currentServerIdStorageKey: CURRENT_SERVER_ID_STORAGE_KEY,
    setServerAgeConfirmedAt,
    setServerAgeLoading,
    setServers,
    setServersLoading,
    setCurrentServerId,
    setServerMembers,
    setServerMembersLoading,
    setAdminServers,
    setSelectedAdminServerId,
    setAdminServerOverview,
    setAdminServersLoading,
    setAdminServerOverviewLoading,
    pushLog
  });

  const currentServer = useMemo(
    () => servers.find((item) => item.id === currentServerId) || null,
    [servers, currentServerId]
  );

  const {
    handleCreateServer,
    handleCreateServerInvite,
    handleRenameCurrentServer,
    handleConfirmServerAge,
    handleCopyInviteUrl,
    handleServerChange,
    handleLeaveCurrentServer,
    handleDeleteCurrentServer,
    handleRemoveServerMember,
    handleBanServerMember,
    handleUnbanServerMember,
    handleTransferServerOwnership
  } = useServerProfileActions({
    token,
    currentServerId,
    creatingInvite,
    serverAgeConfirming,
    lastInviteUrl,
    setCreatingServer,
    setServers,
    setCurrentServerId,
    setCreatingInvite,
    setLastInviteUrl,
    setServerAgeConfirming,
    setServerAgeConfirmedAt,
    setServerMembers,
    pushToast,
    t
  });

  const handleToggleAdminServerBlocked = useCallback(async (serverId: string, blocked: boolean) => {
    const tokenValue = String(token || "").trim();
    const targetServerId = String(serverId || "").trim();

    if (!tokenValue || !targetServerId) {
      return;
    }

    try {
      await api.adminSetServerBlocked(tokenValue, targetServerId, blocked);
      setAdminServers((prev) => prev.map((item) => (
        item.id === targetServerId
          ? { ...item, isBlocked: blocked }
          : item
      )));

      const listResponse = await api.servers(tokenValue);
      const list = Array.isArray(listResponse.servers) ? listResponse.servers : [];
      setServers(list);
      setCurrentServerId((prev) => {
        const preferredId = prev === targetServerId && blocked ? "" : prev;
        return list.some((item) => item.id === preferredId) ? preferredId : (list[0]?.id || "");
      });
      pushToast(blocked ? t("server.managementBlock") : t("server.managementUnblock"));
    } catch (error) {
      pushToast((error as Error).message || t("toast.serverError"));
    }
  }, [pushToast, setAdminServers, t, token]);

  const handleDeleteAdminServer = useCallback(async (serverId: string) => {
    const tokenValue = String(token || "").trim();
    const targetServerId = String(serverId || "").trim();

    if (!tokenValue || !targetServerId) {
      return;
    }

    try {
      await api.adminDeleteServer(tokenValue, targetServerId);

      const [adminServersResponse, serversResponse] = await Promise.all([
        api.adminServers(tokenValue),
        api.servers(tokenValue)
      ]);

      const adminList = Array.isArray(adminServersResponse.servers) ? adminServersResponse.servers : [];
      const userList = Array.isArray(serversResponse.servers) ? serversResponse.servers : [];

      setAdminServers(adminList);
      setServers(userList);
      setSelectedAdminServerId((prev) => {
        const preferredId = prev === targetServerId ? "" : prev;
        return adminList.some((item) => item.id === preferredId) ? preferredId : (adminList[0]?.id || "");
      });
      setCurrentServerId((prev) => {
        const preferredId = prev === targetServerId ? "" : prev;
        return userList.some((item) => item.id === preferredId) ? preferredId : (userList[0]?.id || "");
      });
      pushToast(t("server.deleteSuccess"));
    } catch (error) {
      pushToast((error as Error).message || t("toast.serverError"));
    }
  }, [pushToast, t, token]);

  useEffect(() => {
    if (!chatRoomSlug && roomSlug) {
      setChatRoomSlug(roomSlug);
    }
  }, [chatRoomSlug, roomSlug]);

  useSessionStateLifecycle({
    token,
    currentServerId,
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
    setArchivedRooms,
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
      applyRemoteTypingPayload(payload);
    }
  });

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

  useVoiceUiLifecycleEffects({
    userSettingsOpen,
    userSettingsTab,
    setSelfMonitorEnabled,
    roomSlug,
    roomMediaTopologyBySlug,
    pushCallLog
  });

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

  const {
    sendMessage,
    handleChatPaste,
    handleChatInputKeyDown,
    startEditingMessage,
    deleteOwnMessage,
    openRoomChat
  } = useChatComposerActions({
    chatRoomSlug,
    setChatRoomSlug,
    messages,
    setMessages,
    setMessagesHasMore,
    setMessagesNextCursor,
    user,
    authToken: token,
    chatText,
    setChatText,
    editingMessageId,
    setEditingMessageId,
    pendingChatImageDataUrl,
    setPendingChatImageDataUrl,
    chatController,
    sendWsEvent,
    sendChatTypingState,
    pushToast,
    selectChannelPlaceholderMessage,
    serverErrorMessage,
    maxChatRetries: MAX_CHAT_RETRIES,
    messageEditDeleteWindowMs: MESSAGE_EDIT_DELETE_WINDOW_MS,
    serverChatImagePolicy,
    chatImageTooLargeMessage
  });

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
    onAgeVerificationRequired: (slug) => {
      setAgeGateBlockedRoomSlug(slug);
    },
    setRoomSlug,
    setChatRoomSlug
  });

  const { saveMemberPreference } = useRoomMemberPreferencesOrchestrator({
    token,
    currentUserId: user?.id || "",
    roomsPresenceDetailsBySlug,
    setMemberPreferencesByUserId,
    pushLog,
    pushToast,
    t
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

  useRoomSelectionGuard({
    allRooms,
    roomSlug,
    chatRoomSlug,
    setRoomSlug,
    setChatRoomSlug
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
    clearChannelMessages,
    restoreChannel,
    deleteChannelPermanent
  } = useRoomAdminActions({
    token,
    canCreateRooms,
    canManageAudioQuality,
    roomSlug,
    allRooms,
    archivedRooms,
    roomAdminController,
    newRoomTitle,
    newRoomKind,
    newRoomCategoryId,
    newCategoryTitle,
    editingCategoryTitle,
    categorySettingsPopupOpenId,
    editingRoomTitle,
    editingRoomKind,
    editingRoomCategoryId,
    editingRoomNsfw,
    editingRoomAudioQualitySetting,
    channelSettingsPopupOpenId,
    setNewRoomTitle,
    setChannelPopupOpen,
    setNewCategoryTitle,
    setCategoryPopupOpen,
    setNewRoomCategoryId,
    setEditingRoomTitle,
    setEditingRoomKind,
    setEditingRoomCategoryId,
    setEditingRoomNsfw,
    setEditingRoomAudioQualitySetting,
    setChannelSettingsPopupOpenId,
    setEditingCategoryTitle,
    setCategorySettingsPopupOpenId,
    setMessages,
    setMessagesHasMore,
    setMessagesNextCursor,
    joinRoom
  });

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

  const { acknowledgeUpdatedApp, completeFirstRunIntro } = useOnboardingOverlayActions({
    token,
    user,
    profileNameDraft,
    selectedUiTheme,
    versionUpdatePendingKey: VERSION_UPDATE_PENDING_KEY,
    setProfileSaving,
    setProfileStatusText,
    setUser,
    setShowFirstRunIntro,
    setShowAppUpdatedOverlay,
    pushToast,
    t
  });

  useServerMenuAccessGuard({
    serverMenuTab,
    canManageUsers,
    canManageServerControlPlane,
    canViewTelemetry,
    canManageAudioQuality,
    canManageChatImages: canPromote,
    hasCurrentServer: Boolean(currentServer?.id),
    setServerMenuTab
  });

  useScreenWakeLock(Boolean(user && roomSlug && currentRoomSupportsRtc && roomVoiceConnected));

  const userDockSharedProps = useWorkspaceUserDockController({
    t,
    user,
    inputDevices,
    outputDevices,
    videoInputDevices,
    allowVideoStreaming,
    handleToggleScreenShare,
    setMicMuted,
    setAudioMuted,
    setCameraEnabled,
    setRnnoiseRuntimeStatus,
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
    serverAgeLoading,
    serverAgeConfirmedAt,
    serverAgeConfirming,
    lang,
    selectedUiTheme,
    selectedInputId,
    selectedOutputId,
    selectedVideoInputId,
    selectedInputProfile,
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
    setRnnoiseSuppressionLevel,
    setPreRnnEchoCancellationEnabled,
    setPreRnnAutoGainControlEnabled,
    selfMonitorEnabled,
    setSelfMonitorEnabled,
    requestVideoAccess,
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
    confirmServerAge: () => void handleConfirmServerAge(),
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
    archivedRooms,
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
    editingRoomNsfw,
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
    onSetEditingRoomNsfw: setEditingRoomNsfw,
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
    restoreChannel,
    deleteChannelPermanent,
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
    authToken: serviceToken,
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

  const showEmptyServerOnboarding = Boolean(user) && !serversLoading && servers.length === 0;

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
        currentServerName={currentServer?.name || null}
        servers={servers}
        currentServerId={currentServerId}
        creatingServer={creatingServer}
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
        onChangeCurrentServer={(serverId) => setCurrentServerId(serverId)}
        onCreateServer={handleCreateServer}
      />
      <TooltipPortal />

      {mediaDevicesState === "denied" ? <MediaAccessDeniedBanner t={t} onRequestMediaAccess={requestMediaAccess} /> : null}

      {remoteAudioAutoplayBlocked && !audioMuted && mediaDevicesState !== "denied" && !(desktopUpdateReadyVersion && !desktopUpdateBannerDismissed)
        ? <RemoteAudioAutoplayBanner t={t} />
        : null}

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
        showEmptyServerOnboarding ? (
          <EmptyServerOnboarding
            t={t}
            creatingServer={creatingServer}
            onCreateServer={handleCreateServer}
          />
        ) : (
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
        )
      ) : authMode !== "loading" ? (
        <GuestLoginGate t={t} onBeginSso={beginSso} />
      ) : null}

      {showEmptyServerOnboarding && userSettingsOpen && userDockSharedProps ? (
        <div className="no-server-user-settings-host">
          <UserDock {...userDockSharedProps} inlineSettingsMode={false} />
        </div>
      ) : null}

      {inviteAccepting ? (
        <div className="fixed inset-x-0 top-24 z-[160] flex justify-center px-4">
          <div className="rounded-xl border border-white/20 bg-black/75 px-4 py-2 text-sm text-pixel-text backdrop-blur">
            {t("server.inviteAccepting")}
          </div>
        </div>
      ) : null}

      <ServerProfileModalContainer
        open={appMenuOpen}
        t={t}
        permissions={{
          canManageUsers,
          canPromote,
          canManageServerControlPlane,
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
          adminServers,
          adminServersLoading,
          selectedAdminServerId,
          adminServerOverview,
          adminServerOverviewLoading,
          currentUserId: user?.id || "",
          currentServerRole: currentServer?.role || null,
          currentServerName: currentServer?.name || "",
          currentServerId,
          servers,
          hasCurrentServer: Boolean(currentServer?.id),
          serverMembers,
          serverMembersLoading,
          lastInviteUrl,
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
          onSelectAdminServer: setSelectedAdminServerId,
          onToggleAdminServerBlocked: (serverId, blocked) => void handleToggleAdminServerBlocked(serverId, blocked),
          onDeleteAdminServer: (serverId) => void handleDeleteAdminServer(serverId),
          onCreateServerInvite: () => void handleCreateServerInvite(),
          onCopyInviteUrl: () => void handleCopyInviteUrl(),
          onChangeCurrentServer: (serverId) => {
            handleServerChange(serverId);
            setSelectedAdminServerId(serverId);
          },
          onRenameCurrentServer: (name) => void handleRenameCurrentServer(name),
          onLeaveServer: () => void handleLeaveCurrentServer(),
          onDeleteServer: () => void handleDeleteCurrentServer(),
          onRemoveServerMember: (userId) => void handleRemoveServerMember(userId),
          onBanServerMember: (userId) => void handleBanServerMember(userId),
          onUnbanServerMember: (userId) => void handleUnbanServerMember(userId),
          onTransferServerOwnership: (userId) => void handleTransferServerOwnership(userId),
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
        meta={{
          creatingInvite
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

      {ageGateBlockedRoomSlug ? (
        <AgeVerificationRequiredOverlay
          t={t}
          roomSlug={ageGateBlockedRoomSlug}
          confirming={serverAgeConfirming}
          onOpenAgeSettings={() => openUserSettings("profile")}
          onConfirmAgeAndRetry={() => {
            const blockedRoomSlug = ageGateBlockedRoomSlug;
            void (async () => {
              await handleConfirmServerAge();
              setAgeGateBlockedRoomSlug("");
              joinRoom(blockedRoomSlug);
            })();
          }}
          onClose={() => setAgeGateBlockedRoomSlug("")}
        />
      ) : null}

      <footer className="pointer-events-none fixed inset-x-0 bottom-1 z-[150] px-3">
        <div className="mx-auto w-fit rounded-full border border-white/15 bg-black/35 px-4 py-1 backdrop-blur">
          <div className="pointer-events-auto">
            <LegalLinks compact lang={lang} />
          </div>
        </div>
      </footer>

      <CookieConsentBanner
        lang={lang}
        visible={!cookieConsentAccepted}
        onAccept={() => {
          localStorage.setItem(COOKIE_CONSENT_KEY, "1");
          setCookieConsentAccepted(true);
        }}
      />

    </main>
  );
}
