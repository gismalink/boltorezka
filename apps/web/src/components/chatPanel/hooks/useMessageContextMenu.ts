import { useCallback, useEffect, useState } from "react";
import { api } from "../../../api";
import type { Message } from "../../../domain";

type MessageContextMenuState = { messageId: string; x: number; y: number } | null;

type UseMessageContextMenuArgs = {
  messages: Message[];
  authToken: string;
  activeTopicId: string | null;
  onToggleThumbsUpReaction: (messageId: string) => void;
};

export function useMessageContextMenu({
  messages,
  authToken,
  activeTopicId,
  onToggleThumbsUpReaction
}: UseMessageContextMenuArgs) {
  const [messageContextMenu, setMessageContextMenu] = useState<MessageContextMenuState>(null);
  const [extraReactionsByMessageId, setExtraReactionsByMessageId] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!messageContextMenu) {
      return;
    }

    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        setMessageContextMenu(null);
        return;
      }

      if (target.closest(".chat-message-context-menu") || target.closest(".chat-message-reaction-menu")) {
        return;
      }

      setMessageContextMenu(null);
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setMessageContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [messageContextMenu]);

  useEffect(() => {
    const existingIds = new Set(messages.map((item) => String(item.id || "").trim()).filter(Boolean));
    setExtraReactionsByMessageId((prev) => {
      const next: Record<string, string[]> = {};
      let changed = false;

      Object.entries(prev).forEach(([messageId, reactions]) => {
        if (!existingIds.has(messageId)) {
          changed = true;
          return;
        }

        const normalized = Array.from(
          new Set(
            (Array.isArray(reactions) ? reactions : [])
              .map((item) => String(item || "").trim())
              .filter((item) => item && item !== "👍")
          )
        );
        if (normalized.length > 0) {
          next[messageId] = normalized;
        }
        if (normalized.length !== reactions.length) {
          changed = true;
        }
      });

      if (!changed && Object.keys(next).length === Object.keys(prev).length) {
        return prev;
      }

      return next;
    });
  }, [messages]);

  const toggleMessageReaction = useCallback(async (messageId: string, emoji: string) => {
    const normalizedMessageId = String(messageId || "").trim();
    const normalizedEmoji = String(emoji || "").trim();
    if (!normalizedMessageId || !normalizedEmoji) {
      return;
    }

    if (normalizedEmoji === "👍") {
      onToggleThumbsUpReaction(normalizedMessageId);
      return;
    }

    const normalizedToken = String(authToken || "").trim();
    if (!normalizedToken || !activeTopicId) {
      return;
    }

    const isActive = Boolean(extraReactionsByMessageId[normalizedMessageId]?.includes(normalizedEmoji));
    try {
      if (isActive) {
        await api.removeMessageReaction(normalizedToken, normalizedMessageId, normalizedEmoji);
      } else {
        await api.addMessageReaction(normalizedToken, normalizedMessageId, normalizedEmoji);
      }

      setExtraReactionsByMessageId((prev) => {
        const current = Array.isArray(prev[normalizedMessageId]) ? prev[normalizedMessageId] : [];
        const set = new Set(current);
        if (isActive) {
          set.delete(normalizedEmoji);
        } else {
          set.add(normalizedEmoji);
        }

        const next = { ...prev };
        const list = Array.from(set);
        if (list.length === 0) {
          delete next[normalizedMessageId];
        } else {
          next[normalizedMessageId] = list;
        }

        return next;
      });
    } catch {
      // Keep UI stable even if reaction request fails.
    }
  }, [activeTopicId, authToken, extraReactionsByMessageId, onToggleThumbsUpReaction]);

  return {
    messageContextMenu,
    setMessageContextMenu,
    extraReactionsByMessageId,
    toggleMessageReaction
  };
}
