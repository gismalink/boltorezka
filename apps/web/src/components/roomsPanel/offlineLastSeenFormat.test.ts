import { describe, expect, it } from "vitest";
import { formatOfflineLastSeen } from "./offlineLastSeenFormat";

describe("formatOfflineLastSeen", () => {
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;
  const monthMs = 30 * dayMs;
  const yearMs = 365 * dayMs;

  it("formats minutes", () => {
    expect(formatOfflineLastSeen(1)).toBe("1мин");
    expect(formatOfflineLastSeen(59 * minuteMs)).toBe("59мин");
  });

  it("formats hours", () => {
    expect(formatOfflineLastSeen(hourMs)).toBe("1ч");
    expect(formatOfflineLastSeen(23 * hourMs)).toBe("23ч");
  });

  it("formats days", () => {
    expect(formatOfflineLastSeen(dayMs)).toBe("1д");
    expect(formatOfflineLastSeen(6 * dayMs)).toBe("6д");
  });

  it("formats weeks", () => {
    expect(formatOfflineLastSeen(weekMs)).toBe("1нед");
    expect(formatOfflineLastSeen(4 * weekMs)).toBe("4нед");
  });

  it("formats months", () => {
    expect(formatOfflineLastSeen(monthMs)).toBe("1мес");
    expect(formatOfflineLastSeen(11 * monthMs)).toBe("11мес");
  });

  it("formats years", () => {
    expect(formatOfflineLastSeen(yearMs)).toBe("1г");
    expect(formatOfflineLastSeen(3 * yearMs)).toBe("3г");
  });
});