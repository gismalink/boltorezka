/**
 * useChatPanelTopicCreate.ts — хук формы создания нового топика.
 * Хранит ввод, валидацию, submit-состояние и переход на вновь созданный топик.
 */
import { FormEvent, useEffect, useRef, useState } from "react";

type UseChatPanelTopicCreateArgs = {
  onCreateTopic: (title: string) => Promise<void>;
};

export function useChatPanelTopicCreate({ onCreateTopic }: UseChatPanelTopicCreateArgs) {
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [topicCreateOpen, setTopicCreateOpen] = useState(false);
  const [creatingTopic, setCreatingTopic] = useState(false);
  const topicCreatePopupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!topicCreateOpen) {
      return;
    }

    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        setTopicCreateOpen(false);
        return;
      }

      if (target.closest(".chat-topic-create-anchor") || target.closest(".chat-topic-create-popup")) {
        return;
      }

      setTopicCreateOpen(false);
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setTopicCreateOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [topicCreateOpen]);

  const handleCreateTopic = async () => {
    const title = newTopicTitle.trim();
    if (!title || creatingTopic) {
      return;
    }

    setCreatingTopic(true);
    try {
      await onCreateTopic(title);
      setNewTopicTitle("");
      setTopicCreateOpen(false);
    } finally {
      setCreatingTopic(false);
    }
  };

  const handleCreateTopicSubmit = (event: FormEvent) => {
    event.preventDefault();
    void handleCreateTopic();
  };

  return {
    topicCreatePopupRef,
    newTopicTitle,
    setNewTopicTitle,
    topicCreateOpen,
    setTopicCreateOpen,
    creatingTopic,
    handleCreateTopicSubmit
  };
}
