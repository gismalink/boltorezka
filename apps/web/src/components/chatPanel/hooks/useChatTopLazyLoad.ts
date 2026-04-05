import { RefObject, useEffect, useRef } from "react";

type UseChatTopLazyLoadArgs = {
  chatLogRef: RefObject<HTMLDivElement>;
  hasActiveRoom: boolean;
  loadingOlderMessages: boolean;
  messagesHasMore: boolean;
  onLoadOlderMessages: () => void;
};

export function useChatTopLazyLoad({
  chatLogRef,
  hasActiveRoom,
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

    const maybeLoadOlder = (event: Event) => {
      if (!event.isTrusted) {
        return;
      }

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

    chatLogNode.addEventListener("scroll", maybeLoadOlder, { passive: true });

    return () => {
      chatLogNode.removeEventListener("scroll", maybeLoadOlder);
    };
  }, [chatLogRef, hasActiveRoom, loadingOlderMessages, messagesHasMore, onLoadOlderMessages]);
}
