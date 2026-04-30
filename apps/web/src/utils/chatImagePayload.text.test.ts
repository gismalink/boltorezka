import { describe, expect, it } from "vitest";
import {
  extractImageSourceFromClipboardText,
  normalizeImageSource
} from "./chatImagePayload";

describe("normalizeImageSource", () => {
  it("returns empty string for empty input", () => {
    expect(normalizeImageSource("")).toBe("");
    expect(normalizeImageSource("   ")).toBe("");
    expect(normalizeImageSource(undefined as unknown as string)).toBe("");
  });

  it("removes whitespace from data:image URLs", () => {
    const dirty = "data:image/png;base64,AAAA \n BBBB \t CCCC";
    expect(normalizeImageSource(dirty)).toBe("data:image/png;base64,AAAABBBBCCCC");
  });

  it("preserves regular http URLs (only trim)", () => {
    expect(normalizeImageSource("  https://x.com/a.png  ")).toBe("https://x.com/a.png");
  });
});

describe("extractImageSourceFromClipboardText", () => {
  it("returns empty for empty/non-image text", () => {
    expect(extractImageSourceFromClipboardText("")).toBe("");
    expect(extractImageSourceFromClipboardText("hello world")).toBe("");
    expect(extractImageSourceFromClipboardText(undefined as unknown as string)).toBe("");
  });

  it("extracts data: image URL from markdown image syntax", () => {
    const text = "look ![alt](data:image/png;base64,ABCDEF==) cool";
    expect(extractImageSourceFromClipboardText(text)).toBe("data:image/png;base64,ABCDEF==");
  });

  it("extracts http(s) image URL from markdown when extension matches", () => {
    expect(extractImageSourceFromClipboardText("![](https://x.com/a.png)")).toBe("https://x.com/a.png");
    expect(extractImageSourceFromClipboardText("![](https://x.com/b.JPEG?q=1)")).toBe("https://x.com/b.JPEG?q=1");
  });

  it("falls back to bare data:image URL anywhere in text", () => {
    const text = "prefix data:image/jpeg;base64,XYZ123== suffix";
    expect(extractImageSourceFromClipboardText(text)).toBe("data:image/jpeg;base64,XYZ123==");
  });

  it("normalizes newline whitespace from extracted data URL", () => {
    const text = "data:image/png;base64,AA\nBB\nCC";
    expect(extractImageSourceFromClipboardText(text)).toBe("data:image/png;base64,AABBCC");
  });

  it("ignores http URLs without recognized image extension", () => {
    expect(extractImageSourceFromClipboardText("![](https://x.com/page)")).toBe("");
  });
});
