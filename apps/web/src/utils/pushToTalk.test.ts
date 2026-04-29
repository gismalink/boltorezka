import { describe, expect, it } from "vitest";
import {
  DEFAULT_PUSH_TO_TALK_HOTKEY,
  formatPushToTalkHotkey,
  normalizePushToTalkHotkey
} from "./pushToTalk";

describe("normalizePushToTalkHotkey", () => {
  it("returns DEFAULT for null/undefined/empty/whitespace", () => {
    expect(normalizePushToTalkHotkey(null)).toBe(DEFAULT_PUSH_TO_TALK_HOTKEY);
    expect(normalizePushToTalkHotkey(undefined)).toBe(DEFAULT_PUSH_TO_TALK_HOTKEY);
    expect(normalizePushToTalkHotkey("")).toBe(DEFAULT_PUSH_TO_TALK_HOTKEY);
    expect(normalizePushToTalkHotkey("   ")).toBe(DEFAULT_PUSH_TO_TALK_HOTKEY);
  });

  it("trims surrounding whitespace", () => {
    expect(normalizePushToTalkHotkey("  KeyA  ")).toBe("KeyA");
  });

  it("returns the value as-is when non-empty", () => {
    expect(normalizePushToTalkHotkey("ShiftLeft")).toBe("ShiftLeft");
  });
});

describe("formatPushToTalkHotkey", () => {
  it("uses overrides for special keys", () => {
    expect(formatPushToTalkHotkey("Space")).toBe("Space");
    expect(formatPushToTalkHotkey("Escape")).toBe("Esc");
    expect(formatPushToTalkHotkey("Backquote")).toBe("`");
    expect(formatPushToTalkHotkey("Slash")).toBe("/");
  });

  it("strips Key prefix for letter keys", () => {
    expect(formatPushToTalkHotkey("KeyA")).toBe("A");
    expect(formatPushToTalkHotkey("KeyZ")).toBe("Z");
  });

  it("strips Digit prefix for number keys", () => {
    expect(formatPushToTalkHotkey("Digit0")).toBe("0");
    expect(formatPushToTalkHotkey("Digit9")).toBe("9");
  });

  it("returns DEFAULT label for empty input", () => {
    expect(formatPushToTalkHotkey("")).toBe("Space");
    expect(formatPushToTalkHotkey(null)).toBe("Space");
  });

  it("returns code as-is for non-overridden / non-prefixed values", () => {
    expect(formatPushToTalkHotkey("ShiftLeft")).toBe("ShiftLeft");
    expect(formatPushToTalkHotkey("F5")).toBe("F5");
  });
});
