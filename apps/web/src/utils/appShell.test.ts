import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_UI_THEME,
  formatBuildDateLabel,
  normalizeUiTheme,
  readNonZeroDefaultVolume
} from "./appShell";

describe("formatBuildDateLabel", () => {
  it("formats version with 6-digit time", () => {
    expect(formatBuildDateLabel("1.0.0+20260430.123456", "")).toBe("v.26.04.30.12.34.56");
  });

  it("formats version with 4-digit time (no seconds)", () => {
    expect(formatBuildDateLabel("1.0.0+20260430.1234", "")).toBe("v.26.04.30.12.34");
  });

  it("falls back to ISO build date when version has no timestamp", () => {
    expect(formatBuildDateLabel("dev", "2026-04-30")).toBe("v.26.04.30");
  });

  it("returns generic v.<date> when buildDate is non-ISO non-empty", () => {
    expect(formatBuildDateLabel("dev", "abc")).toBe("v.abc");
  });

  it("returns empty string when both inputs are empty", () => {
    expect(formatBuildDateLabel("", "")).toBe("");
    expect(formatBuildDateLabel(null as unknown as string, undefined as unknown as string)).toBe("");
  });
});

describe("normalizeUiTheme", () => {
  it("returns the value when it is one of the supported themes", () => {
    expect(normalizeUiTheme("material-classic")).toBe("material-classic");
    expect(normalizeUiTheme("aka-dis")).toBe("aka-dis");
    expect(normalizeUiTheme("alpha-strike")).toBe("alpha-strike");
  });

  it("returns DEFAULT_UI_THEME for unknown / falsy values", () => {
    expect(normalizeUiTheme("unknown")).toBe(DEFAULT_UI_THEME);
    expect(normalizeUiTheme("")).toBe(DEFAULT_UI_THEME);
    expect(normalizeUiTheme(null)).toBe(DEFAULT_UI_THEME);
    expect(normalizeUiTheme(undefined)).toBe(DEFAULT_UI_THEME);
    expect(normalizeUiTheme(42)).toBe(DEFAULT_UI_THEME);
  });
});

describe("readNonZeroDefaultVolume", () => {
  const KEY = "test-volume-key";
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = String(v); },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { store = {}; },
      key: () => null,
      length: 0
    } as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns fallback when key is missing", () => {
    expect(readNonZeroDefaultVolume(KEY, 50)).toBe(50);
  });

  it("returns fallback when stored value is empty/whitespace", () => {
    store[KEY] = "   ";
    expect(readNonZeroDefaultVolume(KEY, 30)).toBe(30);
  });

  it("returns fallback when stored value is non-numeric", () => {
    store[KEY] = "abc";
    expect(readNonZeroDefaultVolume(KEY, 25)).toBe(25);
  });

  it("returns fallback when normalized value is 0", () => {
    store[KEY] = "0";
    expect(readNonZeroDefaultVolume(KEY, 40)).toBe(40);
  });

  it("clamps values to [0, 100] range", () => {
    store[KEY] = "150";
    expect(readNonZeroDefaultVolume(KEY, 50)).toBe(100);
    store[KEY] = "-10";
    expect(readNonZeroDefaultVolume(KEY, 50)).toBe(50); // -10 clamps to 0 → falls back
  });

  it("returns rounded valid values", () => {
    store[KEY] = "42.7";
    expect(readNonZeroDefaultVolume(KEY, 10)).toBe(43);
  });
});
