/**
 * useChatPanelUnreadWindowExpand.ts — хук расширения окна непрочитанных.
 * При прокрутке вниз догружает сообщения порциями (по 50) вплоть до лимита (500).
 */
// Хук расширения окна непрочитанных сообщений при прокрутке вниз.
// Загружает дополнительные сообщения порциями (50) до максимума (500).
import { RefObject, useCallback, useEffect, useRef } from "react";
import { asTrimmedString } from "../../../utils/stringUtils";

const UNREAD_WINDOW_EXPAND_STEP = 50;
const UNREAD_WINDOW_EXPAND_MAX = 500;

type UseChatPanelUnreadWindowExpandParams = {
  activeTopicId: string | null;
  hasActiveRoom: boolean;
  unreadDividerVisible: boolean;
  unreadDividerMessageId: string;
  loadedUnreadAfterDivider: number;
  loadingOlderMessages: boolean;
  chatLogRef: RefObject<HTMLDivElement>;
  onLoadMessagesAroundAnchor: (
    topicId: string,
    anchorMessageId: string,
    options?: {
      aroundWindowBefore?: number;
      aroundWindowAfter?: number;
    }
  ) => Promise<boolean>;
};

export function useChatPanelUnreadWindowExpand({
  activeTopicId,
  hasActiveRoom,
  unreadDividerVisible,
  unreadDividerMessageId,
  loadedUnreadAfterDivider,
  loadingOlderMessages,
  chatLogRef,
  onLoadMessagesAroundAnchor
}: UseChatPanelUnreadWindowExpandParams) {
  const unreadWindowExpandInFlightRef = useRef(false);
  const unreadWindowRequestedAfterByTopicRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const topicId = asTrimmedString(activeTopicId);
    if (!topicId) {
      return;
    }

    const currentRequested = Math.max(0, Number(unreadWindowRequestedAfterByTopicRef.current[topicId] || 0));
    unreadWindowRequestedAfterByTopicRef.current[topicId] = Math.max(currentRequested, loadedUnreadAfterDivider);
    unreadWindowExpandInFlightRef.current = false;
  }, [activeTopicId, loadedUnreadAfterDivider]);

  const maybeExpandUnreadWindowAtBottom = useCallback(() => {
    const topicId = asTrimmedString(activeTopicId);
    if (!topicId || !hasActiveRoom || !unreadDividerVisible || loadingOlderMessages || unreadWindowExpandInFlightRef.current) {
      return;
    }

    const dividerMessageId = unreadDividerMessageId;
    if (!dividerMessageId) {
      return;
    }

    const chatLogNode = chatLogRef.current;
    if (!chatLogNode) {
      return;
    }

    const distanceToBottom = chatLogNode.scrollHeight - chatLogNode.scrollTop - chatLogNode.clientHeight;
    if (distanceToBottom > 32) {
      return;
    }

    const requestedAfter = Math.max(
      loadedUnreadAfterDivider,
      Math.max(0, Number(unreadWindowRequestedAfterByTopicRef.current[topicId] || 0))
    );
    const nextRequestedAfter = Math.min(
      UNREAD_WINDOW_EXPAND_MAX,
      Math.max(requestedAfter + UNREAD_WINDOW_EXPAND_STEP, loadedUnreadAfterDivider + UNREAD_WINDOW_EXPAND_STEP)
    );

    if (nextRequestedAfter <= requestedAfter) {
      return;
    }

    unreadWindowExpandInFlightRef.current = true;
    void onLoadMessagesAroundAnchor(topicId, dividerMessageId, {
      aroundWindowBefore: 25,
      aroundWindowAfter: nextRequestedAfter
    }).then((ok) => {
      if (ok) {
        unreadWindowRequestedAfterByTopicRef.current[topicId] = nextRequestedAfter;
      }
    }).finally(() => {
      unreadWindowExpandInFlightRef.current = false;
    });
  }, [activeTopicId, chatLogRef, hasActiveRoom, loadedUnreadAfterDivider, loadingOlderMessages, onLoadMessagesAroundAnchor, unreadDividerMessageId, unreadDividerVisible]);

  useEffect(() => {
    const chatLogNode = chatLogRef.current;
    if (!chatLogNode || !hasActiveRoom) {
      return;
    }

    const onScroll = () => {
      maybeExpandUnreadWindowAtBottom();
    };

    chatLogNode.addEventListener("scroll", onScroll, { passive: true });
    maybeExpandUnreadWindowAtBottom();

    return () => {
      chatLogNode.removeEventListener("scroll", onScroll);
    };
  }, [chatLogRef, hasActiveRoom, maybeExpandUnreadWindowAtBottom]);

  useEffect(() => {
    maybeExpandUnreadWindowAtBottom();
  }, [loadedUnreadAfterDivider, maybeExpandUnreadWindowAtBottom]);
}
