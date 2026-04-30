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

describe("buildTopicLists — sorting", () => {
  it("pinned topics come first regardless of position", () => {
    const topics = [
      topic({ id: "a", isPinned: false, position: 0, title: "A" }),
      topic({ id: "b", isPinned: true, position: 99, title: "B" })
    ];
    const result = buildTopicLists({
      topics,
      activeTopicId: null,
      topicFilterMode: "all",
      currentUserId: "u1",
      getTopicUnreadCount: () => 0,
      topicPaletteQuery: ""
    });
    expect(result.sortedTopics.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("sorts by position when pinned status equal", () => {
    const topics = [
      topic({ id: "a", position: 5, title: "Z" }),
      topic({ id: "b", position: 1, title: "A" })
    ];
    const result = buildTopicLists({
      topics,
      activeTopicId: null,
      topicFilterMode: "all",
      currentUserId: "u1",
      getTopicUnreadCount: () => 0,
      topicPaletteQuery: ""
    });
    expect(result.sortedTopics.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("sorts by title locale when pinned and position equal", () => {
    const topics = [
      topic({ id: "a", title: "Banana" }),
      topic({ id: "b", title: "Apple" })
    ];
    const result = buildTopicLists({
      topics,
      activeTopicId: null,
      topicFilterMode: "all",
      currentUserId: "u1",
      getTopicUnreadCount: () => 0,
      topicPaletteQuery: ""
    });
    expect(result.sortedTopics.map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("buildTopicLists — filter modes", () => {
  const make = (mode: Parameters<typeof buildTopicLists>[0]["topicFilterMode"], extras: Partial<Parameters<typeof buildTopicLists>[0]> = {}) =>
    buildTopicLists({
      topics: [
        topic({ id: "a", archivedAt: "2026-01-01T00:00:00.000Z", createdBy: "u1", isPinned: true, mentionUnreadCount: 1 }),
        topic({ id: "b", createdBy: "u2", unreadCount: 2 }),
        topic({ id: "c", createdBy: "u1", isPinned: false })
      ],
      activeTopicId: null,
      topicFilterMode: mode,
      currentUserId: "u1",
      getTopicUnreadCount: (t) => t.unreadCount,
      topicPaletteQuery: "",
      ...extras
    });

  it("active mode excludes archived", () => {
    expect(make("active").filteredTopics.map((t) => t.id)).toEqual(["b", "c"]);
  });

  it("my mode keeps only currentUser-owned topics", () => {
    expect(make("my").filteredTopics.map((t) => t.id).sort()).toEqual(["a", "c"]);
  });

  it("my mode is empty when no currentUserId", () => {
    expect(make("my", { currentUserId: null }).filteredTopics).toEqual([]);
  });

  it("mentions mode keeps topics with mentionUnreadCount>0", () => {
    expect(make("mentions").filteredTopics.map((t) => t.id)).toEqual(["a"]);
  });

  it("pinned mode keeps only pinned", () => {
    expect(make("pinned").filteredTopics.map((t) => t.id)).toEqual(["a"]);
  });

  it("archived mode keeps only archived (default branch)", () => {
    expect(make("archived").filteredTopics.map((t) => t.id)).toEqual(["a"]);
  });

  it("all mode returns sortedTopics as-is", () => {
    expect(make("all").filteredTopics.length).toBe(3);
  });
});

describe("buildTopicLists — palette query", () => {
  it("empty query returns sortedTopics", () => {
    const topics = [topic({ id: "a", title: "Foo" }), topic({ id: "b", title: "Bar" })];
    const out = buildTopicLists({
      topics,
      activeTopicId: null,
      topicFilterMode: "all",
      currentUserId: null,
      getTopicUnreadCount: () => 0,
      topicPaletteQuery: "   "
    });
    expect(out.filteredTopicsForPalette.length).toBe(2);
  });

  it("filters by case-insensitive substring", () => {
    const topics = [topic({ id: "a", title: "Hello World" }), topic({ id: "b", title: "Foo" })];
    const out = buildTopicLists({
      topics,
      activeTopicId: null,
      topicFilterMode: "all",
      currentUserId: null,
      getTopicUnreadCount: () => 0,
      topicPaletteQuery: "WORLD"
    });
    expect(out.filteredTopicsForPalette.map((t) => t.id)).toEqual(["a"]);
  });
});

describe("buildTopicLists — topicsForSelector", () => {
  it("equals filteredTopics when no activeTopicId", () => {
    const topics = [topic({ id: "a" }), topic({ id: "b" })];
    const out = buildTopicLists({
      topics,
      activeTopicId: null,
      topicFilterMode: "all",
      currentUserId: null,
      getTopicUnreadCount: () => 0,
      topicPaletteQuery: ""
    });
    expect(out.topicsForSelector).toEqual(out.filteredTopics);
  });

  it("returns filteredTopics when active topic does not exist anywhere", () => {
    const topics = [topic({ id: "a" })];
    const out = buildTopicLists({
      topics,
      activeTopicId: "missing",
      topicFilterMode: "all",
      currentUserId: null,
      getTopicUnreadCount: () => 0,
      topicPaletteQuery: ""
    });
    expect(out.topicsForSelector.map((t) => t.id)).toEqual(["a"]);
  });
});
