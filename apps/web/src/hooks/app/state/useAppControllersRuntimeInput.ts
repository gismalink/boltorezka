import { useAppControllersRuntime } from "../effects/useAppControllersRuntime";

type AppControllersRuntimeInput = Parameters<typeof useAppControllersRuntime>[0];

function buildRoomSlugById(rooms: Array<{ id?: unknown; slug?: unknown }>): Record<string, string> {
  return rooms.reduce<Record<string, string>>((acc, room) => {
    const roomId = String(room?.id || "").trim();
    const roomSlug = String(room?.slug || "").trim();
    if (!roomId || !roomSlug) {
      return acc;
    }

    acc[roomId] = roomSlug;
    return acc;
  }, {});
}

function resolveActiveChatRoomId(input: {
  explicitRoomId?: unknown;
  chatRoomSlug?: unknown;
  rooms?: unknown;
}): string {
  const explicitRoomId = String(input.explicitRoomId || "").trim();
  if (explicitRoomId) {
    return explicitRoomId;
  }

  const activeSlug = String(input.chatRoomSlug || "").trim();
  if (!activeSlug || !Array.isArray(input.rooms)) {
    return "";
  }

  const match = input.rooms.find((room) => {
    if (!room || typeof room !== "object") {
      return false;
    }
    return String((room as { slug?: unknown }).slug || "").trim() === activeSlug;
  }) as { id?: unknown } | undefined;

  return String(match?.id || "").trim();
}

