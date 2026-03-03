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
  useRealtimeChatLifecycle,
  useRoomAdminActions,
  useRoomsDerived,
  useScreenWakeLock,
  useServerSounds,
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
import type { ServerVideoEffectType } from "./hooks/voiceCallTypes";
import { createProcessedVideoTrack, type OutgoingVideoTrackHandle } from "./utils/videoPixelPipeline";

const MAX_CHAT_RETRIES = 3;
const TOAST_AUTO_DISMISS_MS = 4500;
const TOAST_ID_RANDOM_RANGE = 10000;
const TOAST_DUPLICATE_THROTTLE_MS = 12000;
const TOAST_MAX_VISIBLE = 4;
const MAX_CHAT_IMAGE_DATA_URL_LENGTH = 18000;
const MAX_CHAT_IMAGE_MAX_SIDE = 1000;
const MAX_CHAT_IMAGE_QUALITY = 0.6;
const MESSAGE_EDIT_DELETE_WINDOW_MS = 10 * 60 * 1000;

type ServerMenuTab = "users" | "events" | "telemetry" | "call" | "sound" | "video";
type MobileTab = "channels" | "chat" | "settings";
type ServerVideoResolution = "160x120" | "320x240" | "640x480";

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
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
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
  const [serverVideoEffectType, setServerVideoEffectType] = useState<ServerVideoEffectType>(() => {
    const value = localStorage.getItem("boltorezka_server_video_effect_type");
    if (value === "none" || value === "pixel8" || value === "ascii") {
      return value;
    }
    const legacyEnabled = localStorage.getItem("boltorezka_server_video_fx_enabled") !== "0";
    return legacyEnabled ? "pixel8" : "none";
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
  const previousWsStateRef = useRef<"disconnected" | "connecting" | "connected">("disconnected");
  const previousPresenceRoomSlugRef = useRef<string>(roomSlug);
  const presenceSoundInitializedRef = useRef(false);
  const previousPresenceIdsRef = useRef<string[]>([]);
  const previousChatMessageIdRef = useRef<string | null>(null);
  const serverVideoPreviewHandleRef = useRef<OutgoingVideoTrackHandle | null>(null);
  const serverVideoPreviewRawTrackRef = useRef<MediaStreamTrack | null>(null);

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

  const {
    roomVoiceConnected,
    connectedPeerUserIds,
    connectingPeerUserIds,
    remoteMutedPeerUserIds,
    remoteSpeakingPeerUserIds,
    remoteAudioMutedPeerUserIds,
    localVideoStream,
    remoteVideoStreamsByUserId,
    connectRoom,
    disconnectRoom,
    handleIncomingSignal,
    handleIncomingTerminal,
    handleIncomingMicState,
    handleCallNack
  } = useVoiceCallRuntime({
    localUserId: user?.id || "",
    roomSlug,
    allowVideoStreaming,
    videoStreamingEnabled: cameraEnabled,
    roomVoiceTargets: currentRoomVoiceTargets,
    selectedInputId,
    selectedOutputId,
    selectedVideoInputId,
    serverVideoResolution,
    serverVideoFps,
    serverVideoEffectType,
    serverVideoPixelFxStrength,
    serverVideoPixelFxPixelSize,
    serverVideoPixelFxGridThickness,
    serverVideoAsciiCellSize,
    serverVideoAsciiContrast,
    serverVideoAsciiColor,
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

  const remoteVideoLabelsByUserId = useMemo(() => {
    const labels: Record<string, string> = {};
    currentRoomVoiceTargets.forEach((member) => {
      labels[member.userId] = member.userName || member.userId;
    });
    return labels;
  }, [currentRoomVoiceTargets]);

  useEffect(() => {
    if (!allowVideoStreaming) {
      setCameraEnabled(false);
      setVideoWindowsVisible(true);
    }
  }, [allowVideoStreaming]);

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
  }, [roomSlug]);

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
    onCallNack: handleCallNack,
    onAudioQualityUpdated: (payload) => {
      const scope = String(payload.scope || "").trim();

      if (scope === "server") {
        const nextAudioQuality = String(payload.audioQuality || "").trim();
        if (
          nextAudioQuality === "retro"
          || nextAudioQuality === "low"
          || nextAudioQuality === "standard"
          || nextAudioQuality === "high"
        ) {
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

      const rawOverride = payload.audioQualityOverride;
      const normalizedOverride: AudioQuality | null | undefined = rawOverride === null
        ? null
        : (rawOverride === "retro" || rawOverride === "low" || rawOverride === "standard" || rawOverride === "high")
          ? rawOverride
          : undefined;

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
      return;
    }

    void loadTelemetrySummary();
  }, [wsState, loadTelemetrySummary]);

  useEffect(() => {
    const prevState = previousWsStateRef.current;
    if (prevState === "connected" && wsState === "disconnected") {
      void playServerSound("server_disconnected");
    }

    previousWsStateRef.current = wsState;
  }, [wsState, playServerSound]);

  useEffect(() => {
    const currentMembers = roomsPresenceDetailsBySlug[roomSlug] || [];
    const currentIds = currentMembers
      .map((member) => String(member.userId || "").trim())
      .filter((userId) => userId.length > 0);

    if (previousPresenceRoomSlugRef.current !== roomSlug) {
      previousPresenceRoomSlugRef.current = roomSlug;
      previousPresenceIdsRef.current = currentIds;
      presenceSoundInitializedRef.current = true;
      return;
    }

    if (!presenceSoundInitializedRef.current) {
      presenceSoundInitializedRef.current = true;
      previousPresenceIdsRef.current = currentIds;
      return;
    }

    const prevIds = previousPresenceIdsRef.current;

    const myId = String(user?.id || "").trim();
    const prevSet = new Set(prevIds);
    const nextSet = new Set(currentIds);

    const joined = currentIds.some((id) => id !== myId && !prevSet.has(id));
    const left = prevIds.some((id) => id !== myId && !nextSet.has(id));

    if (joined) {
      void playServerSound("member_join");
    } else if (left) {
      void playServerSound("member_leave");
    }

    previousPresenceIdsRef.current = currentIds;
  }, [roomsPresenceDetailsBySlug, roomSlug, user?.id, playServerSound]);

  useEffect(() => {
    const latest = messages.length > 0 ? messages[messages.length - 1] : null;
    if (!latest) {
      previousChatMessageIdRef.current = null;
      return;
    }

    if (!previousChatMessageIdRef.current) {
      previousChatMessageIdRef.current = latest.id;
      return;
    }

    if (previousChatMessageIdRef.current !== latest.id) {
      if (latest.user_id !== user?.id) {
        void playServerSound("chat_message");
      }
      previousChatMessageIdRef.current = latest.id;
    }
  }, [messages, user?.id, playServerSound]);

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
          const scale = maxSide > MAX_CHAT_IMAGE_MAX_SIDE ? MAX_CHAT_IMAGE_MAX_SIDE / maxSide : 1;
          const targetWidth = Math.max(1, Math.round(originalWidth * scale));
          const targetHeight = Math.max(1, Math.round(originalHeight * scale));

          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("canvas_failed"));
            return;
          }

          context.drawImage(image, 0, 0, targetWidth, targetHeight);
          const compressed = canvas.toDataURL("image/jpeg", MAX_CHAT_IMAGE_QUALITY);
          resolve(compressed);
        };
        image.src = source;
      };

      reader.readAsDataURL(file);
    });
  }, []);

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

    const result = chatController.sendMessage(chatText, user, MAX_CHAT_RETRIES);
    if (result.sent) {
      setChatText("");
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
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        const screenshotName = `скриншот-${hh}-${mm}`;
        const markdown = `![${screenshotName}](${dataUrl})`;

        if (markdown.length > MAX_CHAT_IMAGE_DATA_URL_LENGTH) {
          pushToast(t("chat.imageTooLarge"));
          return;
        }

        setChatText((prev) => `${prev}${prev ? "\n" : ""}${markdown}`);
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

  const currentRoomSupportsRtc = currentRoom ? currentRoom.kind !== "text" : false;

  useAutoRoomVoiceConnection({
    currentRoomSupportsRtc,
    roomVoiceTargetsCount: currentRoomVoiceTargets.length,
    roomVoiceConnected,
    keepConnectedWithoutTargets: allowVideoStreaming && cameraEnabled,
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
      currentRoomSupportsVideo={currentRoomSupportsVideo}
      currentRoomTitle={currentRoom?.title || ""}
      callStatus={callStatus}
      lastCallPeer={lastCallPeer}
      roomVoiceConnected={roomVoiceConnected}
      cameraEnabled={cameraEnabled}
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
      onToggleAudio={() => {
        setAudioMuted((value) => {
          const nextMuted = !value;
          if (nextMuted) {
            setMicMuted(true);
          }
          return nextMuted;
        });
      }}
      onToggleCamera={() => {
        if (!allowVideoStreaming) {
          return;
        }
        if (!cameraEnabled) {
          requestVideoAccess();
        }
        setCameraEnabled((value) => !value);
      }}
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
      lastCallPeer={lastCallPeer}
      roomVoiceConnected={roomVoiceConnected}
      cameraEnabled={cameraEnabled}
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
      onToggleAudio={() => {
        setAudioMuted((value) => {
          const nextMuted = !value;
          if (nextMuted) {
            setMicMuted(true);
          }
          return nextMuted;
        });
      }}
      onToggleCamera={() => {
        if (!allowVideoStreaming) {
          return;
        }
        if (!cameraEnabled) {
          requestVideoAccess();
        }
        setCameraEnabled((value) => !value);
      }}
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
          localUserLabel={user?.name || t("video.you")}
          localVideoStream={localVideoStream}
          remoteVideoStreamsByUserId={remoteVideoStreamsByUserId}
          remoteLabelsByUserId={remoteVideoLabelsByUserId}
          minWidth={Math.min(serverVideoWindowMinWidth, serverVideoWindowMaxWidth)}
          maxWidth={Math.max(serverVideoWindowMinWidth, serverVideoWindowMaxWidth)}
          visible={allowVideoStreaming && videoWindowsVisible}
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
