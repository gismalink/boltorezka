import { describe, expect, it } from "vitest";
import type { PresenceMember, Room, RoomCategory, RoomsTreeResponse } from "../../domain";
import {
  buildRoomsPanelDerivedData,
  OUTSIDE_ROOMS_PRESENCE_KEY
} from "./roomsPanelDerivedDataUtils";

const room = (overrides: Partial<Room> = {}): Room => ({
  id: "r-id",
  slug: "r-slug",
  title: "Room",
  kind: "text",
  category_id: null,
  position: 0,
  is_public: true,
  created_at: "2026-04-01T00:00:00.000Z",
  ...overrides
});

const category = (overrides: Partial<RoomCategory> & { channels: Room[] }): RoomCategory & { channels: Room[] } => ({
  id: "c1",
  slug: "cat",
  title: "Cat",
  position: 0,
  created_at: "2026-04-01T00:00:00.000Z",
  ...overrides
});

const member = (userId: string, userName?: string): PresenceMember => ({ userId, userName: userName || userId });

const baseInput = () => ({
  roomsTree: null as RoomsTreeResponse | null,
  uncategorizedRooms: [] as Room[],
  archivedRooms: [] as Room[],
  roomUnreadBySlug: {} as Record<string, number>,
  roomMentionUnreadBySlug: {} as Record<string, number>,
  roomMutePresetByRoomId: {} as Record<string, "1h" | "8h" | "24h" | "forever" | "off">,
  liveRoomMembersBySlug: {} as Record<string, string[]>,
  liveRoomMemberDetailsBySlug: {} as Record<string, PresenceMember[]>
});

describe("buildRoomsPanelDerivedData — uncategorized counters (extended)", () => {
  it("ignores rooms with empty slug", () => {
    const input = baseInput();
    input.uncategorizedRooms = [room({ slug: "  " }), room({ slug: "x" })];
    input.roomUnreadBySlug = { x: 4 };
    expect(buildRoomsPanelDerivedData(input).uncategorizedUnreadCount).toBe(4);
  });

  it("clamps negative unread to 0", () => {
    const input = baseInput();
    input.uncategorizedRooms = [room({ slug: "x" })];
    input.roomUnreadBySlug = { x: -10 };
    expect(buildRoomsPanelDerivedData(input).uncategorizedUnreadCount).toBe(0);
  });

  it("treats absent preset as unmuted", () => {
    const input = baseInput();
    input.uncategorizedRooms = [room({ id: "r1", slug: "x" })];
    input.roomUnreadBySlug = { x: 7 };
    const out = buildRoomsPanelDerivedData(input);
    expect(out.uncategorizedUnreadMutedCount).toBe(0);
    expect(out.uncategorizedUnreadUnmutedCount).toBe(7);
  });

  it("preset='off' counts as unmuted", () => {
    const input = baseInput();
    input.uncategorizedRooms = [room({ id: "r1", slug: "x" })];
    input.roomUnreadBySlug = { x: 7 };
    input.roomMutePresetByRoomId = { r1: "off" };
    const out = buildRoomsPanelDerivedData(input);
    expect(out.uncategorizedUnreadMutedCount).toBe(0);
    expect(out.uncategorizedUnreadUnmutedCount).toBe(7);
  });

  it("non-off presets all count as muted", () => {
    const input = baseInput();
    input.uncategorizedRooms = [
      room({ id: "r1", slug: "a" }),
      room({ id: "r2", slug: "b" }),
      room({ id: "r3", slug: "c" }),
      room({ id: "r4", slug: "d" })
    ];
    input.roomUnreadBySlug = { a: 1, b: 2, c: 3, d: 4 };
    input.roomMutePresetByRoomId = { r1: "1h", r2: "8h", r3: "24h", r4: "forever" };
    const out = buildRoomsPanelDerivedData(input);
    expect(out.uncategorizedUnreadMutedCount).toBe(10);
    expect(out.uncategorizedUnreadUnmutedCount).toBe(0);
  });
});

