import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Message } from "../../../domain";

type UseAppRefsAndAdaptersRuntimeInput = {
  currentServerId: string;
  roomSlug: string;
  chatRoomSlug: string;
  t: (key: string) => string;
  chatImagePolicy: {
    maxDataUrlLength: number;
    maxImageSide: number;
  };
  setMessages: Dispatch<SetStateAction<Message[]>>;
};

type UseAppRefsAndAdaptersRuntimeResult = {
  realtimeReconnectNonce: number;
  bumpRealtimeReconnectNonce: () => void;
  currentServerIdRef: RefObject<string>;
  roomSlugRef: RefObject<string>;
  lastRoomSlugForScrollRef: RefObject<string>;
  lastMessageIdRef: RefObject<string | null>;
  chatLogRef: RefObject<HTMLDivElement>;
  autoSsoAttemptedRef: RefObject<boolean>;
  authMenuRef: RefObject<HTMLDivElement>;
  profileMenuRef: RefObject<HTMLDivElement>;
  categoryPopupRef: RefObject<HTMLDivElement>;
  channelPopupRef: RefObject<HTMLDivElement>;
  audioOutputAnchorRef: RefObject<HTMLDivElement>;
  voiceSettingsAnchorRef: RefObject<HTMLDivElement>;
  userSettingsRef: RefObject<HTMLDivElement>;
  maxChatImageKb: number;
  selectChannelPlaceholderMessage: string;
  serverErrorMessage: string;
  chatImageTooLargeMessage: string;
  markMessageDelivery: (
    requestId: string,
    status: "sending" | "delivered" | "failed",
    patch?: Partial<Message>
  ) => void;
};

export function useAppRefsAndAdaptersRuntime({
  currentServerId,
  roomSlug,
  chatRoomSlug,
  t,
  chatImagePolicy,
  setMessages
}: UseAppRefsAndAdaptersRuntimeInput): UseAppRefsAndAdaptersRuntimeResult {
  const [realtimeReconnectNonce, setRealtimeReconnectNonce] = useState(0);

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

  const maxChatImageKb = Math.max(1, Math.floor(chatImagePolicy.maxDataUrlLength / 1024));
  const selectChannelPlaceholderMessage = t("chat.selectChannelPlaceholder");
  const serverErrorMessage = t("toast.serverError");
  const chatImageTooLargeMessage = t("chat.imageTooLarge")
    .replace("{maxSide}", String(chatImagePolicy.maxImageSide))
    .replace("{maxKb}", String(maxChatImageKb));

  const markMessageDelivery = useCallback((
    requestId: string,
    status: "sending" | "delivered" | "failed",
    patch: Partial<Message> = {}
  ) => {
    setMessages((prev) =>
      prev.map((item) =>
        item.clientRequestId === requestId ? { ...item, deliveryStatus: status, ...patch } : item
      )
    );
  }, [setMessages]);

  const bumpRealtimeReconnectNonce = useCallback(() => {
    setRealtimeReconnectNonce((value) => value + 1);
  }, []);

  return {
    realtimeReconnectNonce,
    bumpRealtimeReconnectNonce,
    currentServerIdRef,
    roomSlugRef,
    lastRoomSlugForScrollRef,
    lastMessageIdRef,
    chatLogRef,
    autoSsoAttemptedRef,
    authMenuRef,
    profileMenuRef,
    categoryPopupRef,
    channelPopupRef,
    audioOutputAnchorRef,
    voiceSettingsAnchorRef,
    userSettingsRef,
    maxChatImageKb,
    selectChannelPlaceholderMessage,
    serverErrorMessage,
    chatImageTooLargeMessage,
    markMessageDelivery
  };
}