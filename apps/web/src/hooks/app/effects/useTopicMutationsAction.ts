import { useCallback, type Dispatch, type SetStateAction } from "react";
import { api } from "../../../api";
import type { RoomTopic } from "../../../domain";
import { asTrimmedString } from "../../../utils/stringUtils";

type UseTopicMutationsActionArgs = {
  token: string;
  setChatTopics: Dispatch<SetStateAction<RoomTopic[]>>;
};

export function useTopicMutationsAction({ token, setChatTopics }: UseTopicMutationsActionArgs) {
  const updateTopic = useCallback(async (topicId: string, title: string) => {
    const normalizedToken = asTrimmedString(token);
    if (!normalizedToken || !topicId) {
      return;
    }

    const response = await api.updateTopic(normalizedToken, topicId, { title });
    setChatTopics((prev) =>
      prev.map((topic) => (topic.id === topicId ? { ...topic, title: response.topic.title, updatedAt: response.topic.updatedAt } : topic))
    );
  }, [token, setChatTopics]);

  const archiveTopic = useCallback(async (topicId: string) => {
    const normalizedToken = asTrimmedString(token);
    if (!normalizedToken || !topicId) {
      return;
    }

    const response = await api.archiveTopic(normalizedToken, topicId);
    setChatTopics((prev) =>
      prev.map((topic) => (topic.id === topicId ? { ...topic, archivedAt: response.topic.archivedAt, updatedAt: response.topic.updatedAt } : topic))
    );
  }, [token, setChatTopics]);

  const unarchiveTopic = useCallback(async (topicId: string) => {
    const normalizedToken = asTrimmedString(token);
    if (!normalizedToken || !topicId) {
      return;
    }

    const response = await api.unarchiveTopic(normalizedToken, topicId);
    setChatTopics((prev) =>
      prev.map((topic) => (topic.id === topicId ? { ...topic, archivedAt: response.topic.archivedAt ?? null, updatedAt: response.topic.updatedAt } : topic))
    );
  }, [token, setChatTopics]);

  const deleteTopic = useCallback(async (topicId: string) => {
    const normalizedToken = asTrimmedString(token);
    if (!normalizedToken || !topicId) {
      return;
    }

    await api.deleteTopic(normalizedToken, topicId);
    setChatTopics((prev) => prev.filter((topic) => topic.id !== topicId));
  }, [token, setChatTopics]);

  return {
    updateTopic,
    archiveTopic,
    unarchiveTopic,
    deleteTopic
  };
}