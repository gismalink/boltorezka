import { describe, expect, it } from "vitest";
import { asTrimmedString, asTrimmedStringOrNull } from "./stringUtils";

describe("asTrimmedString", () => {
  it("returns trimmed string for string input", () => {
    expect(asTrimmedString("  hello  ")).toBe("hello");
    expect(asTrimmedString("hello")).toBe("hello");
    expect(asTrimmedString("")).toBe("");
    expect(asTrimmedString("   ")).toBe("");
  });

  it("returns empty string for non-string input", () => {
    expect(asTrimmedString(null)).toBe("");
    expect(asTrimmedString(undefined)).toBe("");
    expect(asTrimmedString(0)).toBe("");
    expect(asTrimmedString(123)).toBe("");
    expect(asTrimmedString(false)).toBe("");
    expect(asTrimmedString(true)).toBe("");
    expect(asTrimmedString({})).toBe("");
    expect(asTrimmedString([])).toBe("");
    expect(asTrimmedString(Symbol("x"))).toBe("");
  });

  it("does not coerce primitives to their String() representation", () => {
    expect(asTrimmedString(null)).not.toBe("null");
    expect(asTrimmedString(undefined)).not.toBe("undefined");
    expect(asTrimmedString(0)).not.toBe("0");
  });
});

describe("asTrimmedStringOrNull", () => {
  it("returns trimmed string for non-empty string input", () => {
    expect(asTrimmedStringOrNull("  hello  ")).toBe("hello");
    expect(asTrimmedStringOrNull("x")).toBe("x");
  });

  it("returns null for empty / whitespace-only / non-string input", () => {
    expect(asTrimmedStringOrNull("")).toBeNull();
    expect(asTrimmedStringOrNull("   ")).toBeNull();
    expect(asTrimmedStringOrNull(null)).toBeNull();
    expect(asTrimmedStringOrNull(undefined)).toBeNull();
    expect(asTrimmedStringOrNull(42)).toBeNull();
    expect(asTrimmedStringOrNull({})).toBeNull();
  });
});
