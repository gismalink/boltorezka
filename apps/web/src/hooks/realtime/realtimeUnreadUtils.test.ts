import { describe, expect, it } from "vitest";
import type { RoomTopic } from "../../domain";
import { decrementUnreadValue, getTopicReadDeltas } from "./realtimeUnreadUtils";

function topic(overrides: Partial<RoomTopic>): RoomTopic {
  return {
    id: "topic-1",
    roomId: "room-1",
    slug: "topic-1",
    title: "Topic",
    position: 0,
    isPinned: false,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    unreadCount: 0,
    mentionUnreadCount: 0,
    createdBy: null,
    ...overrides
  };
}

describe("realtimeUnreadUtils", () => {
  it("returns zero deltas when topic is missing", () => {
    expect(getTopicReadDeltas([], "topic-1")).toEqual({
      topicFound: false,
      unreadDelta: 0,
      mentionDelta: 0
    });
  });

  it("returns topic read deltas for existing topic", () => {
    const topics = [topic({ id: "topic-2", unreadCount: 3, mentionUnreadCount: 2 })];
    expect(getTopicReadDeltas(topics, "topic-2")).toEqual({
      topicFound: true,
      unreadDelta: 3,
      mentionDelta: 2
    });
  });

  it("decrements unread by delta and clamps to zero", () => {
    expect(decrementUnreadValue(5, 2)).toBe(3);
    expect(decrementUnreadValue(2, 8)).toBe(0);
  });

  it("does not change value when delta is zero", () => {
    expect(decrementUnreadValue(7, 0)).toBe(7);
  });
});
