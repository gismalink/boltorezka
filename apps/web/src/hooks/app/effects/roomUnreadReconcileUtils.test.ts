import { describe, expect, it } from "vitest";
import { reconcileRoomUnreadValue } from "./roomUnreadReconcileUtils";

describe("roomUnreadReconcileUtils", () => {
  it("keeps current value on cache source", () => {
    expect(reconcileRoomUnreadValue(4, 9, "cache")).toBe(4);
    expect(reconcileRoomUnreadValue(0, 5, "cache")).toBe(0);
  });

  it("uses fetched value on network source", () => {
    expect(reconcileRoomUnreadValue(4, 9, "network")).toBe(9);
    expect(reconcileRoomUnreadValue(7, 0, "network")).toBe(0);
  });

  it("normalizes negative values", () => {
    expect(reconcileRoomUnreadValue(-3, -1, "cache")).toBe(0);
    expect(reconcileRoomUnreadValue(5, -1, "network")).toBe(0);
  });
});