describe("buildRoomsPanelDerivedData — category aggregation (extended)", () => {
  it("falls back to legacy 'rooms' key when 'channels' is absent", () => {
    const input = baseInput();
    const legacy = {
      id: "c1",
      slug: "x",
      title: "X",
      position: 0,
      created_at: "2026-04-01",
      rooms: [room({ id: "r1", slug: "a" })]
    };
    input.roomsTree = {
      categories: [legacy as unknown as RoomCategory & { channels: Room[] }],
      uncategorized: []
    };
    input.roomUnreadBySlug = { a: 4 };
    expect(buildRoomsPanelDerivedData(input).categoryUnreadUnmutedById.c1).toBe(4);
  });

  it("skips categories without an id", () => {
    const input = baseInput();
    input.roomsTree = {
      categories: [category({ id: "  ", channels: [room({ slug: "a" })] })],
      uncategorized: []
    };
    input.roomUnreadBySlug = { a: 5 };
    expect(buildRoomsPanelDerivedData(input).categoryUnreadUnmutedById).toEqual({});
  });

  it("aggregates mentions across multiple categories", () => {
    const input = baseInput();
    input.roomsTree = {
      categories: [
        category({ id: "c1", channels: [room({ id: "r1", slug: "a" }), room({ id: "r2", slug: "b" })] }),
        category({ id: "c2", channels: [room({ id: "r3", slug: "c" })] })
      ],
      uncategorized: []
    };
    input.roomMentionUnreadBySlug = { a: 5, b: 1, c: 3 };
    const out = buildRoomsPanelDerivedData(input);
    expect(out.categoryMentionById).toEqual({ c1: 6, c2: 3 });
  });
});

describe("buildRoomsPanelDerivedData — outside rooms (extended)", () => {
  it("counts unread for slugs not present in known rooms (excluding outside key)", () => {
    const input = baseInput();
    input.uncategorizedRooms = [room({ slug: "known" })];
    input.roomUnreadBySlug = { known: 3, ghost: 7 };
    // 'known' is in knownRoomSlugs and is excluded; 'ghost' is unknown -> counted.
    expect(buildRoomsPanelDerivedData(input).outsideRoomsUnreadCount).toBe(7);
  });

  it("includes OUTSIDE_ROOMS_PRESENCE_KEY unread even if no rooms defined", () => {
    const input = baseInput();
    input.roomUnreadBySlug = { [OUTSIDE_ROOMS_PRESENCE_KEY]: 4 };
    expect(buildRoomsPanelDerivedData(input).outsideRoomsUnreadCount).toBe(4);
  });

  it("collects outside online members from details and dedupes by userId", () => {
    const input = baseInput();
    input.uncategorizedRooms = [room({ slug: "known" })];
    input.liveRoomMemberDetailsBySlug = {
      [OUTSIDE_ROOMS_PRESENCE_KEY]: [member("u1", "Alice"), member("u1", "Alice"), member("u2", "Bob")]
    };
    const out = buildRoomsPanelDerivedData(input);
    expect(out.onlineOutsideRooms.map((m) => m.userId)).toEqual(["u1", "u2"]);
  });

  it("excludes outside member that is a member of any known room", () => {
    const input = baseInput();
    input.uncategorizedRooms = [room({ slug: "known" })];
    input.liveRoomMemberDetailsBySlug = {
      known: [member("u1", "Alice")],
      [OUTSIDE_ROOMS_PRESENCE_KEY]: [member("u1", "Alice"), member("u2", "Bob")]
    };
    expect(
      buildRoomsPanelDerivedData(input).onlineOutsideRooms.map((m) => m.userId)
    ).toEqual(["u2"]);
  });

  it("ignores presence buckets for slugs that are not OUTSIDE_ROOMS_PRESENCE_KEY", () => {
    const input = baseInput();
    input.uncategorizedRooms = [room({ slug: "known" })];
    input.liveRoomMembersBySlug = { known: ["NotOutside"] };
    expect(buildRoomsPanelDerivedData(input).onlineOutsideRooms).toEqual([]);
  });

  it("sorts outside members alphabetically by name", () => {
    const input = baseInput();
    input.uncategorizedRooms = [room({ slug: "known" })];
    input.liveRoomMemberDetailsBySlug = {
      [OUTSIDE_ROOMS_PRESENCE_KEY]: [
        member("u1", "Charlie"),
        member("u2", "Alice"),
        member("u3", "Bob")
      ]
    };
    expect(
      buildRoomsPanelDerivedData(input).onlineOutsideRooms.map((m) => m.userName)
    ).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("includes archived rooms in known slugs (so their unread is not counted as outside)", () => {
    const input = baseInput();
    input.archivedRooms = [room({ slug: "archived" })];
    input.roomUnreadBySlug = { archived: 5 };
    expect(buildRoomsPanelDerivedData(input).outsideRoomsUnreadCount).toBe(0);
  });
});
