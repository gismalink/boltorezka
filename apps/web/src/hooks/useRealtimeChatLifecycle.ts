import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";
import { api } from "../api";
import { trackClientEvent } from "../telemetry";
import type { Message, MessagesCursor, PresenceMember } from "../domain";
import { RealtimeClient, WsMessageController } from "../services";
import type { CallStatus, ChatController } from "../services";

type UseRealtimeChatLifecycleArgs = {
  token: string;
  roomSlug: string;
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
  setLastCallPeer: (peer: string) => void;
  setCallStatus: (status: CallStatus) => void;
  setRoomSlug: (slug: string) => void;
  setRoomsPresenceBySlug: Dispatch<SetStateAction<Record<string, string[]>>>;
  setRoomsPresenceDetailsBySlug: Dispatch<SetStateAction<Record<string, PresenceMember[]>>>;
  pushLog: (text: string) => void;
  pushCallLog: (text: string) => void;
  pushToast: (message: string) => void;
  markMessageDelivery: (
    requestId: string,
    status: "sending" | "delivered" | "failed",
    patch?: Partial<Message>
  ) => void;
  onCallSignal?: (
    eventType: "call.offer" | "call.answer" | "call.ice",
    payload: { fromUserId?: string; fromUserName?: string; signal?: Record<string, unknown> }
  ) => void;
  onCallTerminal?: (
    eventType: "call.reject" | "call.hangup",
    payload: { fromUserId?: string; fromUserName?: string; reason?: string | null }
  ) => void;
  onCallMicState?: (
    payload: { fromUserId?: string; fromUserName?: string; muted?: boolean }
  ) => void;
};

export function useRealtimeChatLifecycle({
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
  onCallSignal,
  onCallTerminal,
  onCallMicState
}: UseRealtimeChatLifecycleArgs) {
  const onCallSignalRef = useRef(onCallSignal);
  const onCallTerminalRef = useRef(onCallTerminal);
  const onCallMicStateRef = useRef(onCallMicState);

  useEffect(() => {
    onCallSignalRef.current = onCallSignal;
  }, [onCallSignal]);

  useEffect(() => {
    onCallTerminalRef.current = onCallTerminal;
  }, [onCallTerminal]);

  useEffect(() => {
    onCallMicStateRef.current = onCallMicState;
  }, [onCallMicState]);

  useEffect(() => {
    roomSlugRef.current = roomSlug;
    realtimeClientRef.current?.setRoomSlug(roomSlug);
  }, [roomSlug]);

  useEffect(() => {
    if (!token) {
      setWsState("disconnected");
      return;
    }

    const messageController = new WsMessageController({
      clearPendingRequest: (requestId) => realtimeClientRef.current?.clearPendingRequest(requestId),
      markMessageDelivery,
      setMessages,
      setLastCallPeer,
      setCallStatus,
      pushLog,
      pushCallLog,
      pushToast,
      setRoomSlug,
      setRoomsPresenceBySlug,
      setRoomsPresenceDetailsBySlug,
      trackNack: ({ requestId, eventType, code, message }) => {
        trackClientEvent(
          "ws.nack.received",
          {
            requestId,
            eventType,
            code,
            message
          },
          token
        );
      },
      onCallSignal: (...args) => onCallSignalRef.current?.(...args),
      onCallTerminal: (...args) => onCallTerminalRef.current?.(...args),
      onCallMicState: (...args) => onCallMicStateRef.current?.(...args)
    });

    const client = new RealtimeClient({
      getTicket: async (authToken) => {
        const response = await api.wsTicket(authToken);
        return response.ticket;
      },
      onWsStateChange: setWsState,
      onLog: (message) => {
        pushLog(message);
        if (message === "ws error") {
          trackClientEvent("ws.error", {}, token);
        }
      },
      onMessage: (message) => messageController.handle(message),
      onConnected: () => {
        trackClientEvent("ws.connected", { roomSlug: roomSlugRef.current }, token);
      },
      onRequestResent: (requestId, eventType) => {
        if (eventType === "chat.send") {
          markMessageDelivery(requestId, "sending");
        }
      },
      onRequestFailed: (requestId, eventType, retries) => {
        if (eventType === "chat.send") {
          markMessageDelivery(requestId, "failed");
          trackClientEvent(
            "chat.request.failed.retries_exhausted",
            { requestId, eventType, retries },
            token
          );
        }
      }
    });

    realtimeClientRef.current = client;
    client.setRoomSlug(roomSlugRef.current);
    client.connect(token);

    return () => {
      client.dispose();
      if (realtimeClientRef.current === client) {
        realtimeClientRef.current = null;
      }
    };
  }, [token]);

  useEffect(() => {
    if (!token || !roomSlug) return;
    void chatController.loadRecentMessages(token, roomSlug);
  }, [token, roomSlug, chatController]);

  useEffect(() => {
    const chatLogElement = chatLogRef.current;
    if (!chatLogElement) {
      return;
    }

    const latestMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
    const roomChanged = lastRoomSlugForScrollRef.current !== roomSlug;
    const latestMessageChanged = latestMessageId !== lastMessageIdRef.current;

    if (roomChanged || latestMessageChanged) {
      chatLogElement.scrollTop = chatLogElement.scrollHeight;
    }

    lastRoomSlugForScrollRef.current = roomSlug;
    lastMessageIdRef.current = latestMessageId;
  }, [messages, roomSlug]);

  const loadOlderMessages = useCallback(async () => {
    if (!token || !roomSlug || !messagesNextCursor || loadingOlderMessages) {
      return;
    }

    await chatController.loadOlderMessages(token, roomSlug, messagesNextCursor, loadingOlderMessages);
  }, [token, roomSlug, messagesNextCursor, loadingOlderMessages, chatController]);

  return {
    loadOlderMessages
  };
}
