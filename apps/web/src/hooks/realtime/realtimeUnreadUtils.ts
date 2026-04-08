import type { RoomTopic } from "../../domain";

export type TopicReadDeltas = {
  topicFound: boolean;
  unreadDelta: number;
  mentionDelta: number;
};

export function getTopicReadDeltas(topics: RoomTopic[], topicId: string): TopicReadDeltas {
  const normalizedTopicId = String(topicId || "").trim();
  if (!normalizedTopicId) {
    return {
      topicFound: false,
      unreadDelta: 0,
      mentionDelta: 0
    };
  }

  const topic = topics.find((item) => item.id === normalizedTopicId);
  if (!topic) {
    return {
      topicFound: false,
      unreadDelta: 0,
      mentionDelta: 0
    };
  }

  return {
    topicFound: true,
    unreadDelta: Math.max(0, Number(topic.unreadCount || 0)),
    mentionDelta: Math.max(0, Number(topic.mentionUnreadCount || 0))
  };
}

export function decrementUnreadValue(currentValue: number, delta: number): number {
  const normalizedCurrentValue = Math.max(0, Number(currentValue || 0));
  const normalizedDelta = Math.max(0, Number(delta || 0));
  if (normalizedDelta <= 0) {
    return normalizedCurrentValue;
  }

  return Math.max(0, normalizedCurrentValue - normalizedDelta);
}
