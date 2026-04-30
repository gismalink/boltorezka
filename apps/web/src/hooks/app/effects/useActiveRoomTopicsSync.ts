import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { api } from "../../../api";
import type { RoomTopic } from "../../../domain";
import { asTrimmedString } from "../../../utils/stringUtils";

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
  const roomTopicIdsBySlugRef = useRef<Record<string, Set<string>>>({});

  useEffect(() => {
    const roomSlug = asTrimmedString(activeChatRoomSlug);
    const topicId = asTrimmedString(activeChatTopicId);
    if (!roomSlug || !topicId) {
      return;
    }

    const knownTopicIds = roomTopicIdsBySlugRef.current[roomSlug];
    if (!knownTopicIds || !knownTopicIds.has(topicId)) {
      return;
    }

    topicIdByRoomSlugRef.current = {
      ...topicIdByRoomSlugRef.current,
      [roomSlug]: topicId
    };
  }, [activeChatRoomSlug, activeChatTopicId]);

  useEffect(() => {
    const tokenValue = asTrimmedString(token);
    const roomId = asTrimmedString(activeChatRoomId);
    const roomSlug = asTrimmedString(activeChatRoomSlug);

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
        roomTopicIdsBySlugRef.current = {
          ...roomTopicIdsBySlugRef.current,
          [roomSlug]: new Set(topics.map((topic) => asTrimmedString(topic.id)).filter(Boolean))
        };
        setChatTopics(topics);

        setActiveChatTopicId((prev) => {
          const preferred = asTrimmedString(prev);
          const stillExists = preferred && topics.some((topic) => topic.id === preferred);
          if (stillExists) {
            return preferred;
          }

          const rememberedTopicId = asTrimmedString(topicIdByRoomSlugRef.current[roomSlug]);
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
