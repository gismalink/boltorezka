// Хук списков тем чата: сортирует и фильтрует темы для разных режимов UI.
import { useMemo } from "react";
import type { RoomTopic } from "../../../domain";
import { buildTopicLists, type TopicFilterMode } from "./topicListsUtils";

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
  const { sortedTopics, filteredTopics, topicsForSelector, filteredTopicsForPalette } = useMemo(() => buildTopicLists({
    topics,
    activeTopicId,
    topicFilterMode,
    currentUserId,
    getTopicUnreadCount,
    topicPaletteQuery
  }), [activeTopicId, currentUserId, getTopicUnreadCount, topicFilterMode, topicPaletteQuery, topics]);

  return {
    sortedTopics,
    filteredTopics,
    topicsForSelector,
    filteredTopicsForPalette
  };
}
