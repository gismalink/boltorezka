import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isRoomUnreadWsBumpFresh, markRoomUnreadWsBump } from "./roomUnreadWsBumpTracker";

describe("roomUnreadWsBumpTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false for slug that was never bumped", () => {
    expect(isRoomUnreadWsBumpFresh("never-bumped-slug")).toBe(false);
  });

  it("returns false for empty/whitespace slug", () => {
    expect(isRoomUnreadWsBumpFresh("")).toBe(false);
    expect(isRoomUnreadWsBumpFresh("   ")).toBe(false);
    markRoomUnreadWsBump("   ");
    expect(isRoomUnreadWsBumpFresh("anything")).toBe(false);
  });

  it("returns true immediately after a bump", () => {
    markRoomUnreadWsBump("room-a");
    expect(isRoomUnreadWsBumpFresh("room-a")).toBe(true);
  });

  it("normalizes whitespace consistently between mark and check", () => {
    markRoomUnreadWsBump("  room-b  ");
    expect(isRoomUnreadWsBumpFresh("room-b")).toBe(true);
  });

  it("returns true within the 60s guard window", () => {
    markRoomUnreadWsBump("room-c");
    vi.advanceTimersByTime(59_999);
    expect(isRoomUnreadWsBumpFresh("room-c")).toBe(true);
  });

  it("returns false after the 60s guard window expires", () => {
    markRoomUnreadWsBump("room-d");
    vi.advanceTimersByTime(60_001);
    expect(isRoomUnreadWsBumpFresh("room-d")).toBe(false);
  });

  it("does not affect unrelated slugs", () => {
    markRoomUnreadWsBump("room-e");
    expect(isRoomUnreadWsBumpFresh("room-f")).toBe(false);
  });
});
