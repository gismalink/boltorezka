import { describe, expect, it } from "vitest";
import { formatDateSeparatorLabel, shouldShowDateDivider, toLocalDateKey } from "./chatTimelineUtils";

describe("chatTimelineUtils", () => {
  it("builds stable local date key", () => {
    expect(toLocalDateKey("2026-04-07T12:30:00.000Z")).not.toBe("");
    expect(toLocalDateKey("invalid")).toBe("");
  });

  it("decides date divider visibility by day boundary", () => {
    expect(shouldShowDateDivider(null, "2026-04-07T10:00:00.000Z")).toBe(true);
    expect(shouldShowDateDivider("2026-04-07T09:00:00.000Z", "2026-04-07T11:00:00.000Z")).toBe(false);
    expect(shouldShowDateDivider("2026-04-06T12:00:00.000Z", "2026-04-07T12:00:00.000Z")).toBe(true);
  });

  it("formats readable date separator label", () => {
    const label = formatDateSeparatorLabel("2026-04-07T10:00:00.000Z", "ru-RU");
    expect(label.length).toBeGreaterThan(0);
    expect(formatDateSeparatorLabel("invalid", "ru-RU")).toBe("");
  });
});
