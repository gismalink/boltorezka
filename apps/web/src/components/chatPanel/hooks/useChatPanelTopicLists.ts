import { useMemo } from "react";
import type { RoomTopic } from "../../../domain";

type TopicFilterMode = "all" | "active" | "unread" | "my" | "mentions" | "pinned" | "archived";

type UseChatPanelTopicListsArgs = {
  topics: RoomTopic[];
  activeTopicId: string | null;
  topicFilterMode: TopicFilterMode;
  currentUserId: string | null;
  getTopicUnreadCount: (topic: RoomTopic) => number;
  topicPaletteQuery: string;
};

export function useChatPanelTopicLists({
  topics,
  activeTopicId,
  topicFilterMode,
  currentUserId,
  getTopicUnreadCount,
  topicPaletteQuery
}: UseChatPanelTopicListsArgs) {
  const sortedTopics = useMemo(() => {
    return [...topics].sort((a, b) => {
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
  }, [topics]);

  const filteredTopics = useMemo(() => {
    if (topicFilterMode === "all") {
      return sortedTopics;
    }

    if (topicFilterMode === "active") {
      return sortedTopics.filter((topic) => !topic.archivedAt);
    }

    if (topicFilterMode === "unread") {
      return sortedTopics.filter((topic) => getTopicUnreadCount(topic) > 0);
    }

    if (topicFilterMode === "my") {
      const normalizedUserId = String(currentUserId || "").trim();
      if (!normalizedUserId) {
        return [];
      }

      return sortedTopics.filter((topic) => String(topic.createdBy || "").trim() === normalizedUserId);
    }

    if (topicFilterMode === "mentions") {
      return sortedTopics.filter((topic) => Math.max(0, Number(topic.mentionUnreadCount || 0)) > 0);
    }

    if (topicFilterMode === "pinned") {
      return sortedTopics.filter((topic) => Boolean(topic.isPinned));
    }

    return sortedTopics.filter((topic) => Boolean(topic.archivedAt));
  }, [sortedTopics, topicFilterMode, getTopicUnreadCount, currentUserId]);

  const topicsForSelector = useMemo(() => {
    if (!activeTopicId) {
      return filteredTopics;
    }

    const hasActiveInFiltered = filteredTopics.some((topic) => topic.id === activeTopicId);
    if (hasActiveInFiltered) {
      return filteredTopics;
    }

    const activeTopicFromAll = sortedTopics.find((topic) => topic.id === activeTopicId);
    if (!activeTopicFromAll) {
      return filteredTopics;
    }

    return [activeTopicFromAll, ...filteredTopics];
  }, [activeTopicId, filteredTopics, sortedTopics]);

  const filteredTopicsForPalette = useMemo(() => {
    const query = topicPaletteQuery.trim().toLowerCase();
    if (!query) {
      return sortedTopics;
    }

    return sortedTopics.filter((topic) => topic.title.toLowerCase().includes(query));
  }, [sortedTopics, topicPaletteQuery]);

  return {
    sortedTopics,
    filteredTopics,
    topicsForSelector,
    filteredTopicsForPalette
  };
}
