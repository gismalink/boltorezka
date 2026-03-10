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
import type { InputProfile, MediaDevicesState, VoiceSettingsPanel } from "./components";
import {
  useAutoRoomVoiceConnection,
  useAuthProfileFlow,
  useCollapsedCategories,
  useMediaDevicePreferences,
  useMicrophoneLevelMeter,
  usePopupOutsideClose,
  useRealtimeSoundEffects,
  useRealtimeChatLifecycle,
  useRoomAdminActions,
  useRoomsDerived,
  useScreenWakeLock,
  useServerSounds,
  useServerMenuAccessGuard,
  useLivekitVoiceRuntime,
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
import type { ServerVideoEffectType } from "./hooks/rtc/voiceCallTypes";
import { createProcessedVideoTrack, type OutgoingVideoTrackHandle } from "./utils/videoPixelPipeline";

const MAX_CHAT_RETRIES = 3;
const TOAST_AUTO_DISMISS_MS = 4500;
const TOAST_ID_RANDOM_RANGE = 10000;
const TOAST_DUPLICATE_THROTTLE_MS = 12000;
const TOAST_MAX_VISIBLE = 4;
const DEFAULT_CHAT_IMAGE_DATA_URL_LENGTH = 28000;
const DEFAULT_CHAT_IMAGE_MAX_SIDE = 1200;
const DEFAULT_CHAT_IMAGE_QUALITY = 0.6;
const MESSAGE_EDIT_DELETE_WINDOW_MS = 10 * 60 * 1000;
const VERSION_POLL_INTERVAL_MS = 60000;
const ROOM_SLUG_STORAGE_KEY = "boltorezka_room_slug";
const CLIENT_BUILD_VERSION = String(import.meta.env.VITE_APP_VERSION || "").trim();
const CLIENT_BUILD_DATE = String(import.meta.env.VITE_APP_BUILD_DATE || "").trim();
const CLIENT_BUILD_DATE_LABEL = CLIENT_BUILD_DATE ? `v.${CLIENT_BUILD_DATE}` : "";

type ServerMenuTab = "users" | "events" | "telemetry" | "call" | "sound" | "video" | "chat_images";
type MobileTab = "channels" | "chat" | "settings";
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
  const [callEventLog, setCallEventLog] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string }>>([]);
  const [roomsPresenceBySlug, setRoomsPresenceBySlug] = useState<Record<string, string[]>>({});
  const [roomsPresenceDetailsBySlug, setRoomsPresenceDetailsBySlug] = useState<Record<string, PresenceMember[]>>({});
  const [roomMediaTopologyBySlug, setRoomMediaTopologyBySlug] = useState<Record<string, "livekit">>({});
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
  const [audioMuted, setAudioMuted] = useState<boolean>(() => localStorage.getItem("boltorezka_audio_muted") === "1");
  const [audioOutputMenuOpen, setAudioOutputMenuOpen] = useState(false);
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const [userSettingsOpen, setUserSettingsOpen] = useState(false);
  const [userSettingsTab, setUserSettingsTab] = useState<"profile" | "sound" | "camera" | "server_sounds">("profile");
  const [lang, setLang] = useState<Lang>(() => detectInitialLang());
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profileStatusText, setProfileStatusText] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [inputDevices, setInputDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [outputDevices, setOutputDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [videoInputDevices, setVideoInputDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>(() => localStorage.getItem("boltorezka_selected_input_id") || "default");
  const [selectedOutputId, setSelectedOutputId] = useState<string>(() => localStorage.getItem("boltorezka_selected_output_id") || "default");
  const [selectedVideoInputId, setSelectedVideoInputId] = useState<string>(() => localStorage.getItem("boltorezka_selected_video_input_id") || "default");
  const [cameraEnabled, setCameraEnabled] = useState(false);
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
  const [voiceSettingsPanel, setVoiceSettingsPanel] = useState<VoiceSettingsPanel>(null);
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
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [serverMenuTab, setServerMenuTab] = useState<ServerMenuTab>("events");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("channels");
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
  const [serverVideoPreviewStream, setServerVideoPreviewStream] = useState<MediaStream | null>(null);
  const [realtimeReconnectNonce, setRealtimeReconnectNonce] = useState(0);
  const [videoWindowsVisible, setVideoWindowsVisible] = useState(true);
  const realtimeClientRef = useRef<RealtimeClient | null>(null);
  const pendingWsRequestResolversRef = useRef<
    Map<string, { resolve: () => void; reject: (error: Error) => void; timeoutId: number }>
  >(new Map());
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
  const serverVideoPreviewHandleRef = useRef<OutgoingVideoTrackHandle | null>(null);
  const serverVideoPreviewRawTrackRef = useRef<MediaStreamTrack | null>(null);
  const lastBroadcastVideoPolicyRef = useRef("");
  const lastBroadcastMicStateRef = useRef("");

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
  const {
    settings: serverSoundSettings,
    setMasterVolume: setServerSoundsMasterVolume,
    setEventEnabled: setServerSoundEnabled,
    playServerSound
  } = useServerSounds();

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

  useEffect(() => {
    if (!CLIENT_BUILD_VERSION) {
      return;
    }

    let cancelled = false;
    let inFlight = false;

    const checkVersion = async () => {
      if (cancelled || inFlight) {
        return;
      }

      inFlight = true;
      try {
        const payload = await api.version();
        const serverBuildVersion = String(payload.appBuildSha || "").trim();
        if (!cancelled && serverBuildVersion && serverBuildVersion !== CLIENT_BUILD_VERSION) {
          window.location.reload();
        }
      } catch {
        return;
      } finally {
        inFlight = false;
      }
    };

    void checkVersion();
    const intervalId = window.setInterval(() => {
      void checkVersion();
    }, VERSION_POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkVersion();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
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

  const sendWsEventAwaitAck = useCallback((
    eventType: string,
    payload: Record<string, unknown>,
    options: { withIdempotency?: boolean; trackAck?: boolean; maxRetries?: number } = {}
  ) => {
    const requestId = sendWsEvent(eventType, payload, {
      trackAck: true,
      maxRetries: 1,
      ...options
    });

    if (!requestId) {
      return Promise.reject(new Error("ws_not_connected"));
    }

    return new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        pendingWsRequestResolversRef.current.delete(requestId);
        reject(new Error(`${eventType}:ack_timeout`));
      }, 10000);

      pendingWsRequestResolversRef.current.set(requestId, {
        resolve: () => {
          window.clearTimeout(timeoutId);
          resolve();
        },
        reject: (error) => {
          window.clearTimeout(timeoutId);
          reject(error);
        },
        timeoutId
      });
    });
  }, [sendWsEvent]);

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
  const currentRoomKind = useMemo<RoomKind>(() => {
    const roomFromList = rooms.find((room) => room.slug === roomSlug);
    if (roomFromList) {
      return roomFromList.kind;
    }

    const roomFromTree = (roomsTree?.categories || [])
      .flatMap((category) => category.channels || [])
      .find((room) => room.slug === roomSlug)
      ?? (roomsTree?.uncategorized || []).find((room) => room.slug === roomSlug)
      ?? null;

    return roomFromTree?.kind || "text";
  }, [rooms, roomsTree, roomSlug]);
  const allowVideoStreaming = currentRoomKind === "text_voice_video";
  const currentRoomSupportsVideo = allowVideoStreaming;

  const livekitVoiceRuntime = useLivekitVoiceRuntime({
    token,
    localUserId: user?.id || "",
    roomSlug,
    allowVideoStreaming,
    videoStreamingEnabled: cameraEnabled,
    roomVoiceTargets: currentRoomVoiceTargets,
    selectedInputId,
    selectedInputProfile,
    selectedOutputId,
    selectedVideoInputId,
    micMuted,
    audioMuted,
    outputVolume,
    pushToast,
    pushCallLog,
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
    if (!allowVideoStreaming) {
      setCameraEnabled(false);
      setVideoWindowsVisible(true);
    }
  }, [allowVideoStreaming]);

  useEffect(() => {
    setVoiceCameraEnabledByUserIdInCurrentRoom({});
    setVoiceInitialMicStateByUserIdInCurrentRoom({});
    setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom({});
  }, [roomSlug]);

  useEffect(() => {
    localStorage.setItem("boltorezka_selected_input_profile", selectedInputProfile);
  }, [selectedInputProfile]);

  useEffect(() => {
    localStorage.setItem("boltorezka_audio_muted", audioMuted ? "1" : "0");
  }, [audioMuted]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_effect_type", serverVideoEffectType);
    localStorage.setItem("boltorezka_server_video_fx_enabled", serverVideoEffectType === "none" ? "0" : "1");
  }, [serverVideoEffectType]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_resolution", serverVideoResolution);
  }, [serverVideoResolution]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_fps", String(serverVideoFps));
  }, [serverVideoFps]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_fx_strength", String(serverVideoPixelFxStrength));
  }, [serverVideoPixelFxStrength]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_fx_pixel_size", String(serverVideoPixelFxPixelSize));
  }, [serverVideoPixelFxPixelSize]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_fx_grid_thickness", String(serverVideoPixelFxGridThickness));
  }, [serverVideoPixelFxGridThickness]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_ascii_cell_size", String(serverVideoAsciiCellSize));
  }, [serverVideoAsciiCellSize]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_ascii_contrast", String(serverVideoAsciiContrast));
  }, [serverVideoAsciiContrast]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_ascii_color", serverVideoAsciiColor);
  }, [serverVideoAsciiColor]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_window_min_width", String(serverVideoWindowMinWidth));
  }, [serverVideoWindowMinWidth]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_window_max_width", String(serverVideoWindowMaxWidth));
  }, [serverVideoWindowMaxWidth]);

  useEffect(() => {
    const activeRoom = rooms.find((room) => room.slug === roomSlug);
    const roomSupportsRtc = activeRoom ? activeRoom.kind !== "text" : false;
    if (!roomSupportsRtc || !roomVoiceConnected || !canManageAudioQuality) {
      return;
    }

    const payload = {
      effectType: serverVideoEffectType,
      resolution: serverVideoResolution,
      fps: serverVideoFps,
      pixelFxStrength: serverVideoPixelFxStrength,
      pixelFxPixelSize: serverVideoPixelFxPixelSize,
      pixelFxGridThickness: serverVideoPixelFxGridThickness,
      asciiCellSize: serverVideoAsciiCellSize,
      asciiContrast: serverVideoAsciiContrast,
      asciiColor: serverVideoAsciiColor,
      windowMinWidth: Math.min(serverVideoWindowMinWidth, serverVideoWindowMaxWidth),
      windowMaxWidth: Math.max(serverVideoWindowMinWidth, serverVideoWindowMaxWidth)
    };

    const serialized = JSON.stringify({ payload, audience: videoPolicyAudienceKey });
    if (lastBroadcastVideoPolicyRef.current === serialized) {
      return;
    }

    lastBroadcastVideoPolicyRef.current = serialized;
    sendWsEvent("call.video_state", { settings: payload }, { maxRetries: 1 });
  }, [
    rooms,
    roomSlug,
    roomVoiceConnected,
    canManageAudioQuality,
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
    videoPolicyAudienceKey,
    sendWsEvent
  ]);

  useEffect(() => {
    const stopServerVideoPreview = () => {
      serverVideoPreviewHandleRef.current?.stop();
      serverVideoPreviewHandleRef.current = null;
      serverVideoPreviewRawTrackRef.current?.stop();
      serverVideoPreviewRawTrackRef.current = null;
      setServerVideoPreviewStream(null);
    };

    const shouldPreviewVideo = appMenuOpen && serverMenuTab === "video" && canManageAudioQuality;
    if (!shouldPreviewVideo || !navigator.mediaDevices?.getUserMedia) {
      stopServerVideoPreview();
      return;
    }

    let cancelled = false;
    stopServerVideoPreview();

    const [widthRaw, heightRaw] = serverVideoResolution.split("x");
    const width = Math.max(1, Number(widthRaw) || 320);
    const height = Math.max(1, Number(heightRaw) || 240);

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            width: { ideal: width },
            height: { ideal: height },
            frameRate: { ideal: serverVideoFps },
            ...(selectedVideoInputId && selectedVideoInputId !== "default"
              ? { deviceId: { exact: selectedVideoInputId } }
              : {})
          }
        });
        const sourceTrack = stream.getVideoTracks()[0];
        stream.getAudioTracks().forEach((track) => track.stop());

        if (!sourceTrack) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (cancelled) {
          sourceTrack.stop();
          return;
        }

        if (serverVideoEffectType === "none") {
          serverVideoPreviewRawTrackRef.current = sourceTrack;
          setServerVideoPreviewStream(new MediaStream([sourceTrack]));
          return;
        }

        const processedHandle = createProcessedVideoTrack(sourceTrack, {
          width,
          height,
          fps: serverVideoFps,
          effectType: serverVideoEffectType,
          strength: serverVideoPixelFxStrength,
          pixelSize: serverVideoPixelFxPixelSize,
          gridThickness: serverVideoPixelFxGridThickness,
          asciiCellSize: serverVideoAsciiCellSize,
          asciiContrast: serverVideoAsciiContrast,
          asciiColor: serverVideoAsciiColor
        });

        if (!processedHandle) {
          setServerVideoPreviewStream(null);
          return;
        }

        if (cancelled) {
          processedHandle.stop();
          return;
        }

        serverVideoPreviewHandleRef.current = processedHandle;
        setServerVideoPreviewStream(new MediaStream([processedHandle.track]));
      } catch {
        if (!cancelled) {
          setServerVideoPreviewStream(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      stopServerVideoPreview();
    };
  }, [
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
  ]);

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

  const currentRoomScreenShareOwner = useMemo(() => {
    return screenShareOwnerByRoomSlug[roomSlug] || { userId: null, userName: null };
  }, [screenShareOwnerByRoomSlug, roomSlug]);

  const normalizedCurrentUserId = useMemo(() => String(user?.id || "").trim(), [user?.id]);
  const normalizedScreenShareOwnerUserId = useMemo(
    () => String(currentRoomScreenShareOwner.userId || "").trim(),
    [currentRoomScreenShareOwner.userId]
  );
  const isCurrentUserScreenShareOwner = Boolean(
    normalizedCurrentUserId
    && normalizedScreenShareOwnerUserId
    && normalizedCurrentUserId === normalizedScreenShareOwnerUserId
  );
  const canToggleScreenShare = Boolean(
    currentRoomKind !== "text"
    && roomVoiceConnected
    && (!normalizedScreenShareOwnerUserId || isCurrentUserScreenShareOwner)
  );

  const activeScreenShare = useMemo(() => {
    const localUserId = String(user?.id || "").trim();
    if (isLocalScreenSharing && localScreenShareStream) {
      return {
        stream: localScreenShareStream,
        ownerUserId: localUserId || "local",
        ownerLabel: user?.name || t("video.you"),
        local: true
      };
    }

    const ownerUserId = String(currentRoomScreenShareOwner.userId || "").trim();
    if (!ownerUserId) {
      return null;
    }

    const stream = remoteScreenShareStreamsByUserId[ownerUserId] || null;
    if (!stream) {
      return null;
    }

    return {
      stream,
      ownerUserId,
      ownerLabel: currentRoomScreenShareOwner.userName || remoteVideoLabelsByUserId[ownerUserId] || ownerUserId,
      local: false
    };
  }, [
    currentRoomScreenShareOwner.userId,
    currentRoomScreenShareOwner.userName,
    isLocalScreenSharing,
    localScreenShareStream,
    remoteScreenShareStreamsByUserId,
    remoteVideoLabelsByUserId,
    t,
    user?.id,
    user?.name
  ]);

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

  const normalizeIntInRange = useCallback((value: unknown, min: number, max: number): number | null => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return null;
    }

    return Math.max(min, Math.min(max, Math.round(numeric)));
  }, []);

  const normalizeAudioQuality = useCallback((value: unknown): AudioQuality | null | undefined => {
    if (value === null) {
      return null;
    }

    return value === "retro" || value === "low" || value === "standard" || value === "high"
      ? value
      : undefined;
  }, []);

  /** Applies video policy updates received from realtime events for non-admin clients. */
  const handleIncomingVideoPolicyState = useCallback((payload: {
    roomSlug?: unknown;
    settings?: {
      effectType?: unknown;
      resolution?: unknown;
      fps?: unknown;
      pixelFxStrength?: unknown;
      pixelFxPixelSize?: unknown;
      pixelFxGridThickness?: unknown;
      asciiCellSize?: unknown;
      asciiContrast?: unknown;
      asciiColor?: unknown;
      windowMinWidth?: unknown;
      windowMaxWidth?: unknown;
    };
  }) => {
    if (canManageAudioQuality) {
      return;
    }

    const payloadRoomSlug = String(payload.roomSlug || "").trim();
    if (payloadRoomSlug && payloadRoomSlug !== roomSlugRef.current) {
      return;
    }

    const settings = payload.settings;
    if (!settings) {
      return;
    }

    const effectType = String(settings.effectType || "").trim();
    if (effectType === "none" || effectType === "pixel8" || effectType === "ascii") {
      setServerVideoEffectType(effectType);
    }

    const resolution = String(settings.resolution || "").trim();
    if (resolution === "160x120" || resolution === "320x240" || resolution === "640x480") {
      setServerVideoResolution(resolution);
    }

    const fps = Number(settings.fps);
    if (fps === 10 || fps === 15 || fps === 24 || fps === 30) {
      setServerVideoFps(fps);
    }

    const pixelFxStrength = normalizeIntInRange(settings.pixelFxStrength, 0, 100);
    if (pixelFxStrength !== null) {
      setServerVideoPixelFxStrength(pixelFxStrength);
    }

    const pixelFxPixelSize = normalizeIntInRange(settings.pixelFxPixelSize, 2, 10);
    if (pixelFxPixelSize !== null) {
      setServerVideoPixelFxPixelSize(pixelFxPixelSize);
    }

    const pixelFxGridThickness = normalizeIntInRange(settings.pixelFxGridThickness, 1, 4);
    if (pixelFxGridThickness !== null) {
      setServerVideoPixelFxGridThickness(pixelFxGridThickness);
    }

    const asciiCellSize = normalizeIntInRange(settings.asciiCellSize, 4, 16);
    if (asciiCellSize !== null) {
      setServerVideoAsciiCellSize(asciiCellSize);
    }

    const asciiContrast = normalizeIntInRange(settings.asciiContrast, 60, 200);
    if (asciiContrast !== null) {
      setServerVideoAsciiContrast(asciiContrast);
    }

    const asciiColor = String(settings.asciiColor || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(asciiColor)) {
      setServerVideoAsciiColor(asciiColor);
    }

    const minWidth = normalizeIntInRange(settings.windowMinWidth, 80, 300);
    const maxWidthBase = normalizeIntInRange(settings.windowMaxWidth, 120, 480);
    if (minWidth !== null || maxWidthBase !== null) {
      const nextMinWidth = minWidth ?? serverVideoWindowMinWidth;
      const nextMaxWidth = Math.max(maxWidthBase ?? serverVideoWindowMaxWidth, nextMinWidth);
      setServerVideoWindowMinWidth(nextMinWidth);
      setServerVideoWindowMaxWidth(nextMaxWidth);
    }
  }, [
    canManageAudioQuality,
    normalizeIntInRange,
    roomSlugRef,
    serverVideoWindowMaxWidth,
    serverVideoWindowMinWidth
  ]);

  const handleIncomingVideoState = useCallback((payload: {
    fromUserId?: string;
    fromUserName?: string;
    roomSlug?: string;
    settings?: Record<string, unknown>;
  }) => {
    const fromUserId = String(payload.fromUserId || "").trim();
    const payloadRoomSlug = String(payload.roomSlug || "").trim();
    const localVideoEnabled = payload.settings?.localVideoEnabled;
    if (fromUserId && typeof localVideoEnabled === "boolean" && (!payloadRoomSlug || payloadRoomSlug === roomSlugRef.current)) {
      setVoiceCameraEnabledByUserIdInCurrentRoom((prev) => ({
        ...prev,
        [fromUserId]: localVideoEnabled
      }));
    }

    handleIncomingRtcVideoState(payload);
    handleIncomingVideoPolicyState(payload);
  }, [handleIncomingRtcVideoState, handleIncomingVideoPolicyState]);

  const handleIncomingMicState = useCallback((payload: {
    fromUserId?: string;
    muted?: boolean;
    speaking?: boolean;
    audioMuted?: boolean;
  }) => {
    const fromUserId = String(payload.fromUserId || "").trim();
    if (!fromUserId) {
      return;
    }

    setVoiceInitialMicStateByUserIdInCurrentRoom((prev) => {
      const muted = payload.muted === true;
      const speaking = payload.speaking === true;
      const nextState: "muted" | "silent" | "speaking" = muted ? "muted" : speaking ? "speaking" : "silent";
      if (prev[fromUserId] === nextState) {
        return prev;
      }
      return {
        ...prev,
        [fromUserId]: nextState
      };
    });

    if (typeof payload.audioMuted === "boolean") {
      setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom((prev) => {
        if (prev[fromUserId] === payload.audioMuted) {
          return prev;
        }
        return {
          ...prev,
          [fromUserId]: payload.audioMuted
        };
      });
    }

  }, []);

  const handleIncomingInitialCallState = useCallback((payload: {
    roomSlug?: string;
    participants?: Array<{
      userId?: string;
      userName?: string;
      mic?: {
        muted?: boolean;
        speaking?: boolean;
        audioMuted?: boolean;
      };
      video?: {
        localVideoEnabled?: boolean;
      };
    }>;
  }) => {
    const payloadRoomSlug = String(payload.roomSlug || "").trim();
    if (payloadRoomSlug && payloadRoomSlug !== roomSlugRef.current) {
      return;
    }

    const participants = Array.isArray(payload.participants) ? payload.participants : [];
    const nextMicState: Record<string, "muted" | "silent" | "speaking"> = {};
    const nextAudioMutedState: Record<string, boolean> = {};
    const nextCameraState: Record<string, boolean> = {};

    participants.forEach((participant) => {
      const userId = String(participant?.userId || "").trim();
      if (!userId) {
        return;
      }

      const micMuted = participant?.mic?.muted === true;
      const micSpeaking = participant?.mic?.speaking === true;
      nextMicState[userId] = micMuted ? "muted" : micSpeaking ? "speaking" : "silent";
      nextAudioMutedState[userId] = participant?.mic?.audioMuted === true;
      nextCameraState[userId] = participant?.video?.localVideoEnabled === true;
    });

    setVoiceInitialMicStateByUserIdInCurrentRoom(nextMicState);
    setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom(nextAudioMutedState);
    // Initial state should replace previous snapshot for this room to avoid stale ghost entries.
    setVoiceCameraEnabledByUserIdInCurrentRoom(nextCameraState);
  }, []);

  /** Syncs audio-quality updates from realtime into top-level room state stores. */
  const handleAudioQualityUpdated = useCallback((payload: {
    scope?: unknown;
    audioQuality?: unknown;
    roomId?: unknown;
    audioQualityOverride?: unknown;
  }) => {
    const scope = String(payload.scope || "").trim();

    if (scope === "server") {
      const nextAudioQuality = normalizeAudioQuality(payload.audioQuality);
      if (nextAudioQuality && nextAudioQuality !== null) {
        setServerAudioQuality(nextAudioQuality);
      }
      return;
    }

    if (scope !== "room") {
      return;
    }

    const roomId = String(payload.roomId || "").trim();
    if (!roomId) {
      return;
    }

    const normalizedOverride = normalizeAudioQuality(payload.audioQualityOverride);
    if (typeof normalizedOverride === "undefined") {
      return;
    }

    setRooms((prev) => prev.map((room) => (room.id === roomId ? { ...room, audio_quality_override: normalizedOverride } : room)));
    setRoomsTree((prev) => {
      if (!prev) {
        return prev;
      }

      const patchRoom = (room: Room) => (room.id === roomId ? { ...room, audio_quality_override: normalizedOverride } : room);

      return {
        ...prev,
        categories: (prev.categories || []).map((category) => ({
          ...category,
          channels: (category.channels || []).map(patchRoom)
        })),
        uncategorized: (prev.uncategorized || []).map(patchRoom)
      };
    });
  }, [normalizeAudioQuality]);

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

  /** Clears all session-bound client state when auth token is absent/invalid. */
  const resetSessionState = useCallback(() => {
    setUser(null);
    setRooms([]);
    setRoomsTree(null);
    setMessages([]);
    setChatText("");
    setPendingChatImageDataUrl(null);
    setMessagesHasMore(false);
    setMessagesNextCursor(null);
    setLoadingOlderMessages(false);
    setAdminUsers([]);
    setRoomsPresenceBySlug({});
    setRoomsPresenceDetailsBySlug({});
    setRoomMediaTopologyBySlug({});
    setVoiceCameraEnabledByUserIdInCurrentRoom({});
    setVoiceInitialMicStateByUserIdInCurrentRoom({});
    setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom({});
    setTelemetrySummary(null);
    setServerAudioQuality("standard");
    setServerAudioQualitySaving(false);
    realtimeClientRef.current?.dispose();
    realtimeClientRef.current = null;
  }, []);

  /** Loads session bootstrap data after token is set and persists the token locally. */
  const bootstrapSessionState = useCallback((nextToken: string) => {
    localStorage.setItem("boltorezka_token", nextToken);

    api.me(nextToken)
      .then((res) => setUser(res.user))
      .catch(() => {
        setToken("");
        localStorage.removeItem("boltorezka_token");
      });

    api.rooms(nextToken)
      .then((res) => setRooms(res.rooms))
      .catch((error) => pushLog(`rooms failed: ${error.message}`));

    api.serverAudioQuality(nextToken)
      .then((res) => setServerAudioQuality(res.audioQuality))
      .catch((error) => pushLog(`server audio quality failed: ${error.message}`));

    api.serverChatImagePolicy(nextToken)
      .then((res) => {
        setServerChatImagePolicy({
          maxDataUrlLength: Math.max(8000, Math.min(250000, Math.round(Number(res.maxDataUrlLength) || DEFAULT_CHAT_IMAGE_DATA_URL_LENGTH))),
          maxImageSide: Math.max(256, Math.min(4096, Math.round(Number(res.maxImageSide) || DEFAULT_CHAT_IMAGE_MAX_SIDE))),
          jpegQuality: Math.max(0.3, Math.min(0.95, Number(res.jpegQuality) || DEFAULT_CHAT_IMAGE_QUALITY))
        });
      })
      .catch((error) => pushLog(`server chat image policy failed: ${error.message}`));

    void roomAdminController.loadRoomTree(nextToken);
  }, [pushLog, roomAdminController]);

  useEffect(() => {
    if (!token) {
      resetSessionState();
      return;
    }

    bootstrapSessionState(token);
  }, [bootstrapSessionState, resetSessionState, token]);

  useEffect(() => () => {
    pendingWsRequestResolversRef.current.forEach((pending) => {
      window.clearTimeout(pending.timeoutId);
      pending.reject(new Error("ws_disposed"));
    });
    pendingWsRequestResolversRef.current.clear();
  }, []);

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
    onAck: ({ requestId }) => {
      const pending = pendingWsRequestResolversRef.current.get(requestId);
      if (!pending) {
        return;
      }

      pendingWsRequestResolversRef.current.delete(requestId);
      pending.resolve();
    },
    onNack: ({ requestId, eventType, code, message }) => {
      const pending = pendingWsRequestResolversRef.current.get(requestId);
      if (!pending) {
        return;
      }

      pendingWsRequestResolversRef.current.delete(requestId);
      pending.reject(new Error(`${eventType}:${code}:${message}`));
    },
    onScreenShareState: (payload) => {
      const targetRoomSlug = String(payload.roomSlug || "").trim();
      if (!targetRoomSlug) {
        return;
      }

      setScreenShareOwnerByRoomSlug((prev) => ({
        ...prev,
        [targetRoomSlug]: {
          userId: payload.active ? (payload.ownerUserId ?? null) : null,
          userName: payload.active ? (payload.ownerUserName ?? null) : null
        }
      }));
    },
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
      setRoomMediaTopologyBySlug({});
      setScreenShareOwnerByRoomSlug({});
      setVoiceInitialMicStateByUserIdInCurrentRoom({});
      setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom({});
      return;
    }

    void loadTelemetrySummary();
  }, [wsState, loadTelemetrySummary]);

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

  const joinRoom = (slug: string) => {
    roomAdminController.joinRoom(slug);
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

  const kickRoomMember = (targetRoomSlug: string, targetUserId: string, targetUserName: string) => {
    if (!targetRoomSlug || !targetUserId || !canCreateRooms) {
      return;
    }

    const requestId = sendWsEvent(
      "room.kick",
      {
        roomSlug: targetRoomSlug,
        targetUserId
      },
      { maxRetries: 1 }
    );

    if (!requestId) {
      pushToast(t("toast.serverError"));
      return;
    }

    pushLog(`kick requested: ${targetUserName || targetUserId} from #${targetRoomSlug}`);
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

  const handleToggleAudio = useCallback(() => {
    setAudioMuted((value) => {
      const nextMuted = !value;
      if (nextMuted) {
        setMicMuted(true);
      }
      return nextMuted;
    });
  }, []);

  const handleToggleScreenShare = useCallback(async () => {
    if (!token || !roomSlug || currentRoomKind === "text" || !roomVoiceConnected) {
      pushToast(t("call.autoWaiting"));
      return;
    }

    const localUserId = String(user?.id || "").trim();
    const ownerUserId = String(currentRoomScreenShareOwner.userId || "").trim();

    if (isLocalScreenSharing) {
      try {
        await stopLocalScreenShare();
      } finally {
        try {
          await sendWsEventAwaitAck("screen.share.stop", { roomSlug }, { maxRetries: 1 });
        } catch {
          return;
        }
      }
      return;
    }

    if (ownerUserId && ownerUserId !== localUserId) {
      const ownerName = currentRoomScreenShareOwner.userName || ownerUserId;
      pushToast(`Screen share is already active: ${ownerName}`);
      return;
    }

    try {
      await sendWsEventAwaitAck("screen.share.start", { roomSlug }, { maxRetries: 1 });
      await startLocalScreenShare();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error || "");
      if (text.includes("ScreenShareAlreadyActive")) {
        pushToast("Screen share is already active in this room");
      } else if (text.includes("NotAllowedError") || text.includes("Permission denied")) {
        pushToast("Screen share permission denied");
      } else {
        pushToast("Failed to start screen share");
      }

      try {
        await sendWsEventAwaitAck("screen.share.stop", { roomSlug }, { maxRetries: 1 });
      } catch {
        return;
      }
    }
  }, [
    currentRoomScreenShareOwner.userId,
    currentRoomScreenShareOwner.userName,
    currentRoomKind,
    isLocalScreenSharing,
    roomSlug,
    roomVoiceConnected,
    sendWsEventAwaitAck,
    startLocalScreenShare,
    stopLocalScreenShare,
    t,
    token,
    user?.id,
    pushToast
  ]);

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
  const videoInputOptions = videoInputDevices.length > 0 ? videoInputDevices : [{ id: "default", label: t("video.systemCamera") }];
  const currentInputLabel = inputOptions.find((device) => device.id === selectedInputId)?.label ?? inputOptions[0]?.label ?? t("device.systemDefault");
  const inputProfileLabel = selectedInputProfile === "noise_reduction"
    ? t("settings.voiceIsolation")
    : selectedInputProfile === "studio"
      ? t("settings.studio")
      : t("settings.custom");
  const noiseSuppressionEnabled = selectedInputProfile === "noise_reduction";

  const handleToggleNoiseSuppression = useCallback(() => {
    setSelectedInputProfile((current) => (current === "noise_reduction" ? "custom" : "noise_reduction"));
  }, []);

  const currentRoomSupportsRtc = currentRoom ? currentRoom.kind !== "text" : false;

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

  useEffect(() => {
    if (!roomVoiceConnected || !currentRoomSupportsRtc) {
      lastBroadcastMicStateRef.current = "";
      return;
    }

    const speaking = !micMuted && micTestLevel >= 0.055;
    const signature = `${micMuted ? 1 : 0}:${speaking ? 1 : 0}`;
    if (lastBroadcastMicStateRef.current === signature) {
      return;
    }

    const requestId = sendWsEvent(
      "call.mic_state",
      {
        muted: micMuted,
        speaking,
        audioMuted
      },
      { maxRetries: 1 }
    );

    if (requestId) {
      lastBroadcastMicStateRef.current = signature;
    }
  }, [audioMuted, currentRoomSupportsRtc, micMuted, micTestLevel, roomVoiceConnected, sendWsEvent]);

  useEffect(() => {
    if (!isLocalScreenSharing || !localScreenShareStream || !roomSlug) {
      return;
    }

    const track = localScreenShareStream.getVideoTracks()[0];
    if (!track) {
      return;
    }

    const onEnded = () => {
      void stopLocalScreenShare();
      void sendWsEventAwaitAck("screen.share.stop", { roomSlug }, { maxRetries: 1 }).catch(() => undefined);
    };

    track.addEventListener("ended", onEnded);
    return () => {
      track.removeEventListener("ended", onEnded);
    };
  }, [isLocalScreenSharing, localScreenShareStream, roomSlug, sendWsEventAwaitAck, stopLocalScreenShare]);

  useEffect(() => {
    if (roomVoiceConnected || !isLocalScreenSharing || !roomSlug) {
      return;
    }

    void stopLocalScreenShare();
    void sendWsEventAwaitAck("screen.share.stop", { roomSlug }, { maxRetries: 1 }).catch(() => undefined);
  }, [isLocalScreenSharing, roomSlug, roomVoiceConnected, sendWsEventAwaitAck, stopLocalScreenShare]);

  const userDockNode = user ? (
    <UserDock
      t={t}
      user={user}
      currentRoomSupportsRtc={currentRoomSupportsRtc}
      currentRoomSupportsVideo={currentRoomSupportsVideo}
      currentRoomTitle={currentRoom?.title || ""}
      callStatus={callStatus}
      localVoiceMediaStatusSummary={localVoiceMediaStatusSummary}
      lastCallPeer={lastCallPeer}
      roomVoiceConnected={roomVoiceConnected}
      screenShareActive={Boolean(currentRoomScreenShareOwner.userId)}
      screenShareOwnedByCurrentUser={isCurrentUserScreenShareOwner}
      canStartScreenShare={canToggleScreenShare}
      noiseSuppressionEnabled={noiseSuppressionEnabled}
      cameraEnabled={cameraEnabled}
      micMuted={micMuted}
      audioMuted={audioMuted}
      audioOutputMenuOpen={audioOutputMenuOpen}
      voiceSettingsOpen={voiceSettingsOpen}
      userSettingsOpen={userSettingsOpen}
      userSettingsTab={userSettingsTab}
      voiceSettingsPanel={voiceSettingsPanel}
      profileUsername={String(user.username || user.email.split("@")[0] || "")}
      profileNameDraft={profileNameDraft}
      profileEmail={user.email}
      profileSaving={profileSaving}
      profileStatusText={profileStatusText}
      selectedLang={lang}
      languageOptions={LANGUAGE_OPTIONS}
      inputOptions={inputOptions}
      outputOptions={outputOptions}
      videoInputOptions={videoInputOptions}
      selectedInputId={selectedInputId}
      selectedOutputId={selectedOutputId}
      selectedVideoInputId={selectedVideoInputId}
      selectedInputProfile={selectedInputProfile}
      inputProfileLabel={inputProfileLabel}
      currentInputLabel={currentInputLabel}
      micVolume={micVolume}
      outputVolume={outputVolume}
      serverSoundsMasterVolume={serverSoundSettings.masterVolume}
      serverSoundsEnabled={serverSoundSettings.enabledByEvent}
      micTestLevel={micTestLevel}
      mediaDevicesState={mediaDevicesState}
      mediaDevicesHint={mediaDevicesHint}
      audioOutputAnchorRef={audioOutputAnchorRef}
      voiceSettingsAnchorRef={voiceSettingsAnchorRef}
      userSettingsRef={userSettingsRef}
      onToggleMic={handleToggleMic}
      onToggleAudio={handleToggleAudio}
      onToggleCamera={() => {
        if (allowVideoStreaming && !cameraEnabled) {
          requestVideoAccess();
        }
        setCameraEnabled((value) => !value);
      }}
      onToggleScreenShare={() => {
        void handleToggleScreenShare();
      }}
      onToggleNoiseSuppression={handleToggleNoiseSuppression}
      onRequestVideoAccess={requestVideoAccess}
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
      onSetSelectedVideoInputId={setSelectedVideoInputId}
      onSetSelectedInputProfile={setSelectedInputProfile}
      onRefreshDevices={() => refreshDevices(true)}
      onRequestMediaAccess={requestMediaAccess}
      onSetMicVolume={setMicVolume}
      onSetOutputVolume={setOutputVolume}
      onSetServerSoundsMasterVolume={setServerSoundsMasterVolume}
      onSetServerSoundEnabled={setServerSoundEnabled}
      onPreviewServerSound={playServerSound}
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
      currentRoomSupportsVideo={currentRoomSupportsVideo}
      currentRoomTitle={currentRoom?.title || ""}
      callStatus={callStatus}
      localVoiceMediaStatusSummary={localVoiceMediaStatusSummary}
      lastCallPeer={lastCallPeer}
      roomVoiceConnected={roomVoiceConnected}
      screenShareActive={Boolean(currentRoomScreenShareOwner.userId)}
      screenShareOwnedByCurrentUser={isCurrentUserScreenShareOwner}
      canStartScreenShare={canToggleScreenShare}
      noiseSuppressionEnabled={noiseSuppressionEnabled}
      cameraEnabled={cameraEnabled}
      micMuted={micMuted}
      audioMuted={audioMuted}
      audioOutputMenuOpen={audioOutputMenuOpen}
      voiceSettingsOpen={voiceSettingsOpen}
      userSettingsOpen={userSettingsOpen}
      userSettingsTab={userSettingsTab}
      voiceSettingsPanel={voiceSettingsPanel}
      profileUsername={String(user.username || user.email.split("@")[0] || "")}
      profileNameDraft={profileNameDraft}
      profileEmail={user.email}
      profileSaving={profileSaving}
      profileStatusText={profileStatusText}
      selectedLang={lang}
      languageOptions={LANGUAGE_OPTIONS}
      inputOptions={inputOptions}
      outputOptions={outputOptions}
      videoInputOptions={videoInputOptions}
      selectedInputId={selectedInputId}
      selectedOutputId={selectedOutputId}
      selectedVideoInputId={selectedVideoInputId}
      selectedInputProfile={selectedInputProfile}
      inputProfileLabel={inputProfileLabel}
      currentInputLabel={currentInputLabel}
      micVolume={micVolume}
      outputVolume={outputVolume}
      serverSoundsMasterVolume={serverSoundSettings.masterVolume}
      serverSoundsEnabled={serverSoundSettings.enabledByEvent}
      micTestLevel={micTestLevel}
      mediaDevicesState={mediaDevicesState}
      mediaDevicesHint={mediaDevicesHint}
      audioOutputAnchorRef={audioOutputAnchorRef}
      voiceSettingsAnchorRef={voiceSettingsAnchorRef}
      userSettingsRef={userSettingsRef}
      onToggleMic={handleToggleMic}
      onToggleAudio={handleToggleAudio}
      onToggleCamera={() => {
        if (allowVideoStreaming && !cameraEnabled) {
          requestVideoAccess();
        }
        setCameraEnabled((value) => !value);
      }}
      onToggleScreenShare={() => {
        void handleToggleScreenShare();
      }}
      onToggleNoiseSuppression={handleToggleNoiseSuppression}
      onRequestVideoAccess={requestVideoAccess}
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
      onSetSelectedVideoInputId={setSelectedVideoInputId}
      onSetSelectedInputProfile={setSelectedInputProfile}
      onRefreshDevices={() => refreshDevices(true)}
      onRequestMediaAccess={requestMediaAccess}
      onSetMicVolume={setMicVolume}
      onSetOutputVolume={setOutputVolume}
      onSetServerSoundsMasterVolume={setServerSoundsMasterVolume}
      onSetServerSoundEnabled={setServerSoundEnabled}
      onPreviewServerSound={playServerSound}
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

      <div className={`workspace ${isMobileViewport ? "workspace-mobile" : ""} grid h-full min-h-0 items-stretch gap-4 min-[801px]:grid-cols-[320px_1fr] min-[801px]:gap-6`}>
        {(!isMobileViewport || mobileTab === "channels") ? (
          <aside className="leftcolumn flex min-h-0 flex-col gap-4 overflow-hidden min-[801px]:gap-6">
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
              composePreviewImageUrl={pendingChatImageDataUrl}
              chatLogRef={chatLogRef}
              onLoadOlderMessages={() => void loadOlderMessages()}
              onSetChatText={setChatText}
              onChatPaste={handleChatPaste}
              onChatInputKeyDown={handleChatInputKeyDown}
              onSendMessage={sendMessage}
              editingMessageId={editingMessageId}
              showVideoToggle={allowVideoStreaming}
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
          visible={allowVideoStreaming && videoWindowsVisible}
          speakingWindowIds={speakingVideoWindowIds}
        />

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
