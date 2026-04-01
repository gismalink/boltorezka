import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "./api";
import {
  RealtimeClient,
  WsMessageController
} from "./services";
import type { CallStatus } from "./services";
import {
  AppShellLayout
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
import {
  useAppCoreState,
  useAppUiState,
  useAppEntryGatesState,
  useAppMediaDeviceRuntime,
  useAppMainSectionInput,
  useAppModerationActions,
  useAppOverlaysSectionInput,
  useAppRealtimeChatRuntime,
  useAppPermissionsAndLocale,
  useAppRoomsAndServerDerived,
  useAppShellRuntime,
  useAppWorkspaceActionsRuntime,
  useAppUserDockSharedProps,
  useAppUserMediaState,
  useAppWorkspacePanelsRuntime,
  useAppControllers,
  useAppShellLifecycleEffects,
  useAppPopupOutsideClose,
  useAdminUsersSync,
  useAutoRoomVoiceConnection,
  useAppEventLogs,
  useAuthProfileFlow,
  useDeletedAccountActions,
  useBuildVersionSync,
  useDesktopHandoffState,
  useDesktopUpdateFlow,
  useInviteAcceptanceFlow,
  usePendingAccessAutoRefresh,
  useOnboardingOverlayActions,
  useRoomSlugPersistence,
  useServerDataSync,
  useServerVideoWindowBounds,
  useSessionStateLifecycle,
  useTelemetryRefresh,
  useCollapsedCategories,
  useCurrentRoomSnapshot,
  useRnnoiseRuntimeHandlers,
  usePersistedClientSettings,
  useRealtimeSoundEffects,
  useChatTypingController,
  useRealtimeConnectionReset,
  useRealtimeIncomingCallState,
  useScreenShareOrchestrator,
  useWsEventAcks,
  useRoomMediaCapabilities,
  useRoomEditorState,
  useRoomSelectionGuard,
  useRoomsDerived,
  useScreenWakeLock,
  useServerVideoPreview,
  useServerSounds,
  useServerMenuAccessGuard,
  useToastQueue,
  useLivekitVoiceRuntime,
  useVoiceMediaUiMaps,
  useVoiceRoomLifecycleEffects,
  useVoiceSignalingOrchestrator,
  useVoiceParticipantsDerived,
  useVoiceRoomStateMaps,
  useVoiceUiLifecycleEffects
} from "./hooks";
import { formatBuildDateLabel } from "./utils/appShell";
import type { Message, RoomKind } from "./domain";

const CLIENT_BUILD_VERSION = String(import.meta.env.VITE_APP_VERSION || "").trim();
const CLIENT_BUILD_SHA = String(import.meta.env.VITE_APP_BUILD_SHA || CLIENT_BUILD_VERSION || "").trim();
const CLIENT_BUILD_DATE = String(import.meta.env.VITE_APP_BUILD_DATE || "").trim();
const CLIENT_BUILD_DATE_LABEL = formatBuildDateLabel(CLIENT_BUILD_VERSION, CLIENT_BUILD_DATE);
const CHAT_TYPING_TTL_MS = 4500;
const CHAT_TYPING_PING_INTERVAL_MS = 1800;
const COOKIE_CONSENT_KEY = "boltorezka_cookie_consent_v1";
const CURRENT_SERVER_ID_STORAGE_KEY = "boltorezka_current_server_id";
const ROOM_SLUG_STORAGE_KEY = "boltorezka_room_slug";

// IMPORTANT: `App` is an orchestration boundary only.
// Do not add new business logic, parsing, transport rules, or large feature workflows here.
// Put feature logic into dedicated hooks/services/components and keep this file as glue code.
export function App() {
  const {
    token, setToken,
    user, setUser,
    authMode, setAuthMode,
    rooms, setRooms,
    roomsTree, setRoomsTree,
    archivedRooms, setArchivedRooms,
    roomSlug, setRoomSlug,
    chatRoomSlug, setChatRoomSlug,
    showAppUpdatedOverlay, setShowAppUpdatedOverlay,
    cookieConsentAccepted, setCookieConsentAccepted,
    pendingAccessRefreshInSec, setPendingAccessRefreshInSec,
    showFirstRunIntro, setShowFirstRunIntro,
    sessionMovedOverlayMessage, setSessionMovedOverlayMessage,
    messages, setMessages,
    messagesHasMore, setMessagesHasMore,
    messagesNextCursor, setMessagesNextCursor,
    loadingOlderMessages, setLoadingOlderMessages,
    chatText, setChatText,
    pendingChatImageDataUrl, setPendingChatImageDataUrl,
    editingMessageId, setEditingMessageId,
    callStatus, setCallStatus,
    lastCallPeer, setLastCallPeer,
    roomsPresenceBySlug, setRoomsPresenceBySlug,
    roomsPresenceDetailsBySlug, setRoomsPresenceDetailsBySlug,
    memberPreferencesByUserId, setMemberPreferencesByUserId,
    roomMediaTopologyBySlug, setRoomMediaTopologyBySlug,
    servers, setServers,
    serversLoading, setServersLoading,
    currentServerId, setCurrentServerId,
    creatingServer, setCreatingServer,
    serverMembers, setServerMembers,
    serverMembersLoading, setServerMembersLoading,
    lastInviteUrl, setLastInviteUrl,
    creatingInvite, setCreatingInvite,
    serverAgeLoading, setServerAgeLoading,
    serverAgeConfirmedAt, setServerAgeConfirmedAt,
    serverAgeConfirming, setServerAgeConfirming,
    ageGateBlockedRoomSlug, setAgeGateBlockedRoomSlug,
    pendingInviteToken, setPendingInviteToken,
    inviteAccepting, setInviteAccepting,
    telemetrySummary, setTelemetrySummary,
    wsState, setWsState,
    adminUsers, setAdminUsers,
    adminServers, setAdminServers,
    adminServersLoading, setAdminServersLoading,
    selectedAdminServerId, setSelectedAdminServerId,
    adminServerOverview, setAdminServerOverview,
    adminServerOverviewLoading, setAdminServerOverviewLoading
  } = useAppCoreState({
    versionUpdatePendingKey: VERSION_UPDATE_PENDING_KEY,
    cookieConsentKey: COOKIE_CONSENT_KEY,
    currentServerIdStorageKey: CURRENT_SERVER_ID_STORAGE_KEY,
    pendingAccessAutoRefreshSec: PENDING_ACCESS_AUTO_REFRESH_SEC
  });
  const {
    newRoomSlug, setNewRoomSlug,
    newRoomTitle, setNewRoomTitle,
    newRoomKind, setNewRoomKind,
    newRoomCategoryId, setNewRoomCategoryId,
    newCategorySlug, setNewCategorySlug,
    newCategoryTitle, setNewCategoryTitle,
    categoryPopupOpen, setCategoryPopupOpen,
    channelPopupOpen, setChannelPopupOpen,
    categorySettingsPopupOpenId, setCategorySettingsPopupOpenId,
    editingCategoryTitle, setEditingCategoryTitle,
    channelSettingsPopupOpenId, setChannelSettingsPopupOpenId,
    editingRoomTitle, setEditingRoomTitle,
    editingRoomKind, setEditingRoomKind,
    editingRoomCategoryId, setEditingRoomCategoryId,
    editingRoomNsfw, setEditingRoomNsfw,
    editingRoomAudioQualitySetting,
    setEditingRoomAudioQualitySetting
  } = useRoomEditorState();
  const {
    micMuted, setMicMuted,
    audioMuted, setAudioMuted,
    lang, setLang,
    selectedUiTheme, setSelectedUiTheme,
    profileNameDraft, setProfileNameDraft,
    profileStatusText, setProfileStatusText,
    deleteAccountPending, setDeleteAccountPending,
    deleteAccountStatusText, setDeleteAccountStatusText,
    deletedAccountInfo, setDeletedAccountInfo,
    restoreDeletedAccountPending, setRestoreDeletedAccountPending,
    rnnoiseRuntimeStatus, setRnnoiseRuntimeStatus,
    profileSaving, setProfileSaving,
    inputDevices, setInputDevices,
    outputDevices, setOutputDevices,
    videoInputDevices, setVideoInputDevices,
    selectedInputId, setSelectedInputId,
    selectedOutputId, setSelectedOutputId,
    selectedVideoInputId, setSelectedVideoInputId,
    cameraEnabled, setCameraEnabled,
    screenShareOwnerByRoomSlug, setScreenShareOwnerByRoomSlug,
    voiceCameraEnabledByUserIdInCurrentRoom, setVoiceCameraEnabledByUserIdInCurrentRoom,
    voiceInitialMicStateByUserIdInCurrentRoom, setVoiceInitialMicStateByUserIdInCurrentRoom,
    voiceInitialAudioOutputMutedByUserIdInCurrentRoom, setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom,
    selectedInputProfile, setSelectedInputProfile,
    rnnoiseSuppressionLevel, setRnnoiseSuppressionLevel,
    preRnnEchoCancellationEnabled, setPreRnnEchoCancellationEnabled,
    preRnnAutoGainControlEnabled, setPreRnnAutoGainControlEnabled,
    selfMonitorEnabled, setSelfMonitorEnabled,
    mediaDevicesState, setMediaDevicesState,
    mediaDevicesHint, setMediaDevicesHint,
    micVolume, setMicVolume,
    outputVolume, setOutputVolume,
    micTestLevel, setMicTestLevel,
    serverAudioQuality, setServerAudioQuality,
    serverAudioQualitySaving, setServerAudioQualitySaving,
    serverChatImagePolicy, setServerChatImagePolicy,
    serverVideoEffectType, setServerVideoEffectType,
    serverVideoResolution, setServerVideoResolution,
    serverVideoFps, setServerVideoFps,
    serverScreenShareResolution, setServerScreenShareResolution,
    serverVideoPixelFxStrength, setServerVideoPixelFxStrength,
    serverVideoPixelFxPixelSize, setServerVideoPixelFxPixelSize,
    serverVideoPixelFxGridThickness, setServerVideoPixelFxGridThickness,
    serverVideoAsciiCellSize, setServerVideoAsciiCellSize,
    serverVideoAsciiContrast, setServerVideoAsciiContrast,
    serverVideoAsciiColor, setServerVideoAsciiColor,
    serverVideoWindowMinWidth, setServerVideoWindowMinWidth,
    serverVideoWindowMaxWidth, setServerVideoWindowMaxWidth
  } = useAppUserMediaState();
  const [realtimeReconnectNonce, setRealtimeReconnectNonce] = useState(0);
  const {
    audioOutputMenuOpen, setAudioOutputMenuOpen,
    voiceSettingsOpen, setVoiceSettingsOpen,
    userSettingsOpen, setUserSettingsOpen,
    userSettingsTab, setUserSettingsTab,
    voiceSettingsPanel, setVoiceSettingsPanel,
    authMenuOpen, setAuthMenuOpen,
    profileMenuOpen, setProfileMenuOpen,
    appMenuOpen, setAppMenuOpen,
    serverMenuTab, setServerMenuTab,
    isMobileViewport, setIsMobileViewport,
    mobileTab, setMobileTab,
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

  const {
    canCreateRooms,
    canManageUsers,
    canPromote,
    canUseService,
    serviceToken,
    canManageAudioQuality,
    canManageServerControlPlane,
    canViewTelemetry,
    pendingJoinRequestsCount,
    locale,
    t
  } = useAppPermissionsAndLocale({
    token,
    user,
    servers,
    currentServerId,
    adminUsers,
    lang,
    pushToast
  });
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

  const {
    currentRoomVoiceTargets,
    memberVolumeByUserId,
    remoteVideoLabelsByUserId,
    videoPolicyAudienceKey
  } = useVoiceParticipantsDerived({
    roomsPresenceDetailsBySlug,
    roomSlug,
    currentUserId: user?.id || "",
    memberPreferencesByUserId
  });

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
  const { handleRnnoiseStatusChange, handleRnnoiseFallback } = useRnnoiseRuntimeHandlers({
    selectedInputProfile,
    setSelectedInputProfile,
    setRnnoiseRuntimeStatus,
    pushToast,
    t
  });

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

  useVoiceRoomLifecycleEffects({
    roomSlug,
    currentRoomSnapshot,
    allowVideoStreaming,
    setCameraEnabled,
    setVideoWindowsVisible,
    setVoiceCameraEnabledByUserIdInCurrentRoom,
    setVoiceInitialMicStateByUserIdInCurrentRoom,
    setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom
  });

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

  const {
    speakingVideoWindowIds,
    effectiveVoiceCameraEnabledByUserIdInCurrentRoom,
    voiceMediaStatusSummaryByUserIdInCurrentRoom
  } = useVoiceMediaUiMaps({
    currentRoomVoiceTargets,
    remoteSpeakingPeerUserIds,
    currentUserId: user?.id || "",
    voiceMicStateByUserIdInCurrentRoom,
    remoteVideoStreamsByUserId,
    roomVoiceConnected,
    allowVideoStreaming,
    cameraEnabled,
    voiceMediaStatusByPeerUserId,
    localVoiceMediaStatusSummary
  });

  const {
    authController,
    roomAdminController,
    loadTelemetrySummary,
    chatController
  } = useAppControllers({
    token,
    canViewTelemetry,
    pushLog,
    pushToast,
    sendWsEvent,
    sendRoomJoinEvent: (slug) => sendWsEventAwaitAck("room.join", { roomSlug: slug }, { maxRetries: 1 }),
    currentServerIdRef,
    setToken,
    setUser,
    setDeletedAccountInfo,
    setRoomSlug,
    setMessages,
    setMessagesHasMore,
    setMessagesNextCursor,
    setRooms,
    setRoomsTree,
    setArchivedRooms,
    setAdminUsers,
    setLoadingOlderMessages,
    setTelemetrySummary
  });

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

  const {
    restoreDeletedAccount,
    handleDeleteAccount
  } = useDeletedAccountActions({
    token,
    deleteAccountPending,
    restoreDeletedAccountPending,
    setDeleteAccountPending,
    setRestoreDeletedAccountPending,
    setDeleteAccountStatusText,
    setDeletedAccountInfo,
    setToken,
    setUser,
    pushToast,
    t
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
    setServerChatImagePolicy,
    setDeletedAccountInfo
  });

  const { loadOlderMessages } = useAppRealtimeChatRuntime({
    lifecycleCallbacks: {
      chatRoomSlug,
      roomSlugRef,
      realtimeClientRef,
      disconnectRoom,
      playServerSound,
      setRoomsPresenceBySlug,
      setRoomsPresenceDetailsBySlug,
      setRoomSlug,
      setChatTypingByRoomSlug,
      setSessionMovedOverlayMessage,
      pushLog,
      setMessages,
      setMessagesHasMore,
      setMessagesNextCursor,
      applyRemoteTypingPayload
    },
    realtimeChatLifecycleProps: {
      serviceToken,
      reconnectNonce: realtimeReconnectNonce,
      roomSlug,
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
      setRoomSlug,
      setRoomMediaTopologyBySlug,
      setRoomsPresenceBySlug,
      setRoomsPresenceDetailsBySlug,
      pushLog,
      pushCallLog,
      pushToast,
      markMessageDelivery,
      handleIncomingMicState,
      handleIncomingVideoState,
      handleIncomingInitialCallState,
      handleCallNack,
      handleAudioQualityUpdated,
      handleWsAck,
      handleWsNack,
      handleIncomingScreenShareState
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

  const { refreshDevices, requestMediaAccess, requestVideoAccess } = useAppMediaDeviceRuntime({
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
    setSelectedVideoInputId,
    hasUser: Boolean(user),
    roomVoiceConnected,
    voiceSettingsOpen,
    voiceSettingsPanel: voiceSettingsPanel || "",
    userSettingsOpen,
    userSettingsTab,
    pushToast,
    setMicTestLevel,
    selfMonitorEnabled,
    selectedInputProfile,
    rnnoiseSuppressionLevel
  });

  useAppPopupOutsideClose({
    profileMenuOpen,
    authMenuOpen,
    categoryPopupOpen,
    channelPopupOpen,
    channelSettingsPopupOpenId,
    categorySettingsPopupOpenId,
    audioOutputMenuOpen,
    voiceSettingsOpen,
    userSettingsOpen,
    setProfileMenuOpen,
    setAuthMenuOpen,
    setCategoryPopupOpen,
    setChannelPopupOpen,
    setChannelSettingsPopupOpenId,
    setCategorySettingsPopupOpenId,
    setAudioOutputMenuOpen,
    setVoiceSettingsOpen,
    setUserSettingsOpen,
    profileMenuRef,
    authMenuRef,
    categoryPopupRef,
    channelPopupRef,
    audioOutputAnchorRef,
    voiceSettingsAnchorRef,
    userSettingsRef
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
  const { currentServer, activeChatRoom } = useAppRoomsAndServerDerived({
    servers,
    currentServerId,
    allRooms,
    chatRoomSlug,
    roomSlug,
    setChatRoomSlug
  });

  useRoomSelectionGuard({
    allRooms,
    roomSlug,
    chatRoomSlug,
    setRoomSlug,
    setChatRoomSlug
  });

  const {
    joinRoom,
    leaveRoom,
    kickRoomMember,
    moveRoomMember,
    sendMessage,
    handleChatPaste,
    handleChatInputKeyDown,
    startEditingMessage,
    deleteOwnMessage,
    openRoomChat,
    saveMemberPreference,
    promote,
    demote,
    setUserBan,
    setUserAccessState,
    deleteUser,
    forceDeleteUserNow,
    setServerAudioQualityValue,
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
    handleTransferServerOwnership,
    handleToggleAdminServerBlocked,
    handleDeleteAdminServer,
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
  } = useAppWorkspaceActionsRuntime({
    roomChat: {
      roomPresence: {
        roomSlug,
        canCreateRooms,
        roomAdminController,
        disconnectRoom,
        sendWsEvent,
        pushToast,
        pushLog,
        t,
        setAgeGateBlockedRoomSlug,
        setRoomSlug,
        setChatRoomSlug
      },
      chatComposer: {
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
      }
    },
    moderation: {
      memberPreferences: {
        token,
        currentUserId: user?.id || "",
        roomsPresenceDetailsBySlug,
        setMemberPreferencesByUserId,
        pushLog,
        pushToast,
        t
      },
      serverModeration: {
        token,
        canManageUsers,
        canPromote,
        canManageAudioQuality,
        roomAdminController,
        pushLog,
        setServerAudioQuality,
        setServerAudioQualitySaving
      }
    },
    serverAdmin: {
      serverProfile: {
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
      },
      adminServer: {
        token,
        setAdminServers,
        setServers,
        setSelectedAdminServerId,
        setCurrentServerId,
        pushToast,
        t
      }
    },
    roomAdmin: {
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
      setMessagesNextCursor
    }
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

  const userDockSharedProps = useAppUserDockSharedProps({
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
    currentRoom,
    currentRoomSupportsRtc,
    currentRoomSupportsVideo,
    callStatus,
    localVoiceMediaStatusSummary,
    lastCallPeer,
    roomVoiceConnected,
    remoteAudioAutoplayBlocked,
    currentRoomScreenShareOwner,
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
    deleteAccountPending,
    deleteAccountStatusText,
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
    serverSoundSettings,
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
    handleDeleteAccount,
    handleConfirmServerAge,
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

  const {
    roomsPanelProps,
    serverProfileModalProps,
    chatPanelProps,
    videoWindowsOverlayProps
  } = useAppWorkspacePanelsRuntime({
    roomsPanel: {
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
      setCategoryPopupOpen,
      setChannelPopupOpen,
      setNewCategorySlug,
      setNewCategoryTitle,
      setNewRoomSlug,
      setNewRoomTitle,
      setNewRoomKind,
      setNewRoomCategoryId,
      setEditingCategoryTitle,
      setEditingRoomTitle,
      setEditingRoomKind,
      setEditingRoomCategoryId,
      setEditingRoomNsfw,
      setEditingRoomAudioQualitySetting,
      createCategory,
      createRoom,
      openCreateChannelPopup,
      openCategorySettingsPopup,
      openChannelSettingsPopup,
      saveCategorySettings,
      moveCategory,
      deleteCategory,
      saveChannelSettings,
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
    },
    serverProfileModal: {
      user,
      currentServer,
      canManageUsers,
      canPromote,
      canManageServerControlPlane,
      canViewTelemetry,
      canManageAudioQuality,
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
      normalizedServerVideoWindowMinWidth,
      normalizedServerVideoWindowMaxWidth,
      adminUsers,
      adminServers,
      adminServersLoading,
      selectedAdminServerId,
      adminServerOverview,
      adminServerOverviewLoading,
      currentServerId,
      servers,
      serverMembers,
      serverMembersLoading,
      lastInviteUrl,
      eventLog,
      telemetrySummary,
      callStatus,
      lastCallPeer,
      roomVoiceConnected,
      callEventLog,
      serverVideoPreviewStream,
      setAppMenuOpen,
      setServerMenuTab,
      promote,
      demote,
      setUserBan,
      setUserAccessState,
      deleteUser,
      forceDeleteUserNow,
      setSelectedAdminServerId,
      handleToggleAdminServerBlocked,
      handleDeleteAdminServer,
      handleCreateServerInvite,
      handleCopyInviteUrl,
      handleServerChange,
      handleRenameCurrentServer,
      handleLeaveCurrentServer,
      handleDeleteCurrentServer,
      handleRemoveServerMember,
      handleBanServerMember,
      handleUnbanServerMember,
      handleTransferServerOwnership,
      loadTelemetrySummary,
      setServerAudioQualityValue,
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
      setBoundedServerVideoWindowMinWidth,
      setBoundedServerVideoWindowMaxWidth,
      creatingInvite
    },
    chatVideo: {
      t,
      locale,
      serviceToken,
      chatRoomSlug,
      activeChatRoom,
      messages,
      user,
      messagesHasMore,
      loadingOlderMessages,
      chatText,
      pendingChatImageDataUrl,
      activeChatTypingUsers,
      chatLogRef,
      loadOlderMessages,
      handleSetChatText,
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
    }
  });

  const {
    entryGate,
    showEmptyServerOnboarding
  } = useAppEntryGatesState({
    showDesktopBrowserCompletion,
    desktopHandoffError,
    user,
    deletedAccountInfo,
    restoreDeletedAccountPending,
    restoreDeletedAccount,
    logout,
    t,
    canUseService,
    pendingAccessRefreshInSec,
    serversLoading,
    servers
  });

  if (entryGate) {
    return entryGate;
  }

  const {
    appTopChromeProps,
    appMainSectionProps,
    appShellOverlaysProps
  } = useAppShellRuntime({
    topChrome: {
      t,
      user,
      currentServer,
      servers,
      currentServerId,
      creatingServer,
      buildDateLabel: CLIENT_BUILD_DATE_LABEL,
      pendingJoinRequestsCount,
      appMenuOpen,
      authMenuOpen,
      profileMenuOpen,
      authMenuRef,
      profileMenuRef,
      onBeginSso: beginSso,
      onLogout: logout,
      openProfileSettings: () => openUserSettings("profile"),
      setCurrentServerId,
      onCreateServer: handleCreateServer,
      mediaDevicesState,
      onRequestMediaAccess: requestMediaAccess,
      remoteAudioAutoplayBlocked,
      audioMuted,
      desktopUpdateReadyVersion,
      desktopUpdateBannerDismissed,
      desktopUpdateApplying,
      onDismissDesktopUpdateBanner: dismissDesktopUpdateBanner,
      onApplyDesktopUpdate: applyDesktopUpdate,
      setAppMenuOpen,
      setAuthMenuOpen,
      setProfileMenuOpen
    },
    mainSection: {
      t,
      user,
      authMode,
      beginSso,
      showEmptyServerOnboarding,
      creatingServer,
      handleCreateServer,
      isMobileViewport,
      mobileTab,
      setMobileTab,
      userDockSharedProps,
      roomsPanelProps,
      chatPanelProps,
      videoWindowsOverlayProps,
      userSettingsOpen,
      inviteAccepting,
      appMenuOpen,
      serverProfileModalProps
    },
    overlays: {
      toasts,
      showAppUpdatedOverlay,
      t,
      acknowledgeUpdatedApp,
      user,
      showFirstRunIntro,
      profileNameDraft,
      setProfileNameDraft,
      profileSaving,
      completeFirstRunIntro,
      sessionMovedOverlayMessage,
      setSessionMovedOverlayMessage,
      ageGateBlockedRoomSlug,
      serverAgeConfirming,
      openUserSettings,
      handleConfirmServerAge,
      setAgeGateBlockedRoomSlug,
      joinRoom,
      lang,
      cookieConsentAccepted,
      cookieConsentKey: COOKIE_CONSENT_KEY,
      setCookieConsentAccepted
    }
  });

  return <AppShellLayout topChromeProps={appTopChromeProps} mainSectionProps={appMainSectionProps} shellOverlaysProps={appShellOverlaysProps} />;
}
