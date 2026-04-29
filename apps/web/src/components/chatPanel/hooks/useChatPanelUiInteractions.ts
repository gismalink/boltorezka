/**
 * useChatPanelUiInteractions.ts — хук UX-взаимодействий в ChatPanel.
 * Горячие клавиши, фокус композера, переходы между сообщениями по клавиатуре.
 */
import { KeyboardEvent, useEffect, useRef } from "react";
import type { ChatMessageViewModel } from "../../../utils/chatMessageViewModel";
import type { RoomTopic } from "../../../domain";

type UseChatPanelUiInteractionsArgs = {
  t: (key: string) => string;
  hasActiveRoom: boolean;
  hasTopics: boolean;
  roomSlug: string;
  activeTopicId: string | null;
  topics: RoomTopic[];
  filteredTopicsForPalette: RoomTopic[];
  topicPaletteOpen: boolean;
  setTopicPaletteOpen: (value: boolean) => void;
  topicPaletteQuery: string;
  setTopicPaletteQuery: (value: string) => void;
  topicPaletteSelectedIndex: number;
  setTopicPaletteSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  setHotkeyStatusText: (value: string) => void;
  previewImageUrl: string | null;
  setPreviewImageUrl: (value: string | null) => void;
  messageViewModels: ChatMessageViewModel[];
  onSelectTopic: (topicId: string) => void;
  onReplyMessage: (messageId: string) => void;
  onEditMessage: (messageId: string) => void;
  markRoomRead: () => Promise<void>;
};

export function useChatPanelUiInteractions({
  t,
  hasActiveRoom,
  hasTopics,
  roomSlug,
  activeTopicId,
  topics,
  filteredTopicsForPalette,
  topicPaletteOpen,
  setTopicPaletteOpen,
  topicPaletteQuery,
  setTopicPaletteQuery,
  topicPaletteSelectedIndex,
  setTopicPaletteSelectedIndex,
  setHotkeyStatusText,
  previewImageUrl,
  setPreviewImageUrl,
  messageViewModels,
  onSelectTopic,
  onReplyMessage,
  onEditMessage,
  markRoomRead
}: UseChatPanelUiInteractionsArgs) {
  const topicPaletteInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setHotkeyStatusText("");
  }, [activeTopicId, roomSlug, setHotkeyStatusText]);

  useEffect(() => {
    if (!previewImageUrl) {
      return;
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewImageUrl(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [previewImageUrl, setPreviewImageUrl]);

  useEffect(() => {
    if (!topicPaletteOpen) {
      return;
    }

    setTopicPaletteQuery("");
    const topicsForInitialSelection = [...topics].sort((a, b) => {
      const pinnedDiff = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
      if (pinnedDiff !== 0) {
        return pinnedDiff;
      }

      const positionDiff = Number(a.position || 0) - Number(b.position || 0);
      if (positionDiff !== 0) {
        return positionDiff;
      }

      return String(a.title || "").localeCompare(String(b.title || ""));
    });
    const activeIndex = topicsForInitialSelection.findIndex((topic) => topic.id === activeTopicId);
    setTopicPaletteSelectedIndex(activeIndex >= 0 ? activeIndex : 0);

    const timerId = window.setTimeout(() => {
      topicPaletteInputRef.current?.focus();
      topicPaletteInputRef.current?.select();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [topicPaletteOpen, topics, activeTopicId, setTopicPaletteQuery, setTopicPaletteSelectedIndex]);

  useEffect(() => {
    if (filteredTopicsForPalette.length === 0) {
      setTopicPaletteSelectedIndex(0);
      return;
    }

    setTopicPaletteSelectedIndex((prev) => {
      if (prev < 0) {
        return 0;
      }
      if (prev >= filteredTopicsForPalette.length) {
        return filteredTopicsForPalette.length - 1;
      }
      return prev;
    });
  }, [filteredTopicsForPalette, setTopicPaletteSelectedIndex]);

  useEffect(() => {
    const hasOpenOverlay = Boolean(previewImageUrl || topicPaletteOpen);
    if (!hasActiveRoom || hasOpenOverlay) {
      return;
    }

    const latestMessageIdForHotkeys = messageViewModels.length > 0
      ? messageViewModels[messageViewModels.length - 1]?.id || null
      : null;

    let latestOwnManageableMessageIdForHotkeys: string | null = null;
    for (let index = messageViewModels.length - 1; index >= 0; index -= 1) {
      const candidate = messageViewModels[index];
      if (candidate?.canManageOwnMessage) {
        latestOwnManageableMessageIdForHotkeys = candidate.id;
        break;
      }
    }

    const isEditableTarget = (target: EventTarget | null): boolean => {
      const element = target as HTMLElement | null;
      if (!element) {
        return false;
      }

      const tagName = element.tagName.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select") {
        return true;
      }

      if (element.isContentEditable || element.closest("[contenteditable='true']")) {
        return true;
      }

      return false;
    };

    const openTopicPalette = () => {
      if (!hasTopics) {
        return;
      }
      setTopicPaletteOpen(true);
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        openTopicPalette();
        setHotkeyStatusText(t("chat.hotkeyTopicSwitch"));
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      if (key === "t") {
        event.preventDefault();
        openTopicPalette();
        setHotkeyStatusText(t("chat.hotkeyTopicSwitch"));
        return;
      }

      if (key === "r" && latestMessageIdForHotkeys) {
        event.preventDefault();
        onReplyMessage(latestMessageIdForHotkeys);
        setHotkeyStatusText(t("chat.hotkeyReply"));
        return;
      }

      if (key === "e" && latestOwnManageableMessageIdForHotkeys) {
        event.preventDefault();
        onEditMessage(latestOwnManageableMessageIdForHotkeys);
        setHotkeyStatusText(t("chat.hotkeyEdit"));
        return;
      }

      if (key === "m") {
        event.preventDefault();
        void markRoomRead();
        setHotkeyStatusText(t("chat.hotkeyMarkRead"));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    hasActiveRoom,
    hasTopics,
    markRoomRead,
    messageViewModels,
    onEditMessage,
    onReplyMessage,
    previewImageUrl,
    setHotkeyStatusText,
    setTopicPaletteOpen,
    t,
    topicPaletteOpen
  ]);

  const closeTopicPalette = () => {
    setTopicPaletteOpen(false);
  };

  const openTopicPalette = () => {
    if (!hasTopics) {
      return;
    }

    setTopicPaletteOpen(true);
  };

  const selectTopicFromPalette = (topicId: string) => {
    onSelectTopic(topicId);
    setTopicPaletteOpen(false);
  };

  const handleTopicPaletteKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filteredTopicsForPalette.length > 0) {
        setTopicPaletteSelectedIndex((prev) => Math.min(filteredTopicsForPalette.length - 1, prev + 1));
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredTopicsForPalette.length > 0) {
        setTopicPaletteSelectedIndex((prev) => Math.max(0, prev - 1));
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const selected = filteredTopicsForPalette[topicPaletteSelectedIndex];
      if (selected) {
        selectTopicFromPalette(selected.id);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeTopicPalette();
    }
  };

  return {
    topicPaletteInputRef,
    openTopicPalette,
    closeTopicPalette,
    selectTopicFromPalette,
    handleTopicPaletteKeyDown,
    topicPaletteQuery
  };
}
