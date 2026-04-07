import { describe, expect, it } from "vitest";
import { buildRoomsPanelDerivedData, OUTSIDE_ROOMS_PRESENCE_KEY } from "./roomsPanelDerivedDataUtils";

describe("roomsPanelDerivedDataUtils", () => {
  it("counts unread by category and uncategorized", () => {
    const result = buildRoomsPanelDerivedData({
      roomsTree: {
        categories: [{ id: "cat-1", slug: "c1", title: "C1", position: 0, created_at: "", channels: [{ id: "r1", slug: "room-1", title: "R1", kind: "text", category_id: "cat-1", position: 0, is_public: true, created_at: "" }] }],
        uncategorized: []
      },
      uncategorizedRooms: [{ id: "r2", slug: "room-2", title: "R2", kind: "text", category_id: null, position: 0, is_public: true, created_at: "" }],
      archivedRooms: [],
      roomUnreadBySlug: { "room-1": 3, "room-2": 2 },
      roomMentionUnreadBySlug: { "room-1": 1, "room-2": 4 },
      roomMutePresetByRoomId: { "r1": "off" },
      liveRoomMembersBySlug: {},
      liveRoomMemberDetailsBySlug: {}
    });

    expect(result.uncategorizedUnreadCount).toBe(2);
    expect(result.uncategorizedMentionCount).toBe(4);
    expect(result.categoryMentionById["cat-1"]).toBe(1);
    expect(result.categoryUnreadUnmutedById["cat-1"]).toBe(3);
  });

  it("keeps outside bucket members outside and deduplicates", () => {
    const result = buildRoomsPanelDerivedData({
      roomsTree: {
        categories: [],
        uncategorized: []
      },
      uncategorizedRooms: [],
      archivedRooms: [],
      roomUnreadBySlug: { [OUTSIDE_ROOMS_PRESENCE_KEY]: 1 },
      roomMentionUnreadBySlug: {},
      roomMutePresetByRoomId: {},
      liveRoomMembersBySlug: { [OUTSIDE_ROOMS_PRESENCE_KEY]: ["alex", "alex"] },
      liveRoomMemberDetailsBySlug: {}
    });

    expect(result.onlineOutsideRooms.length).toBe(1);
    expect(result.outsideRoomsUnreadCount).toBe(1);
  });
});
