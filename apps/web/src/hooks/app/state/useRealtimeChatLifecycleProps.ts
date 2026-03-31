import { useCallback, useMemo, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";
import type { Message, MessagesCursor, PresenceMember } from "../../../domain";
import type { ChatController, RealtimeClient } from "../../../services";

type UseRealtimeChatLifecyclePropsInput = {
  serviceToken: string;
  reconnectNonce: number;
  roomSlug: string;
  chatRoomSlug: string;
  messages: Message[];
  messagesNextCursor: MessagesCursor | null;
  loadingOlderMessages: boolean;
  chatController: ChatController;
  chatLogRef: RefObject<HTMLDivElement>;
  roomSlugRef: MutableRefObject<string>;
  realtimeClientRef: MutableRefObject<RealtimeClient | null>;
  lastRoomSlugForScrollRef: MutableRefObject<string>;
  lastMessageIdRef: MutableRefObject<string | null>;
  setWsState: (value: "disconnected" | "connecting" | "connected") => void;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setRoomSlug: (slug: string) => void;
  setRoomMediaTopologyBySlug: Dispatch<SetStateAction<Record<string, "livekit">>>;
  setRoomsPresenceBySlug: Dispatch<SetStateAction<Record<string, string[]>>>;
  setRoomsPresenceDetailsBySlug: Dispatch<SetStateAction<Record<string, PresenceMember[]>>>;
  pushLog: (text: string) => void;
  pushCallLog: (text: string) => void;
  pushToast: (text: string) => void;
  markMessageDelivery: (
    requestId: string,
    status: "sending" | "delivered" | "failed",
    patch?: Partial<Message>
  ) => void;
  handleIncomingMicState: (
    payload: { fromUserId?: string; fromUserName?: string; muted?: boolean; speaking?: boolean; audioMuted?: boolean }
  ) => void;
  handleIncomingVideoState: (
    payload: { fromUserId?: string; fromUserName?: string; roomSlug?: string; settings?: Record<string, unknown> }
  ) => void;
  handleIncomingInitialCallState: (
    payload: {
      roomSlug?: string;
      participants?: Array<{
        userId?: string;
        userName?: string;
        mic?: { muted?: boolean; speaking?: boolean; audioMuted?: boolean };
        video?: { localVideoEnabled?: boolean };
      }>;
    }
  ) => void;
  handleCallNack: (payload: { requestId: string; eventType: string; code: string; message: string }) => void;
  handleAudioQualityUpdated: (
    payload: {
      scope?: string;
      audioQuality?: string;
      roomId?: string;
      roomSlug?: string;
      audioQualityOverride?: string | null;
      updatedAt?: string;
      updatedByUserId?: string | null;
    }
  ) => void;
  handleWsAck: (payload: { requestId: string; eventType: string; meta: Record<string, unknown> }) => void;
  handleWsNack: (payload: { requestId: string; eventType: string; code: string; message: string }) => void;
  handleIncomingScreenShareState: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      active?: boolean;
      ownerUserId?: string | null;
      ownerUserName?: string | null;
      ts?: string;
    }
  ) => void;
  handleSessionMoved: (payload: { code: string; message: string }) => void;
  handleChatCleared: (
    payload: { roomId?: string; roomSlug?: string; deletedCount?: number; clearedAt?: string }
  ) => void;
  handleChatTyping: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      userId?: string;
      userName?: string;
      isTyping?: boolean;
      ts?: string;
    }
  ) => void;
};

export function useRealtimeChatLifecycleProps({
  serviceToken,
  reconnectNonce,
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
  handleIncomingScreenShareState,
  handleSessionMoved,
  handleChatCleared,
  handleChatTyping
}: UseRealtimeChatLifecyclePropsInput) {
  const handleRoomMediaTopology = useCallback(
    ({ roomSlug: nextRoomSlug, mediaTopology }: { roomSlug: string; mediaTopology: "livekit" }) => {
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
    [setRoomMediaTopologyBySlug]
  );

  return useMemo(() => ({
    token: serviceToken,
    reconnectNonce,
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
    onRoomMediaTopology: handleRoomMediaTopology,
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
    onSessionMoved: handleSessionMoved,
    onChatCleared: handleChatCleared,
    onChatTyping: handleChatTyping
  }), [
    serviceToken,
    reconnectNonce,
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
    handleRoomMediaTopology,
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
    handleIncomingScreenShareState,
    handleSessionMoved,
    handleChatCleared,
    handleChatTyping
  ]);
}