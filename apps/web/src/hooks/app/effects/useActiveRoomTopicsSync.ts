import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { api } from "../../../api";
import type { RoomTopic } from "../../../domain";

type UseActiveRoomTopicsSyncArgs = {
  token: string;
  activeChatRoomId: string;
  activeChatRoomSlug: string;
  activeChatTopicId: string | null;
  setActiveChatTopicId: Dispatch<SetStateAction<string | null>>;
  setChatTopics: Dispatch<SetStateAction<RoomTopic[]>>;
  pushLog: (text: string) => void;
};

export function useActiveRoomTopicsSync({
  token,
  activeChatRoomId,
  activeChatRoomSlug,
  activeChatTopicId,
  setActiveChatTopicId,
  setChatTopics,
  pushLog
}: UseActiveRoomTopicsSyncArgs) {
  const topicIdByRoomSlugRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const roomSlug = String(activeChatRoomSlug || "").trim();
    const topicId = String(activeChatTopicId || "").trim();
    if (!roomSlug || !topicId) {
      return;
    }

    topicIdByRoomSlugRef.current = {
      ...topicIdByRoomSlugRef.current,
      [roomSlug]: topicId
    };
  }, [activeChatRoomSlug, activeChatTopicId]);

  useEffect(() => {
    const tokenValue = String(token || "").trim();
    const roomId = String(activeChatRoomId || "").trim();
    const roomSlug = String(activeChatRoomSlug || "").trim();

    if (!tokenValue || !roomSlug) {
      setChatTopics([]);
      setActiveChatTopicId(null);
      return;
    }

    // During room switch there may be a brief render where roomId is not yet resolved.
    // Keep the previous topics/topic selection to avoid flashing an empty timeline.
    if (!roomId) {
      return;
    }

    let cancelled = false;

    api.roomTopics(tokenValue, roomId)
      .then((response) => {
        if (cancelled) {
          return;
        }

        const topics = Array.isArray(response.topics) ? response.topics : [];
        setChatTopics(topics);

        setActiveChatTopicId((prev) => {
          const preferred = String(prev || "").trim();
          const stillExists = preferred && topics.some((topic) => topic.id === preferred);
          if (stillExists) {
            return preferred;
          }

          const rememberedTopicId = String(topicIdByRoomSlugRef.current[roomSlug] || "").trim();
          const rememberedStillExists = rememberedTopicId && topics.some((topic) => topic.id === rememberedTopicId);
          if (rememberedStillExists) {
            return rememberedTopicId;
          }

          const firstActiveTopic = topics.find((topic) => !topic.archivedAt) || topics[0] || null;
          return firstActiveTopic?.id || null;
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        pushLog(`topics failed: ${(error as Error).message}`);
        // Keep current topics/topic on transient failures; next successful sync will refresh state.
      });

    return () => {
      cancelled = true;
    };
  }, [
    token,
    activeChatRoomId,
    activeChatRoomSlug,
    pushLog,
    setActiveChatTopicId,
    setChatTopics
  ]);
}
