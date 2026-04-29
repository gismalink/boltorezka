import { describe, expect, it } from "vitest";
import {
  extractImageSourceFromClipboardText,
  normalizeImageSource
} from "./chatImagePayload";

describe("normalizeImageSource", () => {
  it("returns empty for empty/whitespace input", () => {
    expect(normalizeImageSource("")).toBe("");
    expect(normalizeImageSource("   ")).toBe("");
  });

  it("strips whitespace inside data: URLs", () => {
    const dirty = "data:image/png;base64,AAAA\nBBBB CCCC";
    expect(normalizeImageSource(dirty)).toBe("data:image/png;base64,AAAABBBBCCCC");
  });

  it("trims but does not strip whitespace inside http URLs", () => {
    expect(normalizeImageSource("  https://example.com/a.png  ")).toBe("https://example.com/a.png");
  });
});

describe("extractImageSourceFromClipboardText", () => {
  it("returns empty for empty input", () => {
    expect(extractImageSourceFromClipboardText("")).toBe("");
  });

  it("extracts data: URL from markdown image syntax", () => {
    const md = "Look: ![alt](data:image/png;base64,ABCDEF==)";
    expect(extractImageSourceFromClipboardText(md)).toBe("data:image/png;base64,ABCDEF==");
  });

  it("extracts http URL from markdown image syntax", () => {
    const md = "![](https://example.com/pic.jpg?x=1)";
    expect(extractImageSourceFromClipboardText(md)).toBe("https://example.com/pic.jpg?x=1");
  });

  it("does not match unsupported extensions in markdown", () => {
    const md = "![](https://example.com/pic.tiff)";
    expect(extractImageSourceFromClipboardText(md)).toBe("");
  });

  it("falls back to bare data: URL match", () => {
    const text = "blob:foo data:image/jpeg;base64,XYZ123== trailing";
    expect(extractImageSourceFromClipboardText(text)).toBe("data:image/jpeg;base64,XYZ123==");
  });

  it("returns empty when no image source present", () => {
    expect(extractImageSourceFromClipboardText("hello world")).toBe("");
  });
});