export function useAppControllersRuntimeInput(params: Record<string, unknown>): AppControllersRuntimeInput {
  const p = params as any;
  const roomSlugById = p.roomSlugById || buildRoomSlugById(Array.isArray(p.rooms) ? p.rooms : []);
  const activeChatRoomId = resolveActiveChatRoomId({
    explicitRoomId: p.activeChatRoomId,
    chatRoomSlug: p.chatRoomSlug,
    rooms: p.rooms
  });

  return {
    controllers: {
      token: p.token,
      canViewTelemetry: p.canViewTelemetry,
      pushLog: p.pushLog,
      pushToast: p.pushToast,
      sendWsEvent: p.sendWsEvent,
      sendRoomJoinEvent: p.sendRoomJoinEvent,
      currentServerIdRef: p.currentServerIdRef,
      setToken: p.setToken,
      setUser: p.setUser,
      setDeletedAccountInfo: p.setDeletedAccountInfo,
      setRoomSlug: p.setRoomSlug,
      setMessages: p.setMessages,
      setMessagesHasMore: p.setMessagesHasMore,
      setMessagesNextCursor: p.setMessagesNextCursor,
      setRooms: p.setRooms,
      setRoomsTree: p.setRoomsTree,
      setRoomsTreeLoading: p.setRoomsTreeLoading,
      setArchivedRooms: p.setArchivedRooms,
      setAdminUsers: p.setAdminUsers,
      setLoadingOlderMessages: p.setLoadingOlderMessages,
      setTelemetrySummary: p.setTelemetrySummary
    },
    incomingCallState: {
      canManageAudioQuality: p.canManageAudioQuality,
      roomSlugRef: p.roomSlugRef,
      serverVideoWindowMinWidth: p.serverVideoWindowMinWidth,
      serverVideoWindowMaxWidth: p.serverVideoWindowMaxWidth,
      handleIncomingRtcVideoState: p.handleIncomingRtcVideoState,
      setServerVideoEffectType: p.setServerVideoEffectType,
      setServerVideoResolution: p.setServerVideoResolution,
      setServerVideoFps: p.setServerVideoFps,
      setServerScreenShareResolution: p.setServerScreenShareResolution,
      setServerVideoPixelFxStrength: p.setServerVideoPixelFxStrength,
      setServerVideoPixelFxPixelSize: p.setServerVideoPixelFxPixelSize,
      setServerVideoPixelFxGridThickness: p.setServerVideoPixelFxGridThickness,
      setServerVideoAsciiCellSize: p.setServerVideoAsciiCellSize,
      setServerVideoAsciiContrast: p.setServerVideoAsciiContrast,
      setServerVideoAsciiColor: p.setServerVideoAsciiColor,
      setServerVideoWindowMinWidth: p.setServerVideoWindowMinWidth,
      setServerVideoWindowMaxWidth: p.setServerVideoWindowMaxWidth,
      setVoiceCameraEnabledByUserIdInCurrentRoom: p.setVoiceCameraEnabledByUserIdInCurrentRoom,
      setVoiceInitialMicStateByUserIdInCurrentRoom: p.setVoiceInitialMicStateByUserIdInCurrentRoom,
      setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom: p.setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom,
      setServerAudioQuality: p.setServerAudioQuality,
      setRooms: p.setRooms,
      setRoomsTree: p.setRoomsTree
    },
    sessionStateLifecycle: {
      token: p.token,
      currentServerId: p.currentServerId,
      pushLog: p.pushLog,
      realtimeClientRef: p.realtimeClientRef,
      defaultChatImageDataUrlLength: p.defaultChatImageDataUrlLength,
      defaultChatImageMaxSide: p.defaultChatImageMaxSide,
      defaultChatImageQuality: p.defaultChatImageQuality,
      setToken: p.setToken,
      setUser: p.setUser,
      setRooms: p.setRooms,
      setRoomsTree: p.setRoomsTree,
      setArchivedRooms: p.setArchivedRooms,
      setMessages: p.setMessages,
      setChatText: p.setChatText,
      setPendingChatImageDataUrl: p.setPendingChatImageDataUrl,
      setMessagesHasMore: p.setMessagesHasMore,
      setMessagesNextCursor: p.setMessagesNextCursor,
      setLoadingOlderMessages: p.setLoadingOlderMessages,
      setAdminUsers: p.setAdminUsers,
      setRoomsPresenceBySlug: p.setRoomsPresenceBySlug,
      setRoomsPresenceDetailsBySlug: p.setRoomsPresenceDetailsBySlug,
      setRoomMediaTopologyBySlug: p.setRoomMediaTopologyBySlug,
      setVoiceCameraEnabledByUserIdInCurrentRoom: p.setVoiceCameraEnabledByUserIdInCurrentRoom,
      setVoiceInitialMicStateByUserIdInCurrentRoom: p.setVoiceInitialMicStateByUserIdInCurrentRoom,
      setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom: p.setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom,
      setTelemetrySummary: p.setTelemetrySummary,
      setServerAudioQuality: p.setServerAudioQuality,
      setServerAudioQualitySaving: p.setServerAudioQualitySaving,
      setServerChatImagePolicy: p.setServerChatImagePolicy,
      setDeletedAccountInfo: p.setDeletedAccountInfo
    },
    realtimeChatRuntime: {
      lifecycleCallbacks: {
        chatRoomSlug: p.chatRoomSlug,
        roomSlugRef: p.roomSlugRef,
        realtimeClientRef: p.realtimeClientRef,
        disconnectRoom: p.disconnectRoom,
        playServerSound: p.playServerSound,
        setRoomsPresenceBySlug: p.setRoomsPresenceBySlug,
        setRoomsPresenceDetailsBySlug: p.setRoomsPresenceDetailsBySlug,
        setRoomSlug: p.setRoomSlug,
        setChatTypingByRoomSlug: p.setChatTypingByRoomSlug,
        setSessionMovedOverlayMessage: p.setSessionMovedOverlayMessage,
        pushLog: p.pushLog,
        setMessages: p.setMessages,
        setMessagesHasMore: p.setMessagesHasMore,
        setMessagesNextCursor: p.setMessagesNextCursor,
        chatTopics: p.chatTopics,
        setChatTopics: p.setChatTopics,
        setRoomUnreadBySlug: p.setRoomUnreadBySlug,
        setRoomMentionUnreadBySlug: p.setRoomMentionUnreadBySlug,
        roomSlugById,
        activeTopicId: p.activeChatTopicId,
        currentUserId: p.currentUserId,
        applyRemoteTypingPayload: p.applyRemoteTypingPayload,
        applyRemotePinState: p.applyRemotePinState,
        applyRemoteMessageReactionState: p.applyRemoteMessageReactionState
      },
      realtimeChatLifecycleProps: {
        serviceToken: p.serviceToken,
        currentServerId: p.currentServerId,
        reconnectNonce: p.realtimeReconnectNonce,
        roomSlug: p.roomSlug,
        chatRoomSlug: p.chatRoomSlug,
        activeChatRoomId,
        activeTopicId: p.activeChatTopicId,
        messages: p.messages,
        messagesNextCursor: p.messagesNextCursor,
        loadingOlderMessages: p.loadingOlderMessages,
        chatLogRef: p.chatLogRef,
        roomSlugRef: p.roomSlugRef,
        realtimeClientRef: p.realtimeClientRef,
        lastRoomSlugForScrollRef: p.lastRoomSlugForScrollRef,
        lastMessageIdRef: p.lastMessageIdRef,
        setWsState: p.setWsState,
        setMessages: p.setMessages,
        setChatTopics: p.setChatTopics,
        setRoomSlug: p.setRoomSlug,
        setRoomMediaTopologyBySlug: p.setRoomMediaTopologyBySlug,
        setRoomsPresenceBySlug: p.setRoomsPresenceBySlug,
        setRoomsPresenceDetailsBySlug: p.setRoomsPresenceDetailsBySlug,
        pushLog: p.pushLog,
        pushCallLog: p.pushCallLog,
        pushToast: p.pushToast,
        markMessageDelivery: p.markMessageDelivery,
        handleCallNack: p.handleCallNack,
        handleWsAck: p.handleWsAck,
        handleWsNack: p.handleWsNack,
        handleIncomingScreenShareState: p.handleIncomingScreenShareState
      }
    }
  };
}