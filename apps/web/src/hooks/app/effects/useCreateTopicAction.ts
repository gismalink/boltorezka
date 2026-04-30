// Purpose: encapsulate topic creation side effects (API + local optimistic state + toasts).
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { api } from "../../../api";
import type { RoomTopic } from "../../../domain";
import { asTrimmedString } from "../../../utils/stringUtils";

type UseCreateTopicActionArgs = {
  token: string;
  activeChatRoomId: string;
  setChatTopics: Dispatch<SetStateAction<RoomTopic[]>>;
  setActiveChatTopicId: Dispatch<SetStateAction<string | null>>;
  pushToast: (message: string) => void;
  pushLog: (text: string) => void;
  t: (key: string) => string;
};

export function useCreateTopicAction({
  token,
  activeChatRoomId,
  setChatTopics,
  setActiveChatTopicId,
  pushToast,
  pushLog,
  t
}: UseCreateTopicActionArgs) {
  return useCallback(async (title: string) => {
    const tokenValue = asTrimmedString(token);
    const roomId = asTrimmedString(activeChatRoomId);
    const nextTitle = asTrimmedString(title);

    if (!tokenValue || !roomId || !nextTitle) {
      return;
    }

    try {
      const response = await api.createRoomTopic(tokenValue, roomId, { title: nextTitle });
      const created = response.topic;

      setChatTopics((prev) => {
        const deduped = prev.filter((topic) => topic.id !== created.id);
        const next = [...deduped, created];
        next.sort((a, b) => a.position - b.position);
        return next;
      });

      setActiveChatTopicId(created.id);
      pushToast(t("chat.createTopicSuccess"));
    } catch (error) {
      pushLog(`create topic failed: ${(error as Error).message}`);
      pushToast(t("chat.createTopicError"));
      throw error;
    }
  }, [activeChatRoomId, pushLog, pushToast, setActiveChatTopicId, setChatTopics, t, token]);
}
