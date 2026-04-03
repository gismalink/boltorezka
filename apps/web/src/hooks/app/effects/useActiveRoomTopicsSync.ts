import { useEffect, type Dispatch, type SetStateAction } from "react";
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
  setActiveChatTopicId,
  setChatTopics,
  pushLog
}: UseActiveRoomTopicsSyncArgs) {
  useEffect(() => {
    const tokenValue = String(token || "").trim();
    const roomId = String(activeChatRoomId || "").trim();

    if (!tokenValue || !roomId) {
      setChatTopics([]);
      setActiveChatTopicId(null);
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

          const firstActiveTopic = topics.find((topic) => !topic.archivedAt) || topics[0] || null;
          return firstActiveTopic?.id || null;
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        pushLog(`topics failed: ${(error as Error).message}`);
        setChatTopics([]);
        setActiveChatTopicId(null);
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
