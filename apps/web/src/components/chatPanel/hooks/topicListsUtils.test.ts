import { describe, expect, it } from "vitest";
import type { RoomTopic } from "../../../domain";
import { buildTopicLists } from "./topicListsUtils";

const topic = (overrides: Partial<RoomTopic>): RoomTopic => ({
  id: "t",
  roomId: "r1",
  createdBy: "u1",
  slug: "topic",
  title: "Topic",
  position: 0,
  isPinned: false,
  archivedAt: null,
  createdAt: "2026-04-07T00:00:00.000Z",
  updatedAt: "2026-04-07T00:00:00.000Z",
  unreadCount: 0,
  mentionUnreadCount: 0,
  ...overrides
});

describe("topicListsUtils", () => {
  it("keeps active topic in selector even if filtered out", () => {
    const topics = [
      topic({ id: "a", title: "A", archivedAt: "2026-04-01T00:00:00.000Z" }),
      topic({ id: "b", title: "B" })
    ];

    const result = buildTopicLists({
      topics,
      activeTopicId: "a",
      topicFilterMode: "active",
      currentUserId: "u1",
      getTopicUnreadCount: (t) => t.unreadCount,
      topicPaletteQuery: ""
    });

    expect(result.topicsForSelector[0]?.id).toBe("a");
  });

  it("filters unread topics", () => {
    const topics = [
      topic({ id: "a", unreadCount: 0 }),
      topic({ id: "b", unreadCount: 3 })
    ];

    const result = buildTopicLists({
      topics,
      activeTopicId: null,
      topicFilterMode: "unread",
      currentUserId: "u1",
      getTopicUnreadCount: (t) => t.unreadCount,
      topicPaletteQuery: ""
    });

    expect(result.filteredTopics.map((item) => item.id)).toEqual(["b"]);
  });
});
