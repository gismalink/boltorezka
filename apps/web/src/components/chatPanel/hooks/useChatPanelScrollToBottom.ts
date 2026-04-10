// Хук кнопки «scroll to bottom»: видимость и действие.
import { RefObject, useCallback, useEffect, useState } from "react";

type UseChatPanelScrollToBottomParams = {
  chatLogRef: RefObject<HTMLDivElement>;
  hasActiveRoom: boolean;
  messagesLength: number;
  loadingOlderMessages: boolean;
};

export function useChatPanelScrollToBottom({
  chatLogRef,
  hasActiveRoom,
  messagesLength,
  loadingOlderMessages
}: UseChatPanelScrollToBottomParams) {
  const [showScrollToBottomButton, setShowScrollToBottomButton] = useState(false);

  const scrollTimelineToBottom = useCallback(() => {
    const chatLogNode = chatLogRef.current;
    if (!chatLogNode) {
      return;
    }

    chatLogNode.scrollTo({
      top: chatLogNode.scrollHeight,
      behavior: "smooth"
    });
  }, [chatLogRef]);

  useEffect(() => {
    const chatLogNode = chatLogRef.current;
    if (!chatLogNode || !hasActiveRoom) {
      setShowScrollToBottomButton(false);
      return;
    }

    const updateScrollToBottomVisibility = () => {
      const maxScrollTop = Math.max(0, chatLogNode.scrollHeight - chatLogNode.clientHeight);
      const hasScrollableContent = maxScrollTop > 1;
      const distanceToBottom = maxScrollTop - chatLogNode.scrollTop;
      const isAtBottom = distanceToBottom <= 12;

      setShowScrollToBottomButton(hasScrollableContent && !isAtBottom);
    };

    chatLogNode.addEventListener("scroll", updateScrollToBottomVisibility, { passive: true });

    const rafId = window.requestAnimationFrame(updateScrollToBottomVisibility);

    return () => {
      chatLogNode.removeEventListener("scroll", updateScrollToBottomVisibility);
      window.cancelAnimationFrame(rafId);
    };
  }, [chatLogRef, hasActiveRoom, messagesLength, loadingOlderMessages]);

  return {
    showScrollToBottomButton,
    scrollTimelineToBottom
  };
}
