import { RefObject, useEffect, useRef } from "react";

type UseChatTopLazyLoadArgs = {
  chatLogRef: RefObject<HTMLDivElement>;
  hasActiveRoom: boolean;
  messageCount: number;
  loadingOlderMessages: boolean;
  messagesHasMore: boolean;
  onLoadOlderMessages: () => void;
};

export function useChatTopLazyLoad({
  chatLogRef,
  hasActiveRoom,
  messageCount,
  loadingOlderMessages,
  messagesHasMore,
  onLoadOlderMessages
}: UseChatTopLazyLoadArgs) {
  const topAutoloadTsRef = useRef(0);
  const lastScrollTopRef = useRef(0);

  useEffect(() => {
    const chatLogNode = chatLogRef.current;
    if (!chatLogNode || !hasActiveRoom) {
      return;
    }

    lastScrollTopRef.current = chatLogNode.scrollTop;

    const maybeLoadOlder = () => {
      const currentTop = chatLogNode.scrollTop;
      const isScrollingUp = currentTop <= lastScrollTopRef.current;
      lastScrollTopRef.current = currentTop;

      if (!isScrollingUp || loadingOlderMessages || !messagesHasMore) {
        return;
      }

      if (currentTop > 16) {
        return;
      }

      const now = Date.now();
      if (now - topAutoloadTsRef.current < 800) {
        return;
      }

      topAutoloadTsRef.current = now;
      onLoadOlderMessages();
    };

    const onScroll = (event: Event) => {
      if (!event.isTrusted) {
        return;
      }

      const currentTop = chatLogNode.scrollTop;
      const isScrollingUp = currentTop <= lastScrollTopRef.current;
      lastScrollTopRef.current = currentTop;

      if (!isScrollingUp) {
        return;
      }

      maybeLoadOlder();
    };

    const maybeLoadOnShortTimeline = () => {
      const almostNoOverflow = chatLogNode.scrollHeight <= chatLogNode.clientHeight + 24;
      if (almostNoOverflow || chatLogNode.scrollTop <= 16) {
        maybeLoadOlder();
      }
    };

    chatLogNode.addEventListener("scroll", onScroll, { passive: true });
    const initialCheckId = window.requestAnimationFrame(maybeLoadOnShortTimeline);

    return () => {
      window.cancelAnimationFrame(initialCheckId);
      chatLogNode.removeEventListener("scroll", onScroll);
    };
  }, [chatLogRef, hasActiveRoom, loadingOlderMessages, messageCount, messagesHasMore, onLoadOlderMessages]);
}
